import * as THREE from 'three';

/**
 * INDOMARET — unit kiri dari kompleks ruko (×3).
 *
 * Ukuran disamakan dengan coffee shop: 20×15 unit.
 * x ∈ [-30.1, -10.1], z ∈ [-6.9, 8.3], height 5.4
 *
 * Interior: lorong rak, kulkas display, kasir, lantai keramik, signage khas.
 */

export type IndomaretStore = {
  group: THREE.Group;
};

const UNIT_LEFT = -33.1;
const UNIT_RIGHT = -13.1;
const UNIT_WIDTH = UNIT_RIGHT - UNIT_LEFT; // 20
const BACK_Z = -6.9;
const FRONT_Z = 8.3;
const DEPTH = FRONT_Z - BACK_Z; // 15.2
const HEIGHT = 5.4;
const CX = (UNIT_LEFT + UNIT_RIGHT) / 2; // -20.1
const CZ = (BACK_Z + FRONT_Z) / 2; // 0.7
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

function meshBox(
  group: THREE.Group,
  w: number, h: number, d: number,
  material: THREE.Material,
  x: number, y: number, z: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function meshCyl(
  group: THREE.Group,
  rt: number, rb: number, h: number,
  material: THREE.Material,
  x: number, y: number, z: number,
  seg = 20
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function meshPlane(
  group: THREE.Group,
  w: number, h: number,
  material: THREE.Material,
  x: number, y: number, z: number,
  ry = 0
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  if (ry) mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
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

function indomaretSignTexture(): THREE.CanvasTexture {
  return makeTex(2048, 320, (g, w, h) => {
    // Green background
    g.fillStyle = '#08783f';
    g.fillRect(0, 0, w, h);
    // Red top stripe
    g.fillStyle = '#d9252a';
    g.fillRect(0, 0, w, h * 0.12);
    // Yellow accent
    g.fillStyle = '#f5c242';
    g.fillRect(0, h * 0.12, w, h * 0.06);

    // Border
    g.strokeStyle = 'rgba(255,255,255,.7)';
    g.lineWidth = 6;
    g.strokeRect(12, h * 0.22, w - 24, h * 0.72);

    // Text
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = `900 ${Math.round(h * 0.52)}px ${FONT}`;
    g.fillText('INDOMARET', w / 2, h * 0.62);

    g.fillStyle = 'rgba(255,255,255,.7)';
    g.font = `500 ${Math.round(h * 0.14)}px ${FONT}`;
    g.fillText('MUDAH, DEKAT, DAN HEMAT', w / 2, h * 0.85);
  });
}

function productTexture(color: string, label: string): THREE.CanvasTexture {
  return makeTex(128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.88)';
    g.fillRect(10, 44, 108, 34);
    g.fillStyle = '#17324a';
    g.font = `800 15px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 64, 61);
    g.fillStyle = 'rgba(255,255,255,.4)';
    g.fillRect(18, 17, 92, 7);
  });
}

function shelfTex(): THREE.CanvasTexture {
  return makeTex(256, 64, (g, w, h) => {
    g.fillStyle = '#8a9aa4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.15)';
    g.fillRect(0, 0, w, 2);
    g.fillStyle = 'rgba(0,0,0,.2)';
    g.fillRect(0, h - 2, w, 2);
  });
}

function floorTileTex(): THREE.CanvasTexture {
  return makeTex(512, 512, (g, w, h) => {
    g.fillStyle = '#e8e4dc';
    g.fillRect(0, 0, w, h);
    const n = 8;
    const s = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = 0.94 + ((i * 7 + j * 13) % 5) * 0.02;
        g.fillStyle = `rgb(${Math.round(232 * v)},${Math.round(228 * v)},${Math.round(220 * v)})`;
        g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      }
    }
    g.fillStyle = 'rgba(180,170,155,.4)';
    for (let i = 0; i <= n; i++) {
      g.fillRect(0, i * s - 0.5, w, 1);
      g.fillRect(i * s - 0.5, 0, 1, h);
    }
  }, 4, 6);
}

export function createIndomaret(): IndomaretStore {
  const group = new THREE.Group();
  group.name = 'indomaret-full-store';

  const white = new THREE.MeshStandardMaterial({ color: 0xf1eee5, roughness: 0.72 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0b7040, roughness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd6252a, roughness: 0.58 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2bf3c, roughness: 0.58 });
  const aluminium = new THREE.MeshStandardMaterial({ color: 0x8d9aa1, roughness: 0.34, metalness: 0.55 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.4, metalness: 0.6 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x83bdc2, roughness: 0.18, metalness: 0.05,
    transmission: 0.08, transparent: true, opacity: 0.38,
    side: THREE.DoubleSide,
  });
  const fridgeGlass = new THREE.MeshPhysicalMaterial({
    color: 0x83bdc2, roughness: 0.12, metalness: 0.08,
    transparent: true, opacity: 0.45, side: THREE.DoubleSide,
  });

  // ═══════════════════════════════════════════════════════
  // STRUCTURE: Walls, Floor, Ceiling
  // ═══════════════════════════════════════════════════════

  // Floor — ceramic tiles
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTileTex(), roughness: 0.85, metalness: 0.08 });
  meshBox(group, UNIT_WIDTH + 0.2, 0.18, DEPTH + 0.4, floorMat, CX, 0.03, CZ);

  // Ceiling
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.9 });
  meshBox(group, UNIT_WIDTH, 0.15, DEPTH, ceilingMat, CX, HEIGHT - 0.075, CZ);

  // Back wall (shared with coffee shop)
  meshBox(group, UNIT_WIDTH, HEIGHT, 0.3, white, CX, HEIGHT / 2, BACK_Z);
  // Left wall
  meshBox(group, 0.3, HEIGHT, DEPTH, white, UNIT_LEFT + 0.15, HEIGHT / 2, CZ);
  // Right wall (shared with coffee shop)
  meshBox(group, 0.3, HEIGHT, DEPTH, white, UNIT_RIGHT - 0.15, HEIGHT / 2, CZ);

  // ═══════════════════════════════════════════════════════
  // FRONT FACADE: Indomaret branding
  // ═══════════════════════════════════════════════════════

  // Green fascia
  meshBox(group, UNIT_WIDTH + 0.2, 0.9, 0.25, trim, CX, 3.8, FRONT_Z + 0.02);
  // Signage
  const signMat = new THREE.MeshBasicMaterial({ map: indomaretSignTexture(), side: THREE.DoubleSide });
  meshPlane(group, UNIT_WIDTH - 1.0, 0.8, signMat, CX, 3.8, FRONT_Z + 0.18);
  // Red stripe
  meshBox(group, UNIT_WIDTH + 0.24, 0.1, 0.28, red, CX, 4.3, FRONT_Z + 0.03);
  // Yellow stripe
  meshBox(group, UNIT_WIDTH + 0.24, 0.08, 0.28, yellow, CX, 4.18, FRONT_Z + 0.03);

  // Glass facade with aluminium frames
  const GLASS_H = 2.8;
  const GLASS_Y = 1.6 + GLASS_H / 2;
  const panelCount = 5;
  const panelW = (UNIT_WIDTH - 1.4) / panelCount;
  for (let i = 0; i < panelCount; i++) {
    const px = UNIT_LEFT + 0.7 + panelW * i + panelW / 2;
    meshPlane(group, panelW - 0.1, GLASS_H, glass, px, GLASS_Y, FRONT_Z + 0.04);
  }
  // Frames
  for (let i = 0; i <= panelCount; i++) {
    const fx = UNIT_LEFT + 0.7 + i * panelW;
    meshBox(group, 0.06, GLASS_H + 0.12, 0.1, aluminium, fx, GLASS_Y, FRONT_Z + 0.1);
  }
  // Horizontal frames
  meshBox(group, UNIT_WIDTH - 0.4, 0.06, 0.1, aluminium, CX, GLASS_Y + GLASS_H / 2, FRONT_Z + 0.1);
  meshBox(group, UNIT_WIDTH - 0.4, 0.06, 0.1, aluminium, CX, GLASS_Y - GLASS_H / 2, FRONT_Z + 0.1);

  // ═══════════════════════════════════════════════════════
  // INTERIOR: Shelving aisles
  // ═══════════════════════════════════════════════════════

  const shelfMat = new THREE.MeshStandardMaterial({ map: shelfTex(), roughness: 0.5, metalness: 0.4 });
  const shelfSideMat = new THREE.MeshStandardMaterial({ color: 0x5a6a72, roughness: 0.4, metalness: 0.5 });
  const SHELF_H = 2.2;
  const SHELF_D = 0.45;
  const SHELF_Y = SHELF_H / 2 + 0.12;

  // 6 shelving aisles running front-to-back (relative to CX)
  const aisleX = [-8, -5, -2, 1, 4, 7].map(dx => CX + dx);
  aisleX.forEach((ax) => {
    // Left side of shelf
    meshBox(group, 0.04, SHELF_H, SHELF_D, shelfSideMat, ax, SHELF_Y, CZ - 2);
    // Right side
    meshBox(group, 0.04, SHELF_H, SHELF_D, shelfSideMat, ax + 0.9, SHELF_Y, CZ - 2);
    // Shelves (4 levels)
    for (let lv = 0; lv < 4; lv++) {
      const ly = 0.3 + lv * 0.55;
      meshBox(group, 0.94, 0.035, SHELF_D, shelfMat, ax + 0.45, ly, CZ - 2);
    }

    // Second row (deeper)
    meshBox(group, 0.04, SHELF_H, SHELF_D, shelfSideMat, ax, SHELF_Y, CZ + 1);
    meshBox(group, 0.04, SHELF_H, SHELF_D, shelfSideMat, ax + 0.9, SHELF_Y, CZ + 1);
    for (let lv = 0; lv < 4; lv++) {
      const ly = 0.3 + lv * 0.55;
      meshBox(group, 0.94, 0.035, SHELF_D, shelfMat, ax + 0.45, ly, CZ + 1);
    }

    // Third row (near front)
    meshBox(group, 0.04, SHELF_H, SHELF_D, shelfSideMat, ax, SHELF_Y, CZ + 3.5);
    meshBox(group, 0.04, SHELF_H, SHELF_D, shelfSideMat, ax + 0.9, SHELF_Y, CZ + 3.5);
    for (let lv = 0; lv < 4; lv++) {
      const ly = 0.3 + lv * 0.55;
      meshBox(group, 0.94, 0.035, SHELF_D, shelfMat, ax + 0.45, ly, CZ + 3.5);
    }
  });

  // Products on shelves — colorful boxes
  const productColors = ['#d83b32', '#f0b72f', '#2f83c5', '#ef7a25', '#c74688', '#54a957', '#e11d48', '#0ea5e9'];
  const productLabels = ['SNACK', 'DRINK', 'MILK', 'COFFEE', 'SOAP', 'TEA', 'SAUCE', 'CHIPS'];

  aisleX.forEach((ax, ai) => {
    for (let row = 0; row < 3; row++) {
      const zBase = CZ - 2 + row * 3;
      for (let lv = 0; lv < 4; lv++) {
        const ly = 0.35 + lv * 0.55;
        for (let p = 0; p < 3; p++) {
          const pi = (ai * 3 + row * 4 + lv + p) % productColors.length;
          const prod = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.3, 0.15),
            new THREE.MeshStandardMaterial({ map: productTexture(productColors[pi], productLabels[pi]), roughness: 0.72 })
          );
          prod.position.set(ax + 0.15 + p * 0.26, ly, zBase);
          prod.castShadow = true;
          group.add(prod);
        }
      }
    }
  });

  // ═══════════════════════════════════════════════════════
  // CASHIER COUNTER (near front right)
  // ═══════════════════════════════════════════════════════

  const counterMat = new THREE.MeshStandardMaterial({ color: 0xf1eee5, roughness: 0.6 });
  const counterTop = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.3, metalness: 0.2 });

  // Main counter
  meshBox(group, 4.0, 1.05, 1.2, counterMat, CX + 7, 0.64, FRONT_Z - 1.8);
  meshBox(group, 4.1, 0.06, 1.3, counterTop, CX + 7, 1.19, FRONT_Z - 1.8);

  // Cash register
  meshBox(group, 0.5, 0.35, 0.4, darkMetal, CX + 6, 1.39, FRONT_Z - 1.8);
  // Register screen
  const regScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.22),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })
  );
  regScreen.position.set(CX + 6, 1.52, FRONT_Z - 1.59);
  regScreen.rotation.x = -0.3;
  group.add(regScreen);

  // Conveyor belt area
  meshBox(group, 1.8, 0.06, 0.6, darkMetal, CX + 8, 1.22, FRONT_Z - 1.8);

  // ═══════════════════════════════════════════════════════
  // FRIDGE / COOLER (along left wall)
  // ═══════════════════════════════════════════════════════

  const fridgeBody = new THREE.MeshStandardMaterial({ color: 0xdde8e4, roughness: 0.32, metalness: 0.15 });
  const fridgeInner = new THREE.MeshBasicMaterial({ color: 0x8dd4dc, transparent: true, opacity: 0.4 });

  const fridgeCount = 4;
  const fridgeW = (DEPTH - 2) / fridgeCount;
  for (let i = 0; i < fridgeCount; i++) {
    const fz = BACK_Z + 1 + i * fridgeW + fridgeW / 2;
    const fx = UNIT_LEFT + 1.2;
    // Body
    meshBox(group, 1.0, 3.2, fridgeW - 0.1, fridgeBody, fx, 1.72, fz);
    // Glass door
    meshBox(group, 0.02, 2.8, fridgeW - 0.25, fridgeInner, fx + 0.52, 1.72, fz);
    // Handle
    meshBox(group, 0.04, 0.5, 0.04, darkMetal, fx + 0.56, 1.8, fz);
    // Top red accent
    meshBox(group, 1.02, 0.06, fridgeW - 0.06, red, fx, 3.36, fz);

    // Drinks inside (visible through glass)
    for (let d = 0; d < 3; d++) {
      const dz = fz - fridgeW * 0.3 + d * fridgeW * 0.3;
      for (let row = 0; row < 3; row++) {
        const dy = 0.6 + row * 0.8;
        const drinkColor = [0x22d3ee, 0xf97316, 0x22c55e][d];
        const drink = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 0.35, 10),
          new THREE.MeshStandardMaterial({ color: drinkColor, roughness: 0.4 })
        );
        drink.position.set(fx + 0.2, dy, dz);
        drink.castShadow = true;
        group.add(drink);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // FREEZER CHEST (near entrance)
  // ═══════════════════════════════════════════════════════

  const freezerMat = new THREE.MeshStandardMaterial({ color: 0xc8d6df, roughness: 0.35, metalness: 0.2 });
  meshBox(group, 2.5, 0.9, 1.0, freezerMat, CX - 2, 0.57, FRONT_Z - 1.5);
  // Glass top
  meshBox(group, 2.3, 0.04, 0.8, fridgeGlass, CX - 2, 1.04, FRONT_Z - 1.5);
  // Ice cream boxes inside
  const icecreamColors = [0xf472b6, 0xfbbf24, 0x818cf8, 0x34d399];
  icecreamColors.forEach((c, i) => {
    const ice = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.2, 0.18),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })
    );
    ice.position.set(CX - 3 + i * 0.4, 0.8, FRONT_Z - 1.5);
    group.add(ice);
  });

  // ═══════════════════════════════════════════════════════
  // GONDOLA DISPLAY (end caps near entrance)
  // ═══════════════════════════════════════════════════════

  // 4 gondola end caps near entrance (relative to CX)
  const gondolaColors = [0xf59e0b, 0xef4444, 0x22c55e, 0x8b5cf6];
  [0, 1, 2, 3].forEach((i) => {
    const gx = CX - 6 + i * 1.5;
    const gz = FRONT_Z - 3;
    meshBox(group, 0.6, 1.4, 0.4, new THREE.MeshStandardMaterial({ color: gondolaColors[i], roughness: 0.65 }), gx, 0.82, gz);
    meshBox(group, 0.62, 0.04, 0.42, shelfMat, gx, 0.12, gz);
    meshBox(group, 0.62, 0.04, 0.42, shelfMat, gx, 0.55, gz);
    meshBox(group, 0.62, 0.04, 0.42, shelfMat, gx, 0.98, gz);
  });

  // ═══════════════════════════════════════════════════════
  // LIGHTING
  // ═══════════════════════════════════════════════════════

  // Fluorescent ceiling lights
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xf0f0f0, emissive: 0xffffff, emissiveIntensity: 0.6,
    roughness: 0.2, side: THREE.DoubleSide,
  });
  for (let x = -2; x <= 2; x++) {
    meshBox(group, 0.2, 0.04, 1.2, lightMat, CX + x * 4.5, HEIGHT - 0.1, CZ);
  }

  // Bright white light —Indomaret always well-lit
  const brightLight = new THREE.PointLight(0xfff8f0, 1.8, 18, 1.5);
  brightLight.position.set(CX, HEIGHT - 0.5, CZ);
  group.add(brightLight);

  const frontLight = new THREE.PointLight(0xffffff, 0.8, 10, 2);
  frontLight.position.set(CX, 3, FRONT_Z - 1);
  group.add(frontLight);

  // ═══════════════════════════════════════════════════════
  // DECORATION: Aisle markers, signage inside
  // ═══════════════════════════════════════════════════════

  // "PROMO" hanging sign
  const promoSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide })
  );
  promoSign.position.set(CX, HEIGHT - 0.5, CZ);
  promoSign.rotation.x = -Math.PI / 4;
  group.add(promoSign);

  // Aisle numbers on end caps
  const aisleNumTex = makeTex(128, 128, (g, w, h) => {
    g.fillStyle = '#08783f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 72px ${FONT}`;
    g.fillText('1', w / 2, h / 2);
  });

  // ═══════════════════════════════════════════════════════
  // FLOOR MARKINGS
  // ═══════════════════════════════════════════════════════

  // Queue line
  const queueMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
  meshBox(group, 0.08, 0.02, 3.0, queueMat, CX + 9, 0.12, FRONT_Z - 3);
  meshBox(group, 2.0, 0.02, 0.08, queueMat, CX + 9, 0.12, FRONT_Z - 4.5);

  // "KASIR →" floor arrow
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), arrowMat);
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(CX + 9, 0.13, FRONT_Z - 2.5);
  group.add(arrow);

  return { group };
}
