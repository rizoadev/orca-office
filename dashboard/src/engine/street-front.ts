import * as THREE from 'three';

// Trotoar + jalan raya aspal di depan office.
//
// Kenapa modul ini ada: lantai kayu ruangan berhenti di z=8.3 sementara daun pintu
// mengayun ke luar dan waypoint `out` agen duduk di z=11 — agen keluar kantor lalu
// jalan di atas void. Facade juga menghadap kamera default (z=17), jadi bidang di
// antaranya adalah foreground yang paling sering dilihat, bukan area tersembunyi.
//
// Susunan mengikuti z, dari facade ke arah jalan:
//   8.3  → 12.2   trotoar paving, muka y=+0.020
//   12.2 → 12.6   kanstin, muka y=+0.030
//   12.6 → 27.0   aspal, muka y=-0.115 (turun 15 cm dari trotoar = tinggi kanstin lazim)
//
// Trotoar sengaja HAMPIR RATA dengan lantai (2 cm), bukan 15 cm: mesh agen diposisikan
// pada y=0 tanpa penyesuaian per-zona, jadi trotoar yang lebih tinggi akan menenggelamkan
// mereka. Ketinggian sesungguhnya dibacakan dari kanstin + turunnya bidang aspal.

export type StreetFront = {
  group: THREE.Group;
};

// Kabut scene lemah (FogExp2 0.022), jadi ujung jalan yang kelihatan bakal terbaca
// sebagai garis mati. 27 m cukup jauh untuk keluar frame pada preset kamera default.
const FACADE_Z = 8.3;
const WALK_Z1 = 12.2;
const CURB_Z1 = 12.6;
const ROAD_Z1 = 27.0;

const WALK_X = 13.5; // trotoar sedikit lebih lebar dari bangunan (x ±11)
const ROAD_X = 34;

const WALK_TOP_Y = 0.02;
const CURB_TOP_Y = 0.03;
const ROAD_Y = -0.115;
const SLAB_TOP_Y = -0.13;

const PAVING_TILE_M = 2.4; // satu ubin tekstur = 4 slab 0,6 m
const ASPHALT_TILE_M = 3.0;
const TACTILE_TILE_M = 0.6;

const MARKING_Y = ROAD_Y + 0.012;
const MARKING_COLOR = 0xf1e9d8; // putih gading kusam, bukan putih bersih

function tiledTex(
  size: number,
  tileMeters: number,
  widthM: number,
  depthM: number,
  draw: (g: CanvasRenderingContext2D, px: number, m: number) => void
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size, tileMeters);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // Repeat dihitung dari luas bidang, bukan angka bulat dipaksakan: nat paving harus
  // tetap 0,6 m di trotoar 27 m maupun di strip 0,6 m.
  t.repeat.set(Math.max(1, widthM / tileMeters), Math.max(1, depthM / tileMeters));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Ubin paving beton: slab 0,6 m dengan nat 2 cm, tiap slab beda tone sedikit.
function drawPaving(g: CanvasRenderingContext2D, px: number, m: number) {
  const per = Math.round(m / 0.6);
  const cell = px / per;
  g.fillStyle = '#8d8579';
  g.fillRect(0, 0, px, px);
  for (let iy = 0; iy < per; iy++) {
    for (let ix = 0; ix < per; ix++) {
      const v = 0.86 + ((ix * 7 + iy * 13) % 5) * 0.045;
      g.fillStyle = `rgb(${Math.round(153 * v)},${Math.round(149 * v)},${Math.round(140 * v)})`;
      g.fillRect(ix * cell + 1.5, iy * cell + 1.5, cell - 3, cell - 3);
      // Highlight tipis di tepi atas: bikin nat terbaca celah, bukan coretan.
      g.fillStyle = 'rgba(255,255,255,.16)';
      g.fillRect(ix * cell + 1.5, iy * cell + 1.5, cell - 3, 1.5);
    }
  }
  g.fillStyle = 'rgba(38,32,26,.55)';
  for (let i = 0; i <= per; i++) {
    g.fillRect(0, i * cell - 1, px, 2);
    g.fillRect(i * cell - 1, 0, 2, px);
  }
  for (let i = 0; i < px * 6; i++) {
    g.fillStyle = `rgba(0,0,0,${(i % 3) * 0.02})`;
    g.fillRect((i * 37) % px, (i * 61) % px, 1, 1);
  }
}

