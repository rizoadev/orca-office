import * as THREE from 'three';

/**
 * OFFICE ANNEX — unit kanan dari kompleks ruko (×3).
 *
 * Ukuran disamakan dengan coffee shop: 20×15 unit.
 * x ∈ [10.1, 30.1], z ∈ [-6.9, 8.3], height 5.4
 *
 * Interior: open-plan office, meeting room, server corner, break area.
 */

export type OfficeAnnex = {
  group: THREE.Group;
};

const UNIT_LEFT = 13.1;
const UNIT_RIGHT = 33.1;
const UNIT_WIDTH = UNIT_RIGHT - UNIT_LEFT; // 20
const BACK_Z = -6.9;
const FRONT_Z = 8.3;
const DEPTH = FRONT_Z - BACK_Z; // 15.2
const HEIGHT = 5.4;
const CX = (UNIT_LEFT + UNIT_RIGHT) / 2; // 20.1
const CZ = (BACK_Z + FRONT_Z) / 2; // 0.7
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

function box(
  group: THREE.Group,
  w: number, h: number, d: number,
  mat: THREE.Material,
  x: number, y: number, z: number
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}

function cyl(
  group: THREE.Group,
  rt: number, rb: number, h: number,
  mat: THREE.Material,
  x: number, y: number, z: number,
  seg = 20
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}

function plane(
  group: THREE.Group,
  w: number, h: number,
  mat: THREE.Material,
  x: number, y: number, z: number,
  ry = 0
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  if (ry) m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}

function makeTex(
  w: number, h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  rx = 1, ry = 1
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = rx > 1 || ry > 1 ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.repeat.set(rx, ry);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  try { t.anisotropy = 8; } catch { /* */ }
  t.needsUpdate = true;
  return t;
}

function officeSignTexture(): THREE.CanvasTexture {
  return makeTex(2048, 320, (g, w, h) => {
    g.fillStyle = '#111827';
    g.fillRect(0, 0, w, h);
    // Accent gradient
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#4f46e5');
    grad.addColorStop(1, '#7c3aed');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, 8);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#e2e8f0';
    g.font = `900 ${Math.round(h * 0.44)}px ${FONT}`;
    g.fillText('OFFICE DISEWAKAN', w / 2, h * 0.42);

    g.fillStyle = '#94a3b8';
    g.font = `500 ${Math.round(h * 0.16)}px ${FONT}`;
    g.fillText('SEWA HUBUNGI 0812xxxxxxx', w / 2, h * 0.72);
  });
}

