import * as THREE from 'three';

// Mezanine mushola di belakang — lantai dua terbuka, naik lewat tangga.
//
// Kenapa di belakang kiri: sisi kanan belakang sudah dipakai lorong + WC, dan mushola
// tidak pantas berada persis di atas toilet. Di bawah pelantai ini area bar + rak
// belakang (permukaan 1.06) jadi 2,8 m ruang bebas masih lega buat barista.
//
// Kenapa terbuka: yang dicari dari layar ini adalah melihat siapa yang sedang di atas.
// Partisi tembok mengubah lantai dua jadi kotak gelap, jadi pembatasnya hanya rel
// kuningan setinggi pinggang dan lengkung mihrab berdiri sendiri di ujung saf.
//
// Tangga di sisi kanan (x[0.6,2.0]) dan pelantai menyisakan lubang rel di bibir depan
// tepat di bawahnya. Anak tangga naik 0.215 — di bawah ambang 0.3 yang dipakai
// officeEngine untuk "waypoint tercapai", jadi agent bisa naik tanpa mesin gerak baru.

export const MEZZ_DECK_Y = 2.8;

export type Mezzanine = {
  group: THREE.Group;
  /** Titik naik-turun dari lantai dasar sampai bibir pelantai. */
  stairWaypoints: THREE.Vector3[];
  /** Pusat saf, menghadap lengkung mihrab di tepi belakang pelantai. */
  prayerSpots: THREE.Vector3[];
  /** Tempat agent berdiri begitu keluar dari mulut tangga. */
  landing: THREE.Vector3;
  /** Titik di lantai dasar, di depan anak tangga pertama — antrean naik mulai dari sini. */
  stairMouth: THREE.Vector3;
  update: (dt: number) => void;
};

const DECK = { x0: -9.4, x1: 2.95, z0: -6.3, z1: -3.75, t: 0.22 };
const STAIR = { x0: 0.6, x1: 2.0, zBottom: -0.25, steps: 13 };
// Saf: 2 baris × 5 helai. Mat 0.62 × 1.0 dengan jarak 0.14 — pas di dalam pelantai
// 2,55 m tanpa menggantung lewat rel depan.
const SAF = { x0: -8.9, x1: -4.4, rows: 2, perRow: 5, matW: 0.62, matD: 1.0, gap: 0.14 };

const OAK_WARM = 0x7a5230;
const OAK_DARK = 0x4a2f1c;
const TRIM = 0x1c130c;
const BRASS = 0xd4af37;
const MAT_GREEN = 0x14532d;
const MAT_CREAM = 0xfde68a;