// Aspal: dasar nyaris-hitam kebiruan + aggregate terang + patch tambal + retak rambut.
// Tanpa patch, aspal datar terbaca sebagai kanvas hitam.
function drawAsphalt(g: CanvasRenderingContext2D, px: number) {
  g.fillStyle = '#24262b';
  g.fillRect(0, 0, px, px);
  for (let i = 0; i < px * 26; i++) {
    const tone = 40 + ((i * 29) % 70);
    g.fillStyle = `rgba(${tone},${tone + 2},${tone + 8},${0.18 + ((i * 7) % 5) * 0.05})`;
    g.fillRect((i * 97) % px, (i * 53) % px, 1 + (i % 2), 1 + ((i >> 1) % 2));
  }
  const patches: [number, number, number, number][] = [
    [0.22, 0.34, 0.16, 0.1],
    [0.68, 0.62, 0.2, 0.12],
    [0.45, 0.82, 0.12, 0.07],
  ];
  patches.forEach(([cx, cy, rw, rh]) => {
    g.beginPath();
    g.ellipse(cx * px, cy * px, rw * px, rh * px, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(66,68,74,.5)';
    g.fill();
    g.strokeStyle = 'rgba(12,13,16,.5)';
    g.lineWidth = 2;
    g.stroke();
  });
  g.strokeStyle = 'rgba(10,11,14,.5)';
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    let x = (i * 137) % px;
    let y = (i * 211) % px;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      x += 8 + ((i + s) % 5) * 6;
      y += ((i * s + 3) % 7) - 3;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

// Ubin pemandu (guiding block) kuning bermotif titik — ikon trotoar Indonesia, dan
// pemecah bidang abu-abu yang panjang.
function drawTactile(g: CanvasRenderingContext2D, px: number) {
  g.fillStyle = '#c9a227';
  g.fillRect(0, 0, px, px);
  const cell = px / 6;
  for (let iy = 0; iy < 6; iy++) {
    for (let ix = 0; ix < 6; ix++) {
      const cx = (ix + 0.5) * cell;
      const cy = (iy + 0.5) * cell;
      g.fillStyle = 'rgba(90,66,10,.45)';
      g.beginPath();
      g.arc(cx, cy + cell * 0.09, cell * 0.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e3bc3a';
      g.beginPath();
      g.arc(cx, cy, cell * 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function face(w: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const ms = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  ms.rotation.x = -Math.PI / 2;
  ms.position.set(x, y, z);
  ms.receiveShadow = true;
  return ms;
}

function body(w: number, h: number, d: number, mat: THREE.Material, x: number, z: number, topY: number) {
  const ms = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  ms.position.set(x, topY - h / 2, z);
  ms.castShadow = true;
  ms.receiveShadow = true;
  return ms;
}

export function createStreetFront(): StreetFront {
  const group = new THREE.Group();

  const walkDepth = WALK_Z1 - FACADE_Z;
  const walkCenterZ = (FACADE_Z + WALK_Z1) / 2;
  const roadDepth = ROAD_Z1 - CURB_Z1;
  const roadCenterZ = (CURB_Z1 + ROAD_Z1) / 2;

  // ── Tanah dasar: menutup semua celah di luar bangunan supaya tidak ada void ──────
  const dirt = new THREE.MeshStandardMaterial({ color: 0x3b3630, roughness: 0.98 });
  group.add(face(ROAD_X * 2 + 20, 60, dirt, 0, SLAB_TOP_Y, FACADE_Z + 30));

  // ── Trotoar ─────────────────────────────────────────────────────────────────────
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8f887c, roughness: 0.9 });
  group.add(body(WALK_X * 2, WALK_TOP_Y - SLAB_TOP_Y, walkDepth, concrete, 0, walkCenterZ, WALK_TOP_Y));
  group.add(
    face(
      WALK_X * 2,
      walkDepth,
      new THREE.MeshStandardMaterial({
        map: tiledTex(512, PAVING_TILE_M, WALK_X * 2, walkDepth, drawPaving),
        roughness: 0.88,
      }),
      0,
      WALK_TOP_Y + 0.001,
      walkCenterZ
    )
  );

  // Nat ekspansi tiap ~3 m: garis gelap tipis, bukan geometri baru.
  const joint = new THREE.MeshBasicMaterial({ color: 0x5f594f, transparent: true, opacity: 0.5 });
  for (let x = -12; x <= 12; x += 3) {
    group.add(face(0.05, walkDepth, joint, x, WALK_TOP_Y + 0.006, walkCenterZ));
  }

  // Guiding block kuning, sejajar facade.
  group.add(
    face(
      WALK_X * 2 - 1.2,
      TACTILE_TILE_M,
      new THREE.MeshStandardMaterial({
        map: tiledTex(128, TACTILE_TILE_M, WALK_X * 2, TACTILE_TILE_M, drawTactile),
        roughness: 0.8,
      }),
      0,
      WALK_TOP_Y + 0.01,
      WALK_Z1 - 1.5
    )
  );

  // ── Kanstin ─────────────────────────────────────────────────────────────────────
  group.add(
    body(
      WALK_X * 2 + 0.4,
      CURB_TOP_Y - SLAB_TOP_Y,
      CURB_Z1 - WALK_Z1,
      new THREE.MeshStandardMaterial({ color: 0xb3ada1, roughness: 0.85 }),
      0,
      (WALK_Z1 + CURB_Z1) / 2,
      CURB_TOP_Y
    )
  );

  // ── Jalan raya aspal ────────────────────────────────────────────────────────────
  group.add(
    face(
      ROAD_X * 2,
      roadDepth,
      new THREE.MeshStandardMaterial({
        map: tiledTex(512, ASPHALT_TILE_M, ROAD_X * 2, roadDepth, drawAsphalt),
        roughness: 0.94,
        metalness: 0.02,
      }),
      0,
      ROAD_Y,
      roadCenterZ
    )
  );

  // Marka: garis tepi solid + sumbu putus-putus. Lebar marka asli 10-15 cm, dinaikkan
  // sedikit supaya masih kebaca dari kamera crane.
  const marking = new THREE.MeshStandardMaterial({
    color: MARKING_COLOR,
    roughness: 0.6,
    emissive: 0x3a352a,
    emissiveIntensity: 0.25,
  });
  const edgeNearZ = CURB_Z1 + 0.55;
  const edgeFarZ = ROAD_Z1 - 0.55;
  group.add(face(ROAD_X * 2 - 1, 0.16, marking, 0, MARKING_Y, edgeNearZ));
  group.add(face(ROAD_X * 2 - 1, 0.16, marking, 0, MARKING_Y, edgeFarZ));

  const centerZ = (edgeNearZ + edgeFarZ) / 2;
  const DASH_LEN = 2.4;
  const DASH_GAP = 2.9;
  for (let x = -ROAD_X + 2; x < ROAD_X - 2; x += DASH_LEN + DASH_GAP) {
    const len = Math.min(DASH_LEN, ROAD_X - 2 - x);
    if (len <= 0.4) break;
    group.add(face(len, 0.16, marking, x + len / 2, MARKING_Y, centerZ));
  }

  return { group };
}