function createMonitorTex(): THREE.CanvasTexture {
  return makeTex(512, 320, (g, w, h) => {
    g.fillStyle = '#0f172a';
    g.fillRect(0, 0, w, h);
    // Title bar
    g.fillStyle = '#1e293b';
    g.fillRect(0, 0, w, h * 0.08);
    g.fillStyle = '#ef4444';
    g.beginPath(); g.arc(w * 0.04, h * 0.04, h * 0.018, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f59e0b';
    g.beginPath(); g.arc(w * 0.07, h * 0.04, h * 0.018, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#22c55e';
    g.beginPath(); g.arc(w * 0.10, h * 0.04, h * 0.018, 0, Math.PI * 2); g.fill();

    // Code lines
    g.font = `400 ${Math.round(h * 0.05)}px 'JetBrains Mono', monospace`;
    const lines = [
      'const office = {',
      "  name: 'RIZOA HQ',",
      "  vibe: 'premium',",
      '  agents: Infinity,',
      "  coffee: 'required',",
      '  status: \'building\',',
      '};',
    ];
    let ly = h * 0.15;
    lines.forEach((line, i) => {
      g.fillStyle = i % 3 === 0 ? '#c084fc' : i % 3 === 1 ? '#86efac' : '#e2e8f0';
      g.textAlign = 'left';
      g.fillText(line, w * 0.08, ly);
      ly += h * 0.1;
    });
    // Cursor
    g.fillStyle = '#22d3ee';
    g.fillRect(w * 0.08, ly - h * 0.02, w * 0.018, h * 0.04);
  });
}

function createWhiteboardTex(): THREE.CanvasTexture {
  return makeTex(1024, 640, (g, w, h) => {
    g.fillStyle = '#f8fafc';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#94a3b8';
    g.lineWidth = 6;
    g.strokeRect(4, 4, w - 8, h - 8);

    g.fillStyle = '#1e293b';
    g.font = `800 ${Math.round(h * 0.1)}px ${FONT}`;
    g.textAlign = 'left';
    g.fillText('SPRINT ROADMAP', w * 0.06, h * 0.14);

    g.strokeStyle = '#cbd5e1';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w * 0.05, h * 0.2);
    g.lineTo(w * 0.95, h * 0.2);
    g.stroke();

    g.font = `600 ${Math.round(h * 0.065)}px ${FONT}`;
    g.fillStyle = '#475569';
    ['✦ v2.0 — Realtime Sync', '✦ v2.1 — Multi-Agent', '✦ v2.2 — 3D Office', '✦ v2.3 — AI Memory'].forEach((t, i) => {
      g.fillText(t, w * 0.08, h * (0.3 + i * 0.14));
    });

    const stickyColors = ['#fef08a', '#bbf7d0', '#fecaca', '#bfdbfe'];
    const stickyLabels = ['TODO', 'WIP', 'DONE', 'BUG'];
    stickyColors.forEach((color, i) => {
      const sx = w * (0.68 + (i % 2) * 0.14);
      const sy = h * (0.28 + Math.floor(i / 2) * 0.22);
      g.fillStyle = color;
      g.fillRect(sx, sy, w * 0.12, h * 0.16);
      g.fillStyle = '#1e293b';
      g.font = `700 ${Math.round(h * 0.045)}px ${FONT}`;
      g.fillText(stickyLabels[i], sx + w * 0.01, sy + h * 0.04);
    });
  });
}

function createKeyboardTex(): THREE.CanvasTexture {
  return makeTex(256, 128, (g, w, h) => {
    g.fillStyle = '#1a1a2e';
    g.fillRect(0, 0, w, h);
    const rows = [13, 13, 12, 11, 8];
    const keyW = w * 0.062;
    const keyH = h * 0.16;
    const gap = 2;
    let ky = h * 0.08;
    rows.forEach((count) => {
      const rowW = count * (keyW + gap);
      const startX = (w - rowW) / 2;
      for (let i = 0; i < count; i++) {
        g.fillStyle = `rgb(${40 + Math.random() * 15},${42 + Math.random() * 15},${55 + Math.random() * 15})`;
        g.fillRect(startX + i * (keyW + gap), ky, keyW, keyH);
      }
      ky += keyH + gap;
    });
    g.fillStyle = 'rgb(38,40,52)';
    g.fillRect(w * 0.25, ky, w * 0.5, keyH * 0.9);
  });
}

function createFloorTex(): THREE.CanvasTexture {
  return makeTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3a3530';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 200; i++) {
      g.fillStyle = `rgba(${60 + Math.random() * 30},${58 + Math.random() * 28},${52 + Math.random() * 25},${0.15 + Math.random() * 0.15})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 1 + Math.random() * 2);
    }
    g.strokeStyle = 'rgba(30,28,24,0.25)';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke();
    }
  }, 4, 6);
}

function createNeonCodeTex(): THREE.CanvasTexture {
  return makeTex(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.shadowColor = '#818cf8';
    g.shadowBlur = 24;
    g.fillStyle = '#c7d2fe';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 ${Math.round(h * 0.65)}px 'JetBrains Mono', monospace`;
    g.fillText('{ code }', w / 2, h / 2);
  });
}

// ═══════════════════════════════════════════════════════
// DESK HELPER
// ═══════════════════════════════════════════════════════

const DESK_W = 1.6;
const DESK_D = 0.8;
const DESK_H = 0.72;
const DESK_Y = DESK_H / 2 + 0.12;
const MONITOR_W = 0.56;
const MONITOR_H = 0.34;

