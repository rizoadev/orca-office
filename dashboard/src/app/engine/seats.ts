// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.

export const OFFICE_SEATS: {
  id: string;
  seat: [number, number];
  rot: number;
  defaultRole: string;
  bar?: boolean;
  topY?: number;
}[] = [
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
