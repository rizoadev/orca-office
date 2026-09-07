export interface OfficePersona {
  name: string;
  role: string;
  avatar: string;
  color: string;
}

// 100 reserved office personas — 80% female by design (80 female / 20 male).
// Names mix Indonesian and international first names (Saarah, Clara, Camille, …).
// Names are intentionally unique so the office avoids obvious duplicate display
// names across many concurrent Pi sessions. The session suffix still remains as a
// hard uniqueness guard.
//
// Avatar rule: female personas use 👩-family / 🧕 / 👸 / 🙋‍♀️ glyphs and male personas
// use 👨-family / 🧔 glyphs, so the 3D engine can infer gender from the avatar alone.
// `inferAgentGender()` in the dashboard keeps a first-name list as fallback.
const PERSONAS: OfficePersona[] = [
  // ── Female (80) ───────────────────────────────────────────────────────────
  { name: 'Saarah', role: 'Principal Architect · System Design', avatar: '👩‍🚀', color: '#6366f1' },
  { name: 'Clara', role: 'Frontend Engineer · React & State Sync', avatar: '👩‍💻', color: '#22d3ee' },
  { name: 'Camille', role: 'Design Systems · Tokens & Motion', avatar: '👩‍🎨', color: '#ec4899' },
  { name: 'Amara', role: 'Product Strategist · Backlog & Sprint', avatar: '👩‍💼', color: '#a855f7' },
  { name: 'Nadia', role: 'AI Integration · Model Tuning', avatar: '👩‍🔬', color: '#d946ef' },
  { name: 'Kirana', role: 'Data Engineer · Pipelines & ETL', avatar: '👩‍💻', color: '#15803d' },
  { name: 'Alya', role: 'Component Library · Accessibility', avatar: '👩‍🎨', color: '#be185d' },
  { name: 'Sinta', role: 'Content Engineer · Release Notes', avatar: '👩‍🏫', color: '#f97316' },
  { name: 'Maya', role: 'Research Engineer · Evaluation', avatar: '👩‍🔬', color: '#8b5cf6' },
  { name: 'Dewi', role: 'Frontend Architect · Rendering & SSR', avatar: '👩‍💻', color: '#f43f5e' },
  { name: 'Putri', role: 'Product Ops · Rituals & Reviews', avatar: '👩‍💼', color: '#16a34a' },
  { name: 'Intan', role: 'UX Researcher · User Flows', avatar: '👩‍💼', color: '#f472b6' },
  { name: 'Rani', role: 'Support Engineer · Triage & Tickets', avatar: '🙋‍♀️', color: '#ea580c' },
  { name: 'Sekar', role: 'UX Writer · Microcopy & I18N', avatar: '👩‍🏫', color: '#e11d48' },
  { name: 'Melati', role: 'Frontend Engineer · Components', avatar: '👩‍💻', color: '#fb7185' },
  { name: 'Wulan', role: 'Design Ops · Token Governance', avatar: '👩‍🎨', color: '#db2777' },
  { name: 'Tari', role: 'Visual Designer · 3D Office', avatar: '👩‍🎨', color: '#c026d3' },
  { name: 'Dinda', role: 'Analytics Engineer · Metrics', avatar: '👩‍💻', color: '#059669' },
  { name: 'Nabila', role: 'QA Engineer · Smoke Tests', avatar: '👩‍🔬', color: '#9333ea' },
  { name: 'Farah', role: 'Product Manager · Roadmap', avatar: '👩‍💼', color: '#65a30d' },
  { name: 'Salma', role: 'Security Engineer · Threat Models', avatar: '👩‍💻', color: '#dc2626' },
  { name: 'Zahra', role: 'Backend Engineer · Event Hub', avatar: '👩‍💻', color: '#4f46e5' },
  { name: 'Laila', role: 'Release Manager · Coordination', avatar: '👩‍💼', color: '#0d9488' },
  { name: 'Mira', role: 'Data Analyst · Insights', avatar: '👩‍💻', color: '#14b8a6' },
  { name: 'Ayu', role: 'Knowledge Engineer · Memory', avatar: '👩‍🏫', color: '#7c3aed' },
  { name: 'Novi', role: 'Release QA · Verification', avatar: '👩‍🔬', color: '#22c55e' },
  { name: 'Salsabila', role: 'Design Research · Prototypes', avatar: '👩‍🎨', color: '#e879f9' },
  { name: 'Yuni', role: 'Operations Analyst · Workflow', avatar: '👩‍💼', color: '#16a34a' },
  { name: 'Prita', role: 'Program Manager · Delivery', avatar: '👩‍💼', color: '#84cc16' },
  { name: 'Melly', role: 'Documentation Lead · Guides', avatar: '👩‍🏫', color: '#c084fc' },
  { name: 'Cahya', role: 'Visual QA · Layout & Contrast', avatar: '👩‍🔬', color: '#fb923c' },
  { name: 'Arumi', role: 'Interaction Engineer · Motion', avatar: '👩‍🎨', color: '#f59e0b' },
  { name: 'Mega', role: 'Frontend Lead · Dashboard', avatar: '👩‍💻', color: '#0ea5e9' },
  { name: 'Rossa', role: 'QA Lead · Test Strategy', avatar: '👩‍🔬', color: '#7c2d12' },
  { name: 'Tiara', role: 'Design Lead · Experience', avatar: '👩‍🎨', color: '#a21caf' },
  { name: 'Rika', role: 'QA Automation · Fixtures', avatar: '👩‍💻', color: '#8b5cf6' },
  { name: 'Mila', role: 'Product Analyst · Experiments', avatar: '👩‍💻', color: '#4ade80' },
  { name: 'Astri', role: 'Reliability Analyst · SLO & Uptime', avatar: '👩‍💼', color: '#10b981' },
  { name: 'Cempaka', role: 'UI Engineer · Visual Polish', avatar: '👩‍🎨', color: '#db2777' },
  { name: 'Larasati', role: 'Product Designer · Interaction', avatar: '👩‍🎨', color: '#f0abfc' },
  { name: 'Anisa', role: 'Design Systems · Figma Handoff', avatar: '👩‍🎨', color: '#f472b6' },
  { name: 'Citra', role: 'QA Analyst · Regression', avatar: '👩‍🔬', color: '#c084fc' },
  { name: 'Kenanga', role: 'Technical Writer · API Docs', avatar: '👩‍🏫', color: '#d97706' },
  { name: 'Tasya', role: 'Test Engineer · E2E Suites', avatar: '👩‍🔬', color: '#9333ea' },
  { name: 'Niken', role: 'Quality Engineer · Coverage', avatar: '👩‍🔬', color: '#a21caf' },
  { name: 'Fitri', role: 'Research Ops · Synthesis', avatar: '👩‍🔬', color: '#9333ea' },
  { name: 'Monica', role: 'Frontend Engineer · Forms', avatar: '👩‍💻', color: '#ec4899' },
  { name: 'Lina', role: 'Accessibility Engineer · ARIA', avatar: '👩‍💻', color: '#be185d' },
  { name: 'Bella', role: 'Customer Success · Adoption', avatar: '👩‍💼', color: '#65a30d' },
  { name: 'Reni', role: 'Data Product · Reporting', avatar: '👩‍💻', color: '#0f766e' },
  { name: 'Amira', role: 'Platform Engineer · Observability', avatar: '👩‍💻', color: '#06b6d4' },
  { name: 'Noor', role: 'Runtime Engineer · Agent Loop', avatar: '👩‍💻', color: '#2563eb' },
  { name: 'Elise', role: 'Performance Engineer · Latency & WebGL', avatar: '👩‍🔧', color: '#f59e0b' },
  { name: 'Freya', role: 'DevOps Specialist · Docker & CI/CD', avatar: '👩‍💻', color: '#3b82f6' },
  { name: 'Chloe', role: 'Realtime Engineer · WebSocket Hub', avatar: '👩‍💻', color: '#0369a1' },
  { name: 'Maeve', role: 'Systems Engineer · Cache & Storage', avatar: '👩‍🔧', color: '#0f766e' },
  { name: 'Lucia', role: 'Telemetry Engineer · Events', avatar: '👩‍💻', color: '#7dd3fc' },
  { name: 'Iris', role: 'Build Engineer · Bundling', avatar: '👩‍💻', color: '#0284c7' },
  { name: 'Hana', role: 'CLI Engineer · Commands', avatar: '👩‍💻', color: '#0ea5e9' },
  { name: 'Nina', role: 'Integration Engineer · Extensions', avatar: '👩‍💻', color: '#2563eb' },
  { name: 'Zoe', role: 'Tooling Engineer · Developer UX', avatar: '👩‍🔧', color: '#ea580c' },
  { name: 'Kira', role: 'Security Ops · Secrets', avatar: '👩‍💻', color: '#991b1b' },
  { name: 'Alina', role: 'Cloud Engineer · Networking', avatar: '👩‍💻', color: '#1d4ed8' },
  { name: 'Sena', role: 'Infrastructure Lead · Scaling', avatar: '👩‍🔧', color: '#64748b' },
  { name: 'Esme', role: 'Design Engineer · Storybook', avatar: '👩‍🎨', color: '#e11d48' },
  { name: 'Aruna', role: 'Data Reliability · Storage', avatar: '👩‍💻', color: '#4d7c0f' },
  { name: 'Kavya', role: 'Automation Engineer · Scripting', avatar: '👩‍🔧', color: '#0891b2' },
  { name: 'Selene', role: 'Sandbox Engineer · Isolation', avatar: '👩‍🚀', color: '#1e293b' },
  { name: 'Maira', role: 'Feedback Engineer · Customer Loop', avatar: '👩‍💼', color: '#0e7490' },
  { name: 'Anindya', role: 'Frontend Specialist · Charts', avatar: '👩‍💻', color: '#d946ef' },
  { name: 'Saras', role: 'Benchmark Engineer · Profiling', avatar: '👩‍🔬', color: '#ca8a04' },
  { name: 'Indira', role: 'Architecture Reviewer · Boundaries', avatar: '👩‍💼', color: '#0f766e' },
  { name: 'Kamila', role: 'Release Engineer · Rollouts', avatar: '👩‍💻', color: '#166534' },
  { name: 'Alea', role: 'Prompt Engineer · Instruction Tuning', avatar: '👩‍🔬', color: '#6d28d9' },
  { name: 'Rhea', role: 'Evaluation Engineer · Rubrics', avatar: '👩‍🔬', color: '#8b5cf6' },
  { name: 'Callista', role: 'API Engineer · Contracts', avatar: '👩‍💻', color: '#38bdf8' },
  { name: 'Anwita', role: 'Localization Engineer · ID/EN', avatar: '👩‍🏫', color: '#f97316' },
  { name: 'Vania', role: 'Sandbox QA · Fault Injection', avatar: '👩‍🔬', color: '#b91c1c' },
  { name: 'Nayla', role: 'Visual Engineer · Shaders', avatar: '👩‍🎨', color: '#c026d3' },
  { name: 'Aisyah', role: 'Studio Ops · Coffee Program', avatar: '👩‍🍳', color: '#92400e' },

  // ── Male (20) ─────────────────────────────────────────────────────────────
  { name: 'Budi Santoso', role: 'Backend Lead · API & Microservices', avatar: '🧔', color: '#6366f1' },
  { name: 'Rizky Pratama', role: 'DevOps Engineer · Pipelines & Runners', avatar: '👨‍💻', color: '#3b82f6' },
  { name: 'Ahmad Fauzi', role: 'Security Architect · Sandboxing & CSP', avatar: '👨‍🚒', color: '#ef4444' },
  { name: 'Bayu Saputra', role: 'Systems Engineer · Database & Cache', avatar: '👨‍💻', color: '#10b981' },
  { name: 'Dimas Wicaksono', role: 'Data Engineer · Analytics & ETL', avatar: '👨‍💻', color: '#14b8a6' },
  { name: 'Andi Wijaya', role: 'Runtime Engineer · Session Lifecycle', avatar: '👨‍💻', color: '#0ea5e9' },
  { name: 'Hendra Gunawan', role: 'Infrastructure Lead · Capacity Planning', avatar: '👨‍🔧', color: '#64748b' },
  { name: 'Teguh Setiawan', role: 'Database Engineer · SQLite & WAL', avatar: '👨‍💻', color: '#84cc16' },
  { name: 'Yoga Mahendra', role: 'API Engineer · REST & GraphQL', avatar: '👨‍💻', color: '#38bdf8' },
  { name: 'Arif Rahman', role: 'Security Engineer · AppSec & Audits', avatar: '👨‍🚒', color: '#dc2626' },
  { name: 'Naufal Hakim', role: 'Fullstack Engineer · Delivery', avatar: '👨‍💻', color: '#2563eb' },
  { name: 'Reza Maulana', role: 'Site Reliability · Health Checks', avatar: '👨‍🚀', color: '#7c3aed' },
  { name: 'Doni Kurniawan', role: 'Backend Engineer · Streams & Sinks', avatar: '🧔', color: '#4f46e5' },
  { name: 'Joko Priyanto', role: 'Systems Architect · Topology', avatar: '👨‍💼', color: '#059669' },
  { name: 'Rafi Hidayat', role: 'AI Product Engineer · Prompts', avatar: '👨‍💻', color: '#9333ea' },
  { name: 'Galih Prakoso', role: 'Build Engineer · Tree-shaking & Chunks', avatar: '👨‍🔧', color: '#0284c7' },
  { name: 'Yusuf Ramadhan', role: 'Cloud Engineer · Edge & DNS', avatar: '👨‍💻', color: '#1d4ed8' },
  { name: 'Rangga Aditya', role: 'Backend Engineer · Queues', avatar: '👨‍💻', color: '#0f766e' },
  { name: 'Bima Ardiansyah', role: 'Core Engineer · State Machine', avatar: '👨‍💻', color: '#2563eb' },
  { name: 'Satria Wibowo', role: 'Performance Lead · Runtime Cost', avatar: '👨‍💻', color: '#b45309' },
];

