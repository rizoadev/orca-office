// ============================================================
// ORCA24 Coworking — Core Type Contracts
// Port penuh dari dashboard/src/types.ts (React) + WS packet types
// ============================================================

// Type-only: tidak menambah dependensi runtime core → three. Agent record memang
// milik engine 3D, jadi rig-nya ikut terdefinisi di sini.
import type * as THREE from 'three';

/**
 * Rig avatar yang dikembalikan PersonService.createPersonMesh().
 * Dipakai MovementService untuk mengayunkan kaki/lengan/kepala dan PillOverlayService
 * untuk memproyeksikan posisi kepala ke koordinat layar.
 */
export interface PersonRig {
  /** Root group agent — posisi & rotasi agen ada di sini. */
  g: THREE.Group;
  /** Kaki kiri/kanan. */
  lL: THREE.Mesh;
  lR: THREE.Mesh;
  /** Lengan kiri/kanan. */
  aL: THREE.Mesh;
  aR: THREE.Mesh;
  head: THREE.Mesh;
  torso: THREE.Mesh;
}

export type AgentMode =
  | 'work' | 'talk' | 'to' | 'back' | 'leaving'
  | 'break_play' | 'break_out' | 'idle' | 'mushola';

export interface LlmStreamState {
  kind: 'response' | 'thinking' | 'tool' | 'status';
  text: string;
  isFinal?: boolean;
  updatedAt: number;
}

export interface AgentData {
  id: string;
  name: string;
  role: string;
  av: string;
  c: number;
  s: number;
  f: 'g';
  seat: [number, number];
  rot: number;
  task: string;
  subs: string[];
  tools: string[];

  // Dynamic runtime state
  status?: string;
  mode: AgentMode;
  prog: number;
  subIdx: number;
  idle: number;
  talk: { text: string; until: number } | null;
  toolT: number;
  toolsDone: number;
  latestToolName?: string;
  llmStream?: LlmStreamState;
  done: number;
  /** Rute waypoint yang sedang dia lalui (Vector3 dunia). */
  path: THREE.Vector3[];
  wi: number;
  speed: number;
  present: boolean;
  breakAt: number | null;
  order: number;
  phase?: number;
  visitId?: string | null;
  after?: AgentMode | null;
  orderStopIndex?: number | null;
  orderUntil?: number | null;
  hasOrderedCoffee?: boolean;
  orderTaskBefore?: string | null;
  _y?: number;
  /** Indeks saf di mezanine yang dia tempati, null kalau tidak di mushola. */
  musholaSpot?: number | null;
  /** Rig Three.js agent. Selalu dibuat bersama agent; `if (a._p)` cuma penjaga
   *  terhadap agen yang baru saja dihapus dari scene. */
  _p: PersonRig;

  // Real Pi Session attribution
  realSessionId?: string;
  model?: string;
  isRealPi?: boolean;
  /** Git project (repo) name this session works in — shown on the bubble. */
  project?: string;
  machineId?: string;
  machineName?: string;
  orcaName?: string;
  orcaWorkspace?: string;
  orcaPane?: string;
  clientKind?: 'pi' | 'orca' | 'subagent' | string;
}

export interface FeedEvent {
  n: number;
  kind: 'task' | 'tool' | 'chat' | 'move' | 'sys';
  who: string;
  text: string;
  code?: string;
  t: string;
}

export interface Session {
  id: string;
  name: string;
  role: string;
  avatar: string;
  color: string;
  cwd?: string;
  project?: string;
  machine_id?: string | null;
  machine_name?: string | null;
  orca_name?: string | null;
  orca_workspace?: string | null;
  orca_pane?: string | null;
  client_kind?: string | null;
  model?: string;
  pid?: number | null;
  task?: string;
  liveStream?: LlmStreamState;
  status: 'working' | 'idle' | 'offline';
  is_subagent: number;
  parent_session_id?: string | null;
  started_at: number;
  last_heartbeat: number;
  ended_at?: number | null;
}

export interface ToolCall {
  id: string;
  session_id: string;
  session_name?: string;
  session_avatar?: string;
  tool_name: string;
  input_json?: string;
  result_json?: string;
  is_error: number;
  duration_ms: number;
  created_at: number;
}

export interface LogEntry {
  id?: number;
  session_id?: string;
  session_name?: string;
  session_avatar?: string;
  level: string;
  source: string;
  message: string;
  created_at: number;
}