function buildWorkstation(
  group: THREE.Group,
  x: number, z: number,
  name: string,
  accentColor: number,
  monitors = 2
) {
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x2d1f14, roughness: 0.55, metalness: 0.08 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4, metalness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5 });

  // Desk
  box(group, DESK_W, 0.06, DESK_D, darkWood, x, DESK_Y + 0.03, z);
  [[-DESK_W / 2 + 0.1, -DESK_D / 2 + 0.1], [DESK_W / 2 - 0.1, -DESK_D / 2 + 0.1],
   [-DESK_W / 2 + 0.1, DESK_D / 2 - 0.1], [DESK_W / 2 - 0.1, DESK_D / 2 - 0.1]].forEach(([dx, dz]) => {
    box(group, 0.05, DESK_H, 0.05, blackMat, x + dx, DESK_Y - 0.03, z + dz);
  });

  // Monitors
  const monitorSpacing = monitors === 2 ? 0.4 : 0;
  const monitorStartX = monitors === 2 ? -0.2 : 0;
  for (let m = 0; m < monitors; m++) {
    const mx = x + monitorStartX + m * 0.6;
    const my = DESK_Y + 0.06 + MONITOR_H / 2 + 0.18;
    // Stand
    box(group, 0.04, 0.18, 0.04, blackMat, mx, DESK_Y + 0.06 + 0.09, z - 0.2);
    // Arm
    box(group, 0.04, 0.04, 0.22, blackMat, mx, DESK_Y + 0.06 + 0.18, z - 0.09);
    // Screen bezel
    box(group, MONITOR_W + 0.04, MONITOR_H + 0.03, 0.03, blackMat, mx, my, z - 0.2);
    // Screen content
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(MONITOR_W, MONITOR_H),
      new THREE.MeshBasicMaterial({ map: createMonitorTex() })
    );
    screen.position.set(mx, my, z - 0.182);
    group.add(screen);
  }

  // Keyboard
  const kb = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.012, 0.13),
    new THREE.MeshStandardMaterial({ map: createKeyboardTex(), roughness: 0.7 })
  );
  kb.position.set(x, DESK_Y + 0.06 + 0.006, z + 0.1);
  kb.castShadow = true;
  group.add(kb);

  // Mouse
  const mouse = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.02, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3, metalness: 0.4 })
  );
  mouse.position.set(x + 0.28, DESK_Y + 0.06 + 0.01, z + 0.1);
  mouse.castShadow = true;
  group.add(mouse);

  // Coffee mug
  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.026, 0.065, 12),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.5 })
  );
  mug.position.set(x - 0.35, DESK_Y + 0.06 + 0.032, z + 0.12);
  mug.castShadow = true;
  group.add(mug);

  // Nameplate
  const plateTex = makeTex(256, 64, (g, w, h) => {
    g.fillStyle = '#1e293b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e2e8f0';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(h * 0.48)}px ${FONT}`;
    g.fillText(name, w / 2, h / 2);
  });
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.05),
    new THREE.MeshBasicMaterial({ map: plateTex, side: THREE.DoubleSide })
  );
  plate.position.set(x, DESK_Y + 0.06 + 0.03, z - DESK_D / 2 + 0.04);
  plate.rotation.x = -0.15;
  group.add(plate);

  // Chair
  box(group, 0.46, 0.06, 0.46, accent, x, 0.44, z + 0.65);
  box(group, 0.46, 0.48, 0.06, accent, x, 0.74, z + 0.88);
  cyl(group, 0.025, 0.025, 0.3, blackMat, x, 0.28, z + 0.65, 8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    cyl(group, 0.02, 0.02, 0.04, blackMat, x + Math.cos(a) * 0.18, 0.02, z + 0.65 + Math.sin(a) * 0.18, 8);
  }

  // RGB underglow
  const rgbGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(DESK_W - 0.15, 0.06),
    new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })
  );
  rgbGlow.rotation.x = -Math.PI / 2;
  rgbGlow.position.set(x, DESK_Y - DESK_H / 2 + 0.12 + 0.005, z);
  group.add(rgbGlow);
}

// ═══════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════

export function createOfficeAnnex(): OfficeAnnex {
  const group = new THREE.Group();
  group.name = 'office-annex';

  const white = new THREE.MeshStandardMaterial({ color: 0xf1eee5, roughness: 0.72 });
  const darkWall = new THREE.MeshStandardMaterial({ color: 0x1e1b16, roughness: 0.88 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x83bdc2, roughness: 0.18, metalness: 0.05,
    transparent: true, opacity: 0.38, side: THREE.DoubleSide,
  });
  const aluminium = new THREE.MeshStandardMaterial({ color: 0x8d9aa1, roughness: 0.34, metalness: 0.55 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4, metalness: 0.3 });

  // ═══════════════════════════════════════════════════════
  // STRUCTURE
  // ═══════════════════════════════════════════════════════

  // Floor
  const floorMat = new THREE.MeshStandardMaterial({ map: createFloorTex(), roughness: 0.55, metalness: 0.12 });
  box(group, UNIT_WIDTH + 0.2, 0.18, DEPTH + 0.4, floorMat, CX, 0.03, CZ);

  // No ceiling — open top (atap di-remove)

  // Back wall (shared with coffee shop)
  box(group, UNIT_WIDTH, HEIGHT, 0.3, darkWall, CX, HEIGHT / 2, BACK_Z);
  // Left wall (shared with coffee shop)
  box(group, 0.3, HEIGHT, DEPTH, darkWall, UNIT_LEFT + 0.15, HEIGHT / 2, CZ);
  // Right wall
  box(group, 0.3, HEIGHT, DEPTH, darkWall, UNIT_RIGHT - 0.15, HEIGHT / 2, CZ);

  // ═══════════════════════════════════════════════════════
  // FRONT FACADE: Glass + signage
  // ═══════════════════════════════════════════════════════

  // Dark fascia
  box(group, UNIT_WIDTH + 0.2, 0.9, 0.25, darkWall, CX, 3.8, FRONT_Z + 0.02);
  // Signage
  const signMat = new THREE.MeshBasicMaterial({ map: officeSignTexture(), side: THREE.DoubleSide });
  plane(group, UNIT_WIDTH - 1.0, 0.8, signMat, CX, 3.8, FRONT_Z + 0.18);

  // Glass facade
  const GLASS_H = 2.8;
  const GLASS_Y = 1.6 + GLASS_H / 2;
  const panelCount = 5;
  const panelW = (UNIT_WIDTH - 1.4) / panelCount;
  for (let i = 0; i < panelCount; i++) {
    const px = UNIT_LEFT + 0.7 + panelW * i + panelW / 2;
    plane(group, panelW - 0.1, GLASS_H, glass, px, GLASS_Y, FRONT_Z + 0.04);
  }
  for (let i = 0; i <= panelCount; i++) {
    const fx = UNIT_LEFT + 0.7 + i * panelW;
    box(group, 0.06, GLASS_H + 0.12, 0.1, aluminium, fx, GLASS_Y, FRONT_Z + 0.1);
  }
  box(group, UNIT_WIDTH - 0.4, 0.06, 0.1, aluminium, CX, GLASS_Y + GLASS_H / 2, FRONT_Z + 0.1);
  box(group, UNIT_WIDTH - 0.4, 0.06, 0.1, aluminium, CX, GLASS_Y - GLASS_H / 2, FRONT_Z + 0.1);

  // ═══════════════════════════════════════════════════════
  // INTERIOR: Open-plan workstations (4 rows × 3 columns)
  // ═══════════════════════════════════════════════════════

  const DESK_Z_START = FRONT_Z - 3;
  const DESK_Z_SPACING = 3.2;
  const DESK_X_START = UNIT_LEFT + 2;
  const DESK_X_SPACING = 3.5;
  const deskColors = [0x6366f1, 0x3b82f6, 0x8b5cf6, 0xec4899, 0x14b8a6, 0xf59e0b];
  let deskIdx = 0;

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const dx = DESK_X_START + col * DESK_X_SPACING;
      const dz = DESK_Z_START - row * DESK_Z_SPACING;
      if (dz > BACK_Z + 1.5) {
        const name = deskIdx < 6 ? ['SAARAH', 'CLARA', 'NADIA'][col] || `DEV-${deskIdx + 1}` : `AGENT-${deskIdx + 1}`;
        buildWorkstation(group, dx, dz, name, deskColors[deskIdx % deskColors.length], col === 1 ? 2 : 1);
        deskIdx++;
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // MEETING ROOM (back left corner)
  // ═══════════════════════════════════════════════════════

  const MR_X = UNIT_LEFT + 3.5;
  const MR_Z = BACK_Z + 2.5;
  const MR_W = 5;
  const MR_D = 4;
  const PART_H = 3.2;

  // Partition walls
  const partM = new THREE.MeshStandardMaterial({ color: 0x2d2117, roughness: 0.92 });
  box(group, MR_W, PART_H, 0.22, partM, MR_X, PART_H / 2, MR_Z + MR_D / 2); // front wall
  box(group, 0.22, PART_H, MR_D, partM, MR_X + MR_W / 2, PART_H / 2, MR_Z); // right wall
  // Glass partition (front, facing open office)
  plane(group, MR_W - 0.5, PART_H - 0.3, glass, MR_X, PART_H / 2, MR_Z + MR_D / 2 + 0.13);

  // Meeting table
  const mtgTableMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.45, metalness: 0.08 });
  box(group, 3.0, 0.06, 1.4, mtgTableMat, MR_X + 0.5, 0.72, MR_Z + 0.5);
  [[-1.3, -0.55], [1.3, -0.55], [-1.3, 0.55], [1.3, 0.55]].forEach(([dx, dz]) => {
    box(group, 0.06, 0.72, 0.06, blackMat, MR_X + 0.5 + dx, 0.36, MR_Z + 0.5 + dz);
  });

  // Meeting chairs (8 seats)
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const ci = i % 4;
    const cx = MR_X + 0.5 - 1 + ci * 0.7;
    const cz = MR_Z + 0.5 + side * 1.1;
    box(group, 0.38, 0.05, 0.38, new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.6 }), cx, 0.42, cz);
    box(group, 0.38, 0.38, 0.05, new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.6 }), cx, 0.65, cz + side * 0.17);
    cyl(group, 0.02, 0.02, 0.24, blackMat, cx, 0.28, cz, 8);
  }

  // Whiteboard in meeting room
  const wbMat = new THREE.MeshStandardMaterial({ map: createWhiteboardTex(), roughness: 0.3 });
  const wb = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.8), wbMat);
  wb.position.set(MR_X + 0.5, 2.4, MR_Z - MR_D / 2 + 0.2);
  wb.castShadow = true;
  group.add(wb);

  // Whiteboard tray + markers
  box(group, 3.0, 0.04, 0.08, aluminium, MR_X + 0.5, 1.48, MR_Z - MR_D / 2 + 0.25);
  [0xef4444, 0x3b82f6, 0x22c55e].forEach((c, i) => {
    cyl(group, 0.008, 0.008, 0.12, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }),
      MR_X + 0.3 + i * 0.12, 1.52, MR_Z - MR_D / 2 + 0.27, 8);
  });

  // TV / Display on meeting room wall
  const tvMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.3 });
  box(group, 2.0, 1.2, 0.06, tvMat, MR_X + 0.5, 2.2, MR_Z - MR_D / 2 + 0.16);
  const tvScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x1e293b })
  );
  tvScreen.position.set(MR_X + 0.5, 2.2, MR_Z - MR_D / 2 + 0.125);
  group.add(tvScreen);

  // ═══════════════════════════════════════════════════════
  // SERVER ROOM (back right corner)
  // ═══════════════════════════════════════════════════════

  const SR_X = UNIT_RIGHT - 3;
  const SR_Z = BACK_Z + 2;

  // Glass enclosure
  plane(group, 3.5, PART_H - 0.3, glass, SR_X, PART_H / 2, SR_Z + 1.5);
  box(group, 0.22, PART_H, 3.5, partM, SR_X + 1.75, PART_H / 2, SR_Z);

  // Server racks (3 towers)
  for (let i = 0; i < 3; i++) {
    const rx = SR_X - 0.5 + i * 0.7;
    const rz = SR_Z;
    box(group, 0.55, 1.8, 0.5, blackMat, rx, 1.02, rz);
    box(group, 0.49, 1.72, 0.02, new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 }), rx, 1.02, rz - 0.25);
    // LEDs
    for (let j = 0; j < 10; j++) {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 8, 6),
        new THREE.MeshBasicMaterial({ color: j % 3 === 0 ? 0x22c55e : j % 3 === 1 ? 0x38bdf8 : 0xf59e0b })
      );
      led.position.set(rx - 0.18, 0.3 + j * 0.15, rz - 0.27);
      group.add(led);
    }
  }

  // Server room is cooler: blue-tinted light
  const serverLight = new THREE.PointLight(0x38bdf8, 0.5, 6, 2);
  serverLight.position.set(SR_X + 0.5, 2.5, SR_Z);
  group.add(serverLight);

  // ═══════════════════════════════════════════════════════
  // BREAK AREA (front left corner)
  // ═══════════════════════════════════════════════════════

  const BA_X = UNIT_LEFT + 3;
  const BA_Z = FRONT_Z - 2;

  // Sofa
  box(group, 2.4, 0.45, 0.9, new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.8 }), BA_X, 0.35, BA_Z);
  box(group, 2.4, 0.55, 0.12, new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.8 }), BA_X, 0.5, BA_Z - 0.4);
  // Cushions
  [-0.65, 0.65].forEach((dx) => {
    box(group, 0.5, 0.12, 0.5, new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.85 }), BA_X + dx, 0.62, BA_Z);
  });

  // Coffee table
  box(group, 1.2, 0.04, 0.6, new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.5 }), BA_X, 0.42, BA_Z + 0.8);
  [[-0.5, -0.22], [0.5, -0.22], [-0.5, 0.22], [0.5, 0.22]].forEach(([dx, dz]) => {
    box(group, 0.04, 0.38, 0.04, blackMat, BA_X + dx, 0.21, BA_Z + 0.8 + dz);
  });

  // Bookshelf on right wall
  for (let row = 0; row < 4; row++) {
    const sy = 0.5 + row * 0.6;
    box(group, 0.35, 0.03, 1.0, new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.5 }), UNIT_RIGHT - 0.32, sy, FRONT_Z - 3);
    for (let b = 0; b < 6; b++) {
      const bookH = 0.3 + Math.random() * 0.15;
      const bookColor = [0xdc2626, 0x2563eb, 0x16a34a, 0x9333ea, 0xf59e0b, 0x0ea5e9][b % 6];
      box(group, 0.04, bookH, 0.06,
        new THREE.MeshStandardMaterial({ color: bookColor, roughness: 0.7 }),
        UNIT_RIGHT - 0.34 + b * 0.065, sy + 0.015 + bookH / 2, FRONT_Z - 3.2 + b * 0.065);
    }
  }

  // ═══════════════════════════════════════════════════════
  // PLANTS & DECORATION
  // ═══════════════════════════════════════════════════════

  // Corner plants
  const plantPositions = [
    [UNIT_LEFT + 1, FRONT_Z - 1],
    [UNIT_RIGHT - 1, FRONT_Z - 1],
    [UNIT_LEFT + 1, BACK_Z + 1],
    [CX, FRONT_Z - 1],
  ];
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d8a4e, roughness: 0.7, side: THREE.DoubleSide });

  plantPositions.forEach(([px, pz]) => {
    // Pot
    cyl(group, 0.2, 0.16, 0.35, new THREE.MeshStandardMaterial({ color: 0x8a4f2c, roughness: 0.8 }), px, 0.3, pz, 14);
    // Soil
    cyl(group, 0.18, 0.18, 0.03, new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.95 }), px, 0.48, pz, 14);
    // Leaves
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.35), leafMat);
      leaf.position.set(px + Math.cos(a) * 0.12, 0.55 + (i % 3) * 0.12, pz + Math.sin(a) * 0.12);
      leaf.rotation.order = 'YXZ';
      leaf.rotation.y = -a;
      leaf.rotation.x = -0.45;
      leaf.castShadow = true;
      group.add(leaf);
    }
  });

  // Neon "CODE" sign on back wall
  const neonSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.4),
    new THREE.MeshBasicMaterial({ map: createNeonCodeTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  neonSign.position.set(CX + 2, 3.5, BACK_Z + 0.2);
  group.add(neonSign);

  const neonGlow = new THREE.PointLight(0x818cf8, 0.4, 4, 2);
  neonGlow.position.set(CX + 2, 3.5, BACK_Z + 0.4);
  group.add(neonGlow);

  // ═══════════════════════════════════════════════════════
  // LIGHTING
  // ═══════════════════════════════════════════════════════

  // LED strip ceiling lights
  const stripMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b16, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.3,
  });
  for (let x = -2; x <= 2; x++) {
    box(group, 0.15, 0.04, 1.4, stripMat, CX + x * 4.5, HEIGHT - 0.1, CZ);
  }

  // Accent strip
  const accentStripMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b16, emissive: 0x6366f1, emissiveIntensity: 0.6, roughness: 0.3,
  });
  box(group, UNIT_WIDTH - 2, 0.04, 0.08, accentStripMat, CX, HEIGHT - 0.1, FRONT_Z - 0.5);

  // Main light
  const officeLight = new THREE.PointLight(0xffffff, 1.4, 18, 1.5);
  officeLight.position.set(CX, HEIGHT - 0.5, CZ);
  group.add(officeLight);

  const accentLight = new THREE.PointLight(0x6366f1, 0.5, 8, 2);
  accentLight.position.set(CX, HEIGHT - 0.3, FRONT_Z - 0.7);
  group.add(accentLight);

  // Meeting room light
  const mtgLight = new THREE.PointLight(0xfff5eb, 0.8, 8, 2);
  mtgLight.position.set(MR_X + 0.5, HEIGHT - 0.5, MR_Z + 0.5);
  group.add(mtgLight);

  return { group };
}
