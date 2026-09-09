// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import { FeedService } from '../core/feed.service';
import { MusholaFloorService } from '../rooms/mushola-floor.service';
import { MusholaService } from '../rooms/mushola.service';
import { PathService } from '../navigation/paths.service';
import { PersonService } from '../avatars/person.service';
import { SeatItemsService } from '../furniture/seat-items.service';
import type { AgentData, Session, ToolCall } from '../../core/models/types';
import { OFFICE_SEATS } from '../core/engine-seats';

@Injectable()
export class SessionSyncService {
  private readonly ctx = inject(EngineContext);
  private readonly feed = inject(FeedService);
  private readonly mezz = inject(MusholaFloorService);
  private readonly mushola = inject(MusholaService);
  private readonly paths = inject(PathService);
  private readonly person = inject(PersonService);
  private readonly seatItems = inject(SeatItemsService);

  syncRealSessions(realSessions: Session[]) {
    // Hanya tampilkan sesi yang statusnya bukan offline
    const activeReal = realSessions.filter((s) => s.status !== 'offline');

    // Buat pemetaan kursi untuk setiap sesi aktif. Agent ID memakai session ID asli
    // supaya bubble tetap unik walau kursi/persona berulang.
    activeReal.forEach((s, idx) => {
      let existing = this.ctx.agents.find((a) => a.realSessionId === s.id);
      const targetMode = s.status === 'working' ? 'work' : 'idle';

      if (!existing) {
        const occupiedSeats = new Set(this.ctx.agents.map((a) => `${a.seat[0]},${a.seat[1]}`));
        const seatConfig = OFFICE_SEATS.find((seat) => !occupiedSeats.has(`${seat.seat[0]},${seat.seat[1]}`)) || OFFICE_SEATS[idx % OFFICE_SEATS.length];
        const seatPos = new THREE.Vector3(seatConfig.seat[0], 0, seatConfig.seat[1]);
        const standDir = new THREE.Vector3(Math.sin(seatConfig.rot), 0, Math.cos(seatConfig.rot));
        const stand = seatPos.clone().add(standDir.multiplyScalar(1.05));
        const colorHex = parseInt((s.color || '#38bdf8').replace('#', '0x'), 16) || 0x38bdf8;
        const agentId = `real_${String(s.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

        this.ctx.seats[agentId] = { seat: seatPos, stand, rot: seatConfig.rot, y: 0 };
        // Laptop TIDAK dipasang di sini — orangnya masih di pintu. revealSeatItems()
        // yang memanggilnya begitu dia selesai jalan dan duduk.

        const personMesh = this.person.createPersonMesh(colorHex, s.name, s.avatar);
        personMesh.g.rotation.y = Math.PI;

        const newAgent: AgentData = {
          id: agentId,
          name: s.name,
          role: s.role,
          av: s.avatar || (s.is_subagent ? '🤖' : '🧑‍💻'),
          c: colorHex,
          s: 0x38bdf8,
          f: 'g',
          seat: seatConfig.seat,
          rot: seatConfig.rot,
          task: s.task || 'Menunggu instruksi...',
          status: s.status,
          subs: [],
          tools: [],
          mode: 'to',
          prog: targetMode === 'work' ? 65 : 0,
          subIdx: 0,
          idle: 0,
          talk: null,
          toolT: 0,
          toolsDone: 0,
          llmStream: s.liveStream,
          done: 0,
          path: [],
          wi: 0,
          speed: 2.5,
          present: true,
          breakAt: null,
          order: idx,
          after: targetMode,
          realSessionId: s.id,
          isRealPi: true,
          model: s.model,
          project: s.project,
          machineId: s.machine_id || undefined,
          machineName: s.machine_name || undefined,
          orcaName: s.orca_name || undefined,
          orcaWorkspace: s.orca_workspace || undefined,
          orcaPane: s.orca_pane || undefined,
          clientKind: s.client_kind || undefined,
          _p: personMesh
        };

        const entrancePath = this.paths.buildEntrancePath(newAgent);
        personMesh.g.position.copy(entrancePath[0]);
        this.paths.setPath(newAgent, entrancePath, 'to', { after: targetMode });
        this.ctx.agents.push(newAgent);
        this.feed.feed('move', 'ORCA24 Hub', `${s.name} masuk dari pintu menuju meja.`);
        if (this.ctx.onToast) this.ctx.onToast(`🚪 ${s.name} masuk dari pintu → meja`);
      } else {
        // Update task & mode. Kalau agent masih berjalan dari pintu, jangan hentikan animasi;
        // simpan status tujuan setelah sampai meja.
        existing.name = s.name;
        existing.role = s.role;
        existing.task = s.task || existing.task;
        // Why: register-only fields must survive a later poll that omits them.
        existing.project = s.project ?? existing.project;
        existing.machineId = s.machine_id ?? existing.machineId;
        existing.machineName = s.machine_name ?? existing.machineName;
        existing.orcaName = s.orca_name ?? existing.orcaName;
        existing.orcaWorkspace = s.orca_workspace ?? existing.orcaWorkspace;
        existing.orcaPane = s.orca_pane ?? existing.orcaPane;
        existing.clientKind = s.client_kind ?? existing.clientKind;
        // Poll berikutnya bisa datang saat orangnya masih berjalan; revealSeatItems
        // hanya memasang kalau dia sudah benar-benar di kursi.
        this.seatItems.revealSeatItems(existing);
        existing.llmStream = s.liveStream || existing.llmStream;
        existing.status = s.status;
        existing.prog = targetMode === 'work' ? 80 : 0;

        if (targetMode === 'work' && this.mezz.isMusholaBound(existing)) {
          // Ada task baru: potong saf-nya sekarang juga, bukan setelah selesai jalan.
          this.mushola.leaveMushola(existing);
        } else if (this.mezz.isMusholaBound(existing)) {
          // Kenapa: poll sesi berikutnya selalu membawa targetMode. Kalau nilai itu
          // ditulis ke `after`/`mode` milik perjalanan ke lantai dua, waypoint terakhir
          // akan menariknya kembali ke kursi di lantai satu — orang "shalat" di bawah.
          if (existing.mode === 'mushola') existing.task = 'Duduk di mushola';
        } else if (existing.path.length) {
          existing.after = targetMode;
        } else {
          existing.mode = targetMode;
        }
      }
    });

    // Sesi yang selesai jangan langsung hilang. Arahkan agent berjalan ke pintu,
    // lalu baru dihapus saat waypoint luar sudah tercapai.
    const activeIds = new Set(activeReal.map((s) => s.id));
    for (let i = this.ctx.agents.length - 1; i >= 0; i--) {
      const a = this.ctx.agents[i];
      if (a.realSessionId && !activeIds.has(a.realSessionId)) {
        this.paths.startExit(a);
      }
    }

    if (this.ctx.onStateChange) this.ctx.onStateChange();
  }

  handleRealToolCall(tc: ToolCall) {
    const agent = this.ctx.agents.find((a) => a.realSessionId === tc.session_id) || this.ctx.agents[0];
    if (!agent) return;

    agent.toolsDone++;
    agent.latestToolName = tc.tool_name;
    agent.llmStream = {
      kind: 'tool',
      text: `Memanggil ${tc.tool_name}`,
      updatedAt: Date.now(),
    };
    if (agent.path.length) {
      agent.after = 'work';
    } else {
      agent.mode = 'work';
    }
    // Tool call info only via LiveBar — no speech bubble, no toast
    this.feed.feed('tool', agent.name, tc.tool_name, tc.input_json || '');
  }

  handleSubagentSpawn(subagent: Session) {
    this.feed.feed('sys', 'Sub-Agent Coordinator', `🤖 Subagent di-spawn: ${subagent.name}`);
    if (this.ctx.onToast) this.ctx.onToast(`🤖 Subagent di-spawn: ${subagent.name}`);
  }

  removeAgent(a: AgentData) {
    if (a.musholaSpot != null) this.mezz.musholaSlots.delete(a.musholaSpot);
    this.seatItems.removeSeatItems(a.id);
    if (a._p) {
      this.ctx.scene.remove(a._p.g);
    }
    delete this.ctx.seats[a.id];

    const idx = this.ctx.agents.indexOf(a);
    if (idx >= 0) {
      this.ctx.agents.splice(idx, 1);
    }

    if (this.ctx.onStateChange) this.ctx.onStateChange();
  }

  /** true kalau dia sedang dalam perjalanan ke lantai dua atau sudah duduk di saf. */
}