export function getPersonaForSession(sessionId: string): OfficePersona {
  // Deterministic persona based on string hash of sessionId.
  // The base persona may repeat after the reserved pool is saturated; the public
  // display name below adds a session-derived suffix as a hard uniqueness guard.
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash << 5) - hash + sessionId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PERSONAS.length;
  return PERSONAS[index];
}

export function shortSessionSuffix(sessionId: string): string {
  const clean = String(sessionId || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-6);
  return clean || Math.random().toString(36).slice(2, 8);
}

export function getSessionDisplayName(persona: OfficePersona, sessionId: string): string {
  return `${persona.name} · ${shortSessionSuffix(sessionId)}`;
}

// Sub-agents follow the same 80/20 female-majority split.
const SUBAGENT_PERSONAS: OfficePersona[] = [
  { name: 'Dara (Sub-Agent)', role: 'Code Refactoring Specialist', avatar: '👩‍💻', color: '#818cf8' },
  { name: 'Riri (Sub-Agent)', role: 'Unit Test Generator', avatar: '👩‍🔬', color: '#c084fc' },
  { name: 'Nana (Sub-Agent)', role: 'Dependency Audit Scout', avatar: '🙋‍♀️', color: '#38bdf8' },
  { name: 'Tita (Sub-Agent)', role: 'Schema & DDL Validator', avatar: '👩‍💻', color: '#4ade80' },
  { name: 'Hadi (Sub-Agent)', role: 'Benchmark & Profiler', avatar: '👨‍💻', color: '#fbbf24' },
];

export function getSubagentPersona(subagentId: string): OfficePersona {
  let hash = 0;
  for (let i = 0; i < subagentId.length; i++) {
    hash = (hash << 5) - hash + subagentId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % SUBAGENT_PERSONAS.length;
  return SUBAGENT_PERSONAS[index];
}
