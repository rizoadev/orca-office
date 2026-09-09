import { getPersonaForSession, getSessionDisplayName, getSubagentPersona, shortSessionSuffix } from './indonesian-names.ts';
import { getOfficeClientIdentity } from './identity.ts';
import { sendOfficeEvent, officeTelemetryTarget, refreshOfficeConfig } from './client.ts';
import {
  DEFAULT_CLOUD_ENDPOINT,
  DEFAULT_LOCAL_ENDPOINT,
  officeHubOrigin,
  readRawOfficeConfig,
  writeOfficeExtensionConfig,
} from './config.ts';
import { getLastPiCliPrompt, summarizePrompt, tailText, extractAssistantVisibleText, extractToolCallName } from '../lib/session-utils.ts';

interface ToolEventPayload {
  toolName: string;
  toolCallId?: string;
  input?: Record<string, any>;
  details?: any;
  isError?: boolean;
}

export default function (pi: any) {
  let currentSessionId = 'sesi_' + Math.random().toString(36).slice(2, 8);
  let currentPersona = getPersonaForSession(currentSessionId);
  let currentDisplayName = getSessionDisplayName(currentPersona, currentSessionId);
  let currentTask = getLastPiCliPrompt(process.cwd(), currentSessionId) || 'Belum ada prompt Pi CLI';
  let currentModel = 'pi-model';
  let liveResponseText = '';
  let liveThinkingChars = 0;
  let lastStreamSentAt = 0;
  let onboardingHintShown = false;
  const activeToolCalls = new Map<string, number>();
  const clientIdentity = getOfficeClientIdentity('pi');

  async function publishLlmStream(kind: 'response' | 'thinking' | 'tool' | 'status', text: string, isFinal = false, force = false) {
    const now = Date.now();
    if (!force && now - lastStreamSentAt < 180) return;
    lastStreamSentAt = now;

    await sendOfficeEvent('llm.stream', {
      session_id: currentSessionId,
      kind,
      text: tailText(text),
      is_final: isFinal
    });
  }

  // Tagihan: Pi sudah menghitung token + cost di setiap assistant message. Sekali kirim
  // per panggilan LLM — server yang merangkumnya jadi bill per pegawai & per menu.
  async function publishUsage(message: any) {
    const usage = message?.usage;
    const totalTokens = Number(usage?.totalTokens) || 0;
    if (!usage || totalTokens <= 0) return;

    const model = typeof message.model === 'string' && message.model ? message.model : currentModel;
    currentModel = model;

    await sendOfficeEvent('session.usage', {
      session_id: currentSessionId,
      model,
      provider: typeof message.provider === 'string' ? message.provider : null,
      input: Number(usage.input) || 0,
      output: Number(usage.output) || 0,
      cache_read: Number(usage.cacheRead) || 0,
      cache_write: Number(usage.cacheWrite) || 0,
      total_tokens: totalTokens,
      reported_cost: Number(usage.cost?.total) || 0,
      created_at: Number(message.timestamp) || Date.now()
    });
  }

  // 1. Hook: session_start
  pi.on('session_start', async (_event: any, ctx: any) => {
    try {
      const sm = ctx?.sessionManager;
      const sId = sm?.getSessionId?.();
      if (typeof sId === 'string' && sId) {
        currentSessionId = sId;
        currentPersona = getPersonaForSession(currentSessionId);
        currentDisplayName = getSessionDisplayName(currentPersona, currentSessionId);
      }

      // NAMA SESI = satu sumber kebenaran untuk footer Pi DAN office.
      // Ekstensi ini dulunya auto-set nama ber-prefix emoji avatar (mis. "👩‍🔬 Vania · 5acb17").
      // Itu membuat footer Pi (yang ikut emoji) tidak sama dengan office (yang tampil avatar terpisah).
      // Aturan sekarang:
      //   - Kalau user sudah set nama sendiri via /name (tidak ber-emoji avatar di depan) -> hormati itu.
      //   - Kalau nama masih ber-emoji avatar (auto dari ekstensi lama) -> gunakan nama persona kantor
      //     tanpa emoji, supaya identik dengan yang dikirim ke office.
      const rawName = pi.getSessionName?.();
      const looksLikeAutoName =
        typeof rawName === 'string' &&
        /^[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u.test(rawName.trim());
      const resolvedName =
        typeof rawName === 'string' && rawName.trim() && !looksLikeAutoName
          ? rawName.trim()
          : currentDisplayName;
      currentDisplayName = resolvedName;

      if (typeof pi.setSessionName === 'function') {
        pi.setSessionName(resolvedName);
      }

      const cwd = ctx?.cwd || process.cwd();
      currentTask = getLastPiCliPrompt(cwd, currentSessionId) || currentTask;
      if (typeof ctx?.model?.id === 'string' && ctx.model.id) {
        currentModel = ctx.model.id;
      }

      await sendOfficeEvent('session.register', {
        session_id: currentSessionId,
        name: currentDisplayName,
        role: currentPersona.role,
        avatar: currentPersona.avatar,
        color: currentPersona.color,
        cwd,
        model: ctx?.model?.id || 'pi-model',
        pid: process.pid,
        task: currentTask,
        is_subagent: 0,
        ...clientIdentity
      });

      // A remote hub without a token answers 401, which is otherwise invisible: every
      // sendOfficeEvent() swallows its error by design. Say it out loud once per session.
      if (!onboardingHintShown) {
        const target = officeTelemetryTarget();
        if (!target.authed && !target.endpoint.includes('127.0.0.1')) {
          onboardingHintShown = true;
          ctx?.ui?.notify?.(`☕ Kantor butuh token — jalankan /office connect <token>. Target: ${target.endpoint}`, 'info');
        }
      }
    } catch {
      // safe fallback
    }
  });

  // 2. Hook: before_agent_start -> Tangkap PROMPT ASLI yang diketik user sebagai TASK!
  pi.on('before_agent_start', async (event: any, ctx: any) => {
    try {
      const prompt = typeof event?.prompt === 'string' && event.prompt.trim()
        ? event.prompt
        : getLastPiCliPrompt(ctx?.cwd || process.cwd(), currentSessionId);

      if (prompt) {
        currentTask = summarizePrompt(prompt);
      }

      await sendOfficeEvent('task.update', {
        session_id: currentSessionId,
        task: currentTask,
        status: 'working',
        pid: process.pid,
        ...clientIdentity
      });
    } catch {
      // safe fallback
    }
  });

  // 3. Hook: tool_call -> Intercept pemanggilan tool nyata (bash, read, write, edit, subagent)
  pi.on('tool_call', async (event: ToolEventPayload, ctx: any) => {
    try {
      const callId = event.toolCallId || `tc_${Date.now()}`;
      activeToolCalls.set(callId, Date.now());

      const toolName = event.toolName || 'tool';
      const input = event.input || {};

      // === DETEKSI REAL SUB-AGENT SPAWN ===
      if (toolName === 'subagent') {
        const subagentTask = input.task || input.workflow || 'Tugas delegasi subagent';
        const subagentKey = input.agent || input.lane?.key || `sub_${Date.now().toString(36)}`;
        const subPersona = getSubagentPersona(subagentKey);

        await sendOfficeEvent('team.register', {
          subagent_id: `${currentSessionId}_${subagentKey}`,
          parent_session_id: currentSessionId,
          parent_name: currentDisplayName,
          name: `${subPersona.name} · ${shortSessionSuffix(currentSessionId)}-${shortSessionSuffix(subagentKey)} [${subagentKey}]`,
          role: subPersona.role,
          avatar: subPersona.avatar,
          color: subPersona.color,
          cwd: ctx?.cwd || process.cwd(),
          model: input.model || 'inherited-model',
          task: subagentTask,
          ...clientIdentity,
          client_kind: 'subagent'
        });
      }

      // Catat tool call nyata
      await sendOfficeEvent('tool.call', {
        call_id: callId,
        session_id: currentSessionId,
        tool_name: toolName,
        input: input
      });
    } catch {
      // safe fallback
    }
  });

  // 4. Hook: tool_result -> Catat hasil eksekusi tool nyata & durasinya
  pi.on('tool_result', async (event: ToolEventPayload, _ctx: any) => {
    try {
      const callId = event.toolCallId || '';
      const startTime = activeToolCalls.get(callId) || Date.now();
      activeToolCalls.delete(callId);

      await sendOfficeEvent('tool.result', {
        call_id: callId,
        session_id: currentSessionId,
        tool_name: event.toolName,
        result: event.details || '(selesai)',
        is_error: !!event.isError,
        duration_ms: Date.now() - startTime
      });
    } catch {
      // safe fallback
    }
  });

  // 5. Hook: message stream -> tampilkan stream respons LLM realtime di bubble coffee.
  // Catatan: raw hidden chain-of-thought tidak dikirim; thinking_delta hanya jadi indikator aktivitas.
  pi.on('message_start', async (event: any) => {
    try {
      if (event?.message?.role !== 'assistant') return;
      liveResponseText = '';
      liveThinkingChars = 0;
      await publishLlmStream('status', 'LLM mulai menjawab…', false, true);
    } catch {
      // safe fallback
    }
  });

  pi.on('message_update', async (event: any) => {
    try {
      const update = event?.assistantMessageEvent;
      if (!update) return;

      switch (update.type) {
        case 'text_start':
          liveResponseText = extractAssistantVisibleText(update.partial) || liveResponseText;
          await publishLlmStream('response', liveResponseText || 'Respons mulai mengalir…', false, true);
          break;
        case 'text_delta':
          liveResponseText += update.delta || '';
          await publishLlmStream('response', liveResponseText || 'Respons mengalir…');
          break;
        case 'text_end':
          liveResponseText = update.content || liveResponseText;
          await publishLlmStream('response', liveResponseText, false, true);
          break;
        case 'thinking_start':
          liveThinkingChars = 0;
          await publishLlmStream('thinking', 'reasoning internal aktif…', false, true);
          break;
        case 'thinking_delta':
          liveThinkingChars += String(update.delta || '').length;
          await publishLlmStream('thinking', `reasoning internal mengalir (${liveThinkingChars} chars)…`);
          break;
        case 'thinking_end':
          await publishLlmStream('thinking', `reasoning internal selesai (${liveThinkingChars} chars)`, false, true);
          break;
        case 'toolcall_start':
        case 'toolcall_delta':
        case 'toolcall_end': {
          const toolName = extractToolCallName(event) || 'tool call';
          await publishLlmStream('tool', `Menyiapkan ${toolName}…`, false, update.type !== 'toolcall_delta');
          break;
        }
      }
    } catch {
      // safe fallback
    }
  });

  pi.on('message_end', async (event: any) => {
    try {
      if (event?.message?.role !== 'assistant') return;
      const finalText = extractAssistantVisibleText(event.message) || liveResponseText || 'Respons selesai.';
      liveResponseText = finalText;
      await publishLlmStream('response', finalText, true, true);
      await publishUsage(event.message);
    } catch {
      // safe fallback
    }
  });

  // 6. Hook: agent_end -> Turn selesai, agen kembali idle
  pi.on('agent_end', async () => {
    try {
      await sendOfficeEvent('session.heartbeat', {
        session_id: currentSessionId,
        status: 'idle',
        task: currentTask,
        pid: process.pid,
        ...clientIdentity
      });
    } catch {
      // safe fallback
    }
  });

  // 7. Hook: session_shutdown -> Sesi ditutup
  pi.on('session_shutdown', async () => {
    try {
      await sendOfficeEvent('session.end', {
        session_id: currentSessionId
      });
    } catch {
      // safe fallback
    }
  });

  // === PERINTAH /office — onboard mesin lain tanpa menyunting JSON ===
  if (typeof pi.registerCommand === 'function') {
    pi.registerCommand('office', {
      description: 'Kantor virtual: status | connect <token> | url <endpoint> | local | cloud | off | on | test',
      handler: async (args: string, ctx: any) => {
        const [verb = 'status', ...rest] = String(args || '').trim().split(/\s+/);
        // Explicit else, not `notify() || console.log()`: ui.notify returns undefined, so the
        // `||` form would print the same text to stdout and corrupt the TUI.
        const say = (text: string, level: any = 'info') => {
          if (typeof ctx?.ui?.notify === 'function') ctx.ui.notify(text, level);
          else console.log(text);
        };

        switch (verb) {
          case 'connect': {
            // `connect <token>` pakai endpoint bawaan paket; `connect <url> <token>` untuk hub lain.
            const [maybeUrl, maybeToken] = rest;
            const token = rest.length > 1 ? maybeToken : maybeUrl;
            const endpoint = rest.length > 1 ? maybeUrl : undefined;
            if (!token) return say('Pemakaian: /office connect <token> atau /office connect <url-hub> <token>', 'error');
            writeOfficeExtensionConfig({ ...(endpoint ? { endpoint } : {}), token, enabled: true });
            refreshOfficeConfig();
            const ok = await sendOfficeEvent('session.register', {
              session_id: currentSessionId, name: currentDisplayName, pid: process.pid, task: 'handshake /office connect',
              ...clientIdentity,
            });
            return say(ok
              ? `✅ Terhubung ke ${officeTelemetryTarget().endpoint} — mesin "${clientIdentity.machine_name}" masuk kantor.`
              : `⚠️ Config tersimpan, tapi kirim gagal (${officeTelemetryTarget().lastError}). Cek token/URL.`, ok ? 'info' : 'error');
          }
          case 'url': {
            if (!rest[0]) return say('Pemakaian: /office url <endpoint /api/event>', 'error');
            writeOfficeExtensionConfig({ endpoint: rest[0] });
            refreshOfficeConfig();
            return say(`🌐 Endpoint → ${rest[0]}`);
          }
          case 'local':
            writeOfficeExtensionConfig({ endpoint: DEFAULT_LOCAL_ENDPOINT, token: process.env.OFFICE_TOKEN || readRawOfficeConfig()?.token || '' });
            refreshOfficeConfig();
            return say(`🏠 Hub lokal → ${DEFAULT_LOCAL_ENDPOINT}`);
          case 'cloud':
            writeOfficeExtensionConfig({ endpoint: DEFAULT_CLOUD_ENDPOINT });
            refreshOfficeConfig();
            return say(`☁️ Worker cloud → ${DEFAULT_CLOUD_ENDPOINT}`);
          case 'off':
            writeOfficeExtensionConfig({ enabled: false });
            refreshOfficeConfig();
            return say('🔇 Telemetry kantor dimatikan di mesin ini.');
          case 'on':
            writeOfficeExtensionConfig({ enabled: true });
            refreshOfficeConfig();
            return say('🔊 Telemetry kantor aktif kembali.');
          case 'test': {
            const ok = await sendOfficeEvent('log.append', {
              session_id: currentSessionId, level: 'info', source: 'office-test', message: '🔔 Uji koneksi dari /office test',
            });
            const t = officeTelemetryTarget();
            return say(ok ? `✅ ${t.endpoint} menjawab.` : `❌ ${t.endpoint}: ${t.lastError || 'gagal'}`, ok ? 'info' : 'error');
          }
          default: {
            const t = officeTelemetryTarget();
            const origin = officeHubOrigin(t.endpoint);
            return say([
              '☕ ORCA24 office',
              `   endpoint : ${t.endpoint}${t.enabled ? '' : '  (telemetry OFF — /office on)'}`,
              `   dashboard: ${origin ?? '?'}`,
              `   token    : ${t.authed ? 'ya (bearer)' : 'BELUM ADA → /office connect <token>'}`,
              `   redaksi  : ${t.redacting ? 'aktif (payload disensor sebelum keluar mesin)' : 'nonaktif (loopback)'}`,
              `   mesin    : ${clientIdentity.machine_name} · ${clientIdentity.machine_id}`,
              `   kirim    : ${t.lastSentAt ? new Date(t.lastSentAt).toLocaleTimeString() : 'belum ada'}${t.lastError ? ` · terakhir gagal: ${t.lastError}` : ''}`,
            ].join('\n'));
          }
        }
      }
    });
  }

  // === CUSTOM TOOLS UNTUK KANTOR PI ===
  if (typeof pi.registerTool === 'function') {
    pi.registerTool({
      name: 'office_set_task',
      label: 'Set Status Tugas Kantor',
      description: 'Perbarui deskripsi tugas aktif Anda yang ditampilkan di dashboard kantor virtual.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'Penjelasan singkat apa yang sedang Anda kerjakan sekarang (Bahasa Indonesia).'
          }
        },
        required: ['task']
      },
      execute: async (_toolCallId: string, params: { task: string }) => {
        currentTask = params.task;
        await sendOfficeEvent('task.update', {
          session_id: currentSessionId,
          task: currentTask,
          status: 'working',
          pid: process.pid,
          ...clientIdentity
        });
        return {
          content: [
            {
              type: 'text',
              text: `ok`
            }
          ]
        };
      }
    });

    pi.registerTool({
      name: 'office_announce',
      label: 'Umumkan ke Kantor',
      description: 'Kirim pengumuman atau pesan koordinasi ke seluruh tim di kantor virtual.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Pesan pengumuman untuk seluruh kantor.'
          }
        },
        required: ['message']
      },
      execute: async (_toolCallId: string, params: { message: string }) => {
        await sendOfficeEvent('log.append', {
          session_id: currentSessionId,
          level: 'info',
          source: 'announcement',
          message: `📢 [${currentDisplayName}]: ${params.message}`
        });
        return {
          content: [
            {
              type: 'text',
              text: `ok`
            }
          ]
        };
      }
    });
  }
}