function mat(color: number, roughness = 0.85, metalness = 0.05): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function plankTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#6b4526';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(${30 + ((i * 7) % 40)},${18 + ((i * 5) % 26)},8,.35)`;
      g.fillRect(0, i * 64, 512, 62);
      g.strokeStyle = 'rgba(0,0,0,.28)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, i * 64 + 63);
      g.lineTo(512, i * 64 + 63);
      g.stroke();
    }
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(255,220,170,${0.02 + Math.random() * 0.05})`;
      g.lineWidth = 1;
      const y = Math.random() * 512;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + 6, 340, y - 6, 512, y + 3);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1.2);
  return tex;
}

function tileTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#cfe3ea';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(15,23,42,.22)';
    g.lineWidth = 3;
    for (let i = 0; i <= 256; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  return tex;
}

/** Satu helai sajadah: bidang tipis + bingkai + penanda dahi menghadap kiblat. */
function prayerMat(w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.022, d), mat(MAT_GREEN, 0.95));
  body.position.y = 0.011;
  body.receiveShadow = true;
  g.add(body);
  const border = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 0.024, d * 0.84), mat(0x166534, 0.95));
  border.position.y = 0.013;
  g.add(border);
  const forehead = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, 0.026, d * 0.17), mat(MAT_CREAM, 0.9));
  forehead.position.set(0, 0.014, -d * 0.34);
  g.add(forehead);
  return g;
}

export function createMusholaMezzanine(): Mezzanine {
  const group = new THREE.Group();
  const add = (m: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D => {
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const slab = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return add(mesh, x, y, z) as THREE.Mesh;
  };

  const deckW = DECK.x1 - DECK.x0;
  const deckD = DECK.z1 - DECK.z0;
  const deckCx = (DECK.x0 + DECK.x1) / 2;
  const deckCz = (DECK.z0 + DECK.z1) / 2;
  const Y = MEZZ_DECK_Y;

  // ---------------------------------------------------------------- pelantai
  slab(deckW, DECK.t, deckD, mat(OAK_WARM, 0.82), deckCx, Y - DECK.t / 2, deckCz);
  const planks = new THREE.Mesh(
    new THREE.PlaneGeometry(deckW, deckD),
    new THREE.MeshStandardMaterial({ map: plankTex(), roughness: 0.85 })
  );
  planks.rotation.x = -Math.PI / 2;
  add(planks, deckCx, Y + 0.003, deckCz);

  slab(deckW + 0.14, 0.34, 0.14, mat(TRIM, 0.7), deckCx, Y - 0.18, DECK.z1 + 0.03);
  slab(0.14, 0.34, deckD + 0.14, mat(TRIM, 0.7), DECK.x1 + 0.03, Y - 0.18, deckCz);
  slab(0.14, 0.34, deckD + 0.14, mat(TRIM, 0.7), DECK.x0 - 0.03, Y - 0.18, deckCz);
  slab(deckW + 0.14, 0.34, 0.14, mat(TRIM, 0.7), deckCx, Y - 0.18, DECK.z0 - 0.03);
  for (let i = 0; i < 4; i++) {
    slab(deckW, 0.18, 0.15, mat(OAK_DARK, 0.75), deckCx, Y - DECK.t - 0.1, DECK.z0 + 0.3 + i * ((deckD - 0.6) / 3));
  }

  const colM = mat(0x3b2a1d, 0.8);
  const columns: [number, number][] = [
    [DECK.x0 + 0.25, DECK.z1 - 0.3],
    [DECK.x0 + 0.25, DECK.z0 + 0.3],
    [-6.3, DECK.z0 + 0.3],
    [-4.6, DECK.z1 - 0.3],
    [-1.45, DECK.z1 - 0.3],
    [-1.45, DECK.z0 + 0.3],
    [0.4, DECK.z0 + 0.3],
    [2.7, DECK.z1 - 0.35],
  ];
  columns.forEach(([x, z]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, Y - DECK.t, 14), colM);
    col.castShadow = true;
    add(col, x, (Y - DECK.t) / 2, z);
    slab(0.32, 0.05, 0.32, mat(TRIM, 0.7), x, 0.025, z);
    slab(0.3, 0.07, 0.3, mat(TRIM, 0.7), x, Y - DECK.t - 0.03, z);
  });

  const underGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(deckW * 0.8, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.16, depthWrite: false })
  );
  underGlow.rotation.x = Math.PI / 2;
  add(underGlow, deckCx, Y - DECK.t - 0.02, DECK.z1 - 0.35);

  // ------------------------------------------------------------------ tangga
  const rise = Y / STAIR.steps;
  const run = Math.abs(DECK.z1 - STAIR.zBottom);
  const tread = run / STAIR.steps;
  const stairCx = (STAIR.x0 + STAIR.x1) / 2;
  const stairW = STAIR.x1 - STAIR.x0;
  const stairWaypoints: THREE.Vector3[] = [];
  for (let i = 0; i < STAIR.steps; i++) {
    const y = rise * (i + 1);
    const z = STAIR.zBottom - tread * (i + 0.5);
    const step = slab(stairW, 0.07, tread + 0.03, mat(OAK_DARK, 0.78), stairCx, y - 0.035, z);
    step.receiveShadow = true;
    stairWaypoints.push(new THREE.Vector3(stairCx, y, STAIR.zBottom - tread * (i + 1)));
  }
  // Dua stringer di sisi, miring mengikuti kemiringan tangga.
  const slope = Math.atan2(Y, run);
  const stringerLen = Math.hypot(Y, run) + 0.3;
  [-1, 1].forEach((side) => {
    const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.26, stringerLen), mat(TRIM, 0.7));
    stringer.rotation.x = slope;
    add(stringer, stairCx + side * (stairW / 2 + 0.05), Y / 2 - 0.08, (STAIR.zBottom + DECK.z1) / 2);
  });
  // Pegangan tangan kuningan di kedua sisi, tiang tiap dua anak tangga.
  [-1, 1].forEach((side) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, stringerLen), mat(BRASS, 0.32, 0.85));
    rail.rotation.x = slope;
    add(rail, stairCx + side * (stairW / 2 + 0.05), Y / 2 + 0.9, (STAIR.zBottom + DECK.z1) / 2);
    for (let i = 0; i < STAIR.steps; i += 2) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), mat(OAK_DARK, 0.7));
      post.castShadow = true;
      add(post, stairCx + side * (stairW / 2 + 0.05), rise * (i + 1) + 0.45, STAIR.zBottom - tread * (i + 1));
    }
  });

  // ------------------------------------------------------------------ rel
  const railH = 0.98;
  const post = (x: number, z: number) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, railH, 0.05), mat(OAK_DARK, 0.7));
    p.castShadow = true;
    return add(p, x, Y + railH / 2, z);
  };
  const railX = (x0: number, x1: number, z: number) => {
    const len = x1 - x0;
    if (len <= 0.2) return;
    slab(len, 0.07, 0.07, mat(BRASS, 0.32, 0.85), (x0 + x1) / 2, Y + railH, z);
    slab(len, 0.04, 0.04, mat(BRASS, 0.32, 0.85), (x0 + x1) / 2, Y + railH * 0.52, z);
    const n = Math.max(2, Math.round(len / 0.4));
    for (let i = 0; i <= n; i++) post(x0 + (len * i) / n, z);
  };
  const railZ = (z0: number, z1: number, x: number) => {
    const len = z1 - z0;
    if (len <= 0.2) return;
    slab(0.07, 0.07, len, mat(BRASS, 0.32, 0.85), x, Y + railH, (z0 + z1) / 2);
    slab(0.04, 0.04, len, mat(BRASS, 0.32, 0.85), x, Y + railH * 0.52, (z0 + z1) / 2);
    const n = Math.max(2, Math.round(len / 0.4));
    for (let i = 0; i <= n; i++) post(x, z0 + (len * i) / n);
  };
  // Bibir depan: bolong selebar mulut tangga.
  railX(DECK.x0, STAIR.x0 - 0.1, DECK.z1);
  railX(STAIR.x1 + 0.1, DECK.x1, DECK.z1);
  railZ(DECK.z0, DECK.z1, DECK.x0);
  railZ(DECK.z0, DECK.z1, DECK.x1);
  railX(DECK.x0, DECK.x1, DECK.z0);

  // ------------------------------------------------------- penanda kiblat
  const mihrabX = (SAF.x0 + SAF.x1) / 2;
  const screen = slab(SAF.x1 - SAF.x0 + 0.6, 0.9, 0.14, mat(0x0b3b22, 0.9), mihrabX, Y + 0.45, DECK.z0 + 0.16);
  screen.castShadow = true;
  [-1, 1].forEach((side) => {
    const pilaster = slab(0.16, 1.35, 0.2, mat(0x14532d, 0.85), mihrabX + side * ((SAF.x1 - SAF.x0) / 2 + 0.22), Y + 0.68, DECK.z0 + 0.16);
    pilaster.castShadow = true;
  });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 8, 20, Math.PI), mat(BRASS, 0.32, 0.8));
  add(arch, mihrabX, Y + 0.95, DECK.z0 + 0.18);
  const archGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 1.5),
    new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.16, depthWrite: false })
  );
  add(archGlow, mihrabX, Y + 0.85, DECK.z0 + 0.24);
  const arrow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.85),
    new THREE.MeshBasicMaterial({ color: MAT_CREAM, transparent: true, opacity: 0.45, depthWrite: false })
  );
  arrow.rotation.x = -Math.PI / 2;
  add(arrow, mihrabX, Y + 0.006, DECK.z0 + 0.85);

  // ------------------------------------------------------------------ saf
  // Titik saf = tempat kaki berdiri di belakang helai, bukan pusat helai: orang
  // shalat berdiri di ujung belakang sajadah lalu turun ke duduk/sujud di atasnya.
  const prayerSpots: THREE.Vector3[] = [];
  const spanX = SAF.x1 - SAF.x0;
  for (let r = 0; r < SAF.rows; r++) {
    const z = DECK.z0 + 0.68 + r * (SAF.matD + SAF.gap);
    for (let i = 0; i < SAF.perRow; i++) {
      const x = SAF.x0 + (spanX * (i + 0.5)) / SAF.perRow;
      const m = prayerMat(SAF.matW, SAF.matD);
      add(m, x, Y + 0.005, z);
      prayerSpots.push(new THREE.Vector3(x, Y, z + SAF.matD * 0.32));
    }
  }

  // ------------------------------------------------------ rak sandal & wudhu
  const rackX = 1.3;
  slab(1.3, 0.06, 0.5, mat(OAK_DARK, 0.8), rackX, Y + 0.03, DECK.z1 - 0.42);
  [0.16, 0.3].forEach((y) => slab(1.26, 0.04, 0.46, mat(TRIM, 0.7), rackX, Y + y, DECK.z1 - 0.42));
  [-0.42, -0.1, 0.24].forEach((dx, i) => {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.3), mat([0x1f2937, 0x7c2d12, 0x0f172a][i], 0.9));
    add(shoe, rackX + dx, Y + 0.36, DECK.z1 - 0.42);
  });

  const wudhuX = 0.15;
  slab(0.9, 0.06, 2.4, new THREE.MeshStandardMaterial({ map: tileTex(), roughness: 0.5 }), wudhuX, Y + 0.03, DECK.z0 + 1.4);
  for (let i = 0; i < 3; i++) {
    const z = DECK.z0 + 0.5 + i * 0.82;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.16, 16), mat(0xe2e8f0, 0.4, 0.2));
    basin.castShadow = true;
    add(basin, wudhuX, Y + 0.32, z);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.26, 10), mat(0x94a3b8, 0.5, 0.4));
    add(stand, wudhuX, Y + 0.13, z);
    const back = slab(0.5, 0.66, 0.06, new THREE.MeshStandardMaterial({ map: tileTex(), roughness: 0.5 }), wudhuX, Y + 0.42, z + 0.3);
    back.castShadow = true;
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 8), mat(BRASS, 0.3, 0.85));
    tap.rotation.x = Math.PI / 2;
    add(tap, wudhuX, Y + 0.54, z + 0.18);
  }

  // ------------------------------------------------------------------ lampu
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 });
  const lampAt = (x: number, z: number) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.62, 10), mat(0x1f2937, 0.6, 0.4));
    pole.castShadow = true;
    add(pole, x, Y + 0.81, z);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.21, 14, 1, true), mat(0x0f172a, 0.7));
    add(shade, x, Y + 1.72, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), lampMat);
    add(bulb, x, Y + 1.66, z);
  };
  lampAt(SAF.x0 - 0.2, DECK.z1 - 0.45);
  lampAt(SAF.x1 + 0.3, DECK.z0 + 0.45);
  lampAt(-2.6, DECK.z1 - 0.5);
  const deckLight = new THREE.PointLight(0xffb066, 0.85, 11);
  add(deckLight, mihrabX, Y + 1.7, DECK.z0 + 1.5);
  const landingLight = new THREE.PointLight(0xffd9a0, 0.5, 6);
  add(landingLight, 1.3, Y + 1.5, DECK.z1 - 1.0);
  const mihrabLight = new THREE.PointLight(0xffd9a0, 0.55, 4.5);
  add(mihrabLight, mihrabX, Y + 1.1, DECK.z0 + 0.5);

  let t = 0;
  return {
    group,
    stairWaypoints,
    prayerSpots,
    landing: new THREE.Vector3(stairCx, Y, DECK.z1 - 0.85),
    // digeser ke kiri dari sumbu tangga: di kanan ada kursi seat_14.
    stairMouth: new THREE.Vector3(stairCx - 0.9, 0, STAIR.zBottom + 0.45),
    update: (dt: number) => {
      t += dt;
      lampMat.opacity = 0.84 + Math.sin(t * 1.6) * 0.06;
      deckLight.intensity = 0.78 + Math.sin(t * 1.6) * 0.09;
    }
  };
}
