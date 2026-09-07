export type AgentMode = 'work' | 'talk' | 'to' | 'back' | 'leaving' | 'break_play' | 'break_out' | 'idle' | 'mushola';

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
  path: any[];
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
  _p?: any; // Three.js person group & parts
  
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