export type CostSource = 'table' | 'feed' | 'reported' | 'none';

/** Satu baris tagihan: agregat token untuk satu (pegawai × model). */
export interface BillLine {
  model: string;
  provider: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
  turns: number;
  costSource: CostSource;
  ratePerToken: number;
  ratePerMillion: number;
  firstUsedAt: number;
  lastUsedAt: number;
}

export interface PriceQuote {
  model: string;
  provider: string | null;
  source: CostSource;
  matchedBy: string | null;
  rates: { input: number; output: number; cacheRead: number; cacheWrite: number } | null;
}

export interface BillUser {
  sessionId: string;
  name: string;
  avatar: string;
  color: string;
  isSubagent: number;
  status: string;
  totalTokens: number;
  cost: number;
  ratePerToken: number;
  turns: number;
  lastUsedAt: number;
  lines: BillLine[];
}

export interface MenuRow {
  model: string;
  provider: string | null;
  totalTokens: number;
  cost: number;
  turns: number;
  firstUsedAt: number;
  lastUsedAt: number;
  costSource: CostSource;
  drinkerCount: number;
  ratePerToken: number;
  ratePerMillion: number;
}

export interface BillingSummary {
  generatedAt: number;
  users: BillUser[];
  menu: MenuRow[];
  totals: {
    totalTokens: number;
    cost: number;
    turns: number;
    users: number;
    models: number;
  };
}

export interface OfficeState {
  sessions: Session[];
  recent_tool_calls: ToolCall[];
  recent_logs: LogEntry[];
  billing: BillingSummary;
  stats: {
    total_active: number;
    timestamp: number;
  };
}

// ─── WebSocket Event Payloads ───────────────────────────────

export type WsEventType =
  | 'session_registered'
  | 'session_updated'
  | 'session_ended'
  | 'team_spawned'
  | 'tool_called'
  | 'tool_completed'
  | 'llm_stream_updated'
  | 'usage_recorded'
  | 'log_appended';

export interface WsPacket {
  type: WsEventType;
  payload: unknown;
  timestamp: number;
}

// ─── 3D Engine Types ────────────────────────────────────────

export type MenuBoardRow = {
  drink: string;
  model?: string;
  price: string;
  sold?: string;
};

export type AcMode = 'auto' | 'on' | 'off';

export interface SeatConfig {
  id: string;
  seat: [number, number];
  rot: number;
  defaultRole: string;
  bar?: boolean;
  topY?: number;
}

export const OFFICE_SEATS: SeatConfig[] = [
  { id: 'seat_1', seat: [-3.6, 1.6], rot: Math.PI, defaultRole: 'Lead Architect' },
  { id: 'seat_2', seat: [3.4, 1.4], rot: Math.PI, defaultRole: 'Frontend Specialist' },
  { id: 'seat_3', seat: [-8.72, -2.4], rot: Math.PI / 2, defaultRole: 'Systems Engineer', bar: true, topY: 1.06 },
  { id: 'seat_4', seat: [0.2, -3.9], rot: 0, defaultRole: 'UI/UX & Interaction' },
  { id: 'seat_5', seat: [3.6, -3.6], rot: 0, defaultRole: 'Core Runtime' },
  { id: 'seat_6', seat: [-6.4, 1.8], rot: Math.PI / 2, defaultRole: 'QA & Verification' },
  { id: 'seat_7', seat: [6.2, 1.6], rot: -Math.PI / 2, defaultRole: 'Security & Sandbox' },
  { id: 'seat_8', seat: [-1.2, 4.4], rot: Math.PI, defaultRole: 'Data Pipelines' },
  { id: 'seat_9', seat: [-8.72, 0.4], rot: Math.PI / 2, defaultRole: 'API Integrator', bar: true, topY: 1.06 },
  { id: 'seat_10', seat: [6.4, -3.4], rot: -Math.PI / 4, defaultRole: 'DevOps & CI/CD' },
  { id: 'seat_11', seat: [-5.9, 6.2], rot: Math.PI, defaultRole: 'Benchmarker' },
  { id: 'seat_12', seat: [0.4, 4.6], rot: Math.PI, defaultRole: 'AI Model Tuning' },
  { id: 'seat_13', seat: [-4.4, 6.2], rot: Math.PI, defaultRole: 'Database Reliability' },
  { id: 'seat_14', seat: [-0.6, 0.95], rot: Math.PI, defaultRole: 'Telemetry & Ops' },
];
