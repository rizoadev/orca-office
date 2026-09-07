// Redaction layer for office telemetry.
//
// Why: the office hub can be a public endpoint (Cloudflare Worker + Turso). Pi tool
// inputs carry file contents and shell commands, and tool results carry whatever those
// commands printed — including secrets read from .env. Once a row lands in the shared
// DB it is durable, so the only safe place to strip it is before it leaves the machine.
//
// Loopback hubs keep full detail (local dashboard stays useful); anything else is
// reduced to what an observer needs to watch work happen, not what was written.

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g, '[redacted:key]'],
  [/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g, '[redacted:jwt]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted:aws]'],
  [/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b/g, '[redacted:gh]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[redacted:slack]'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[redacted:apikey]'],
  [/((?:[A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PASS|PWD|API_?KEY|ACCESS_KEY|PRIVATE_KEY|KEY|CREDENTIAL|AUTH|DSN)[A-Za-z0-9_]*|KEY)\s*[=:]\s*)["']?[^\s"',;]{4,}["']?/gi, '$1[redacted]'],
  [/(:\/\/)([^:/@\s]+):([^@/\s]+)@/g, '$1$2:[redacted]@'],
];

export function redactSecrets(value: string): string {
  let out = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function clip(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? clean.slice(0, Math.max(0, maxLength - 1)) + '…' : clean;
}

/**
 * Keep a shell command legible (`git push --force-with-lease`) without shipping the
 * arguments that carry credentials. Pattern redaction alone is best-effort, so any
 * `KEY=value` token is masked structurally instead of being trusted to a regex.
 */
export function sanitizeCommand(command: string, maxTokens = 6): string {
  const masked = redactSecrets(command).split(/[;&|\n]+/).flatMap((segment) =>
    segment.trim().split(/\s+/).filter(Boolean).map((token) => {
      const assignment = token.match(/^([^=]{1,60})=(.*)$/);
      if (assignment && assignment[2]) return `${assignment[1]}=[redacted]`;
      return token;
    })
  );
  return clip(masked.slice(0, maxTokens).join(' '), 120);
}

export function isLoopbackEndpoint(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === '0.0.0.0';
  } catch {
    return false;
  }
}

// Only these keys survive for a given tool. Anything not listed is dropped, so a new
// tool that takes a body-sized argument cannot widen the leak by accident.
const TOOL_ALLOWLIST: Record<string, string[]> = {
  bash: ['command', 'timeout'],
  read: ['path', 'offset', 'limit'],
  write: ['path'],
  edit: ['path'],
  grep: ['pattern', 'path', 'glob'],
  find: ['pattern', 'path'],
  ls: ['path'],
  subagent: ['agent', 'task', 'workflowScriptPath', 'workflow'],
  web_search: ['query'],
};

export function summarizeToolInput(
  toolName: string,
  input: Record<string, any> | undefined
): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const allowed = TOOL_ALLOWLIST[toolName] ?? Object.keys(input).slice(0, 6);
  const summary: Record<string, unknown> = {};

  for (const key of allowed) {
    const value = input[key];
    if (typeof value === 'string') {
      summary[key] = key === 'command' ? sanitizeCommand(value) : clip(redactSecrets(value), 120);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      summary[key] = value;
    }
  }

  // Keep the shape visible without shipping the payload.
  const dropped = Object.keys(input).filter((key) => !allowed.includes(key));
  if (dropped.length) summary._omitted = dropped.slice(0, 8);
  return summary;
}

function redactStrings(value: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (typeof value === 'string') return clip(redactSecrets(value), 200);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => redactStrings(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 16)) {
      out[key] = redactStrings(item, depth + 1);
    }
    return out;
  }
  return undefined;
}

/**
 * Reduce one telemetry event to what is safe to publish to a shared hub.
 * Unknown event types fall back to a redacted deep-clone rather than a passthrough:
 * forgetting to register a new event type must fail closed.
 */
export function sanitizeEvent(type: string, payload: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...payload };

  switch (type) {
    case 'tool.call': {
      out.input = summarizeToolInput(String(payload.tool_name || ''), payload.input);
      break;
    }
    case 'tool.result': {
      const details = payload.result ?? payload.details;
      const text = typeof details === 'string' ? details : details === undefined ? '' : JSON.stringify(details);
      delete out.result;
      delete out.details;
      out.output_chars = text.length;
      break;
    }
    case 'llm.stream': {
      out.text = clip(redactSecrets(String(payload.text || '')), 140);
      break;
    }
    case 'task.update':
    case 'session.register':
    case 'session.heartbeat':
    case 'team.register': {
      if (typeof out.task === 'string') out.task = clip(redactSecrets(out.task), 100);
      if (typeof out.name === 'string') out.name = clip(redactSecrets(out.name), 80);
      if (typeof out.parent_name === 'string') out.parent_name = clip(redactSecrets(out.parent_name), 80);
      break;
    }
    case 'log.append': {
      out.message = clip(redactSecrets(String(payload.message || '')), 200);
      break;
    }
    default: {
      return (redactStrings(payload) as Record<string, any>) ?? {};
    }
  }

  return out;
}
