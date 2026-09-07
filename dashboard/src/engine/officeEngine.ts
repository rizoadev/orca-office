import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import confetti from 'canvas-confetti';
import { AgentData, FeedEvent, Session, ToolCall } from '../types';
import { AcMode, createWallAcUnit, WallAcUnit } from './wall-ac';
import { createMusholaMezzanine, MEZZ_DECK_Y, Mezzanine } from './mushola-mezzanine';
import { createStreetFront, StreetFront } from './street-front';
import { createIndomaret } from './indomaret';

// Kursi kantor coffee shop (14 spots). `bar: true` = duduk di stool meja panjang
// jendela kiri (kursi biasa dilewati), `topY` = tinggi permukaan mejanya.
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

export type MenuBoardRow = { drink: string; model?: string; price: string; sold?: string };

// Papan tulis signage: latar + garis tepi. Dipakai menu board dan papan penanda lain.
export function paintSignBoard(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: string,
  edge: string
) {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = edge;
  g.lineWidth = Math.max(4, h * 0.035);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
}

// Lanskap luar untuk dinding kaca: sengaja digambar dengan MeshBasicMaterial supaya
// tidak ikut gelap oleh lampu dalam — langit yang terang adalah sumber "cahaya" ruangan.
export function paintSkyBackdrop(g: CanvasRenderingContext2D, w: number, h: number) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5f9fd4');
  sky.addColorStop(0.45, '#a9d3ee');
  sky.addColorStop(0.72, '#ffe7bd');
  sky.addColorStop(1, '#f6e3c3');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  const sunX = w * 0.24;
  const sunY = h * 0.34;
  const glow = g.createRadialGradient(sunX, sunY, 8, sunX, sunY, h * 0.55);
  glow.addColorStop(0, 'rgba(255,250,232,0.78)');
  glow.addColorStop(0.25, 'rgba(255,226,160,0.34)');
  glow.addColorStop(1, 'rgba(255,226,160,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);

  // Kota jauh (kabut biru) + pohon di garis cakrawala.
  g.fillStyle = 'rgba(150,178,205,0.55)';
  for (let i = 0; i < 14; i++) {
    const bw = 26 + ((i * 37) % 60);
    const bh = 40 + ((i * 53) % 130);
    g.fillRect((i * w) / 14, h * 0.72 - bh, bw, bh);
  }
  g.fillStyle = 'rgba(74,107,60,0.85)';
  for (let i = 0; i < 22; i++) {
    const cx = (i * w) / 22 + 12;
    const r = 22 + ((i * 17) % 26);
    g.beginPath();
    g.arc(cx, h * 0.74, r, 0, Math.PI * 2);
    g.fill();
  }

  g.fillStyle = '#e3d3b6';
  g.fillRect(0, h * 0.76, w, h * 0.24);
}

// Menu hiasan sebelum ada satu pun sesi Pi menyeduh token.
const PLACEHOLDER_MENU: MenuBoardRow[] = [
  { drink: 'ESPRESSO', price: '—' },
  { drink: 'LATTE', price: '—' },
  { drink: 'AMERICANO', price: '—' },
];

const SIGN_FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

function clipText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export class OfficeEngine {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;

  // Real data only
  agents: AgentData[] = [];
  seats: Record<string, { seat: THREE.Vector3; stand: THREE.Vector3; rot: number; y: number; topY?: number }> = {};
  waypoints: Record<string, THREE.Vector3> = {};
  playSpots: THREE.Vector3[] = [];
  steams: { m: THREE.Mesh; t: number; base: number }[] = [];
  screens: { m: THREE.MeshBasicMaterial; base: number; ph: number }[] = [];
  seatItems: Record<string, { objects: THREE.Object3D[]; screen?: { m: THREE.MeshBasicMaterial; base: number; ph: number }; steam?: { m: THREE.Mesh; t: number; base: number } }> = {};
  beams: { pk: THREE.Mesh; li: THREE.Line; cur: THREE.QuadraticBezierCurve3; pr: number; sp: number }[] = [];

  // Papan menu 3D — digambar ulang dari tagihan sungguhan (nama kopi = model LLM).
  menuBoardRows: MenuBoardRow[] = PLACEHOLDER_MENU;
  menuSign: THREE.Mesh | null = null;

  // AC tembok. `acMode` auto = daya mengikuti jumlah agent yang lagi kerja.
  wallAc: WallAcUnit | null = null;
  // Mezanine mushola di belakang kiri. Waypoint tangganya ikut didaftarkan supaya
  // agent bisa naik tanpa perubahan pada kode pergerakan.
  mezzanine: Mezzanine | null = null;
  // Agent yang menganggur naik lif ke saf di lantai dua dan tinggal di sana sampai
  // ada task baru. Kapasitas dibatasi jumlah helai sajadah, bukan angka acak.
  musholaIdleAfter = 42;
  musholaSlots = new Map<number, string>();
  // Trotoar + jalan raya di depan facade. Susunan z-nya ada di street-front.ts.
  streetFront: StreetFront | null = null;
  acMode: AcMode = 'auto';
  acPower = 0;

  // Cahaya matahari dari dinding jendela kiri: berkas, genangan di lantai, debu.
  sunShafts: { m: THREE.MeshBasicMaterial; base: number; ph: number }[] = [];
  sunPools: { m: THREE.MeshBasicMaterial; base: number; ph: number }[] = [];
  dust: { pts: THREE.Points; motes: { t: number; lat: number; bay: number; sway: number }[]; bays: THREE.Vector3[]; dir: THREE.Vector3; span: number } | null = null;

  clock = new THREE.Clock();
  simMs = 0;
  speed = 1;
  paused = false;
  labelsOn = true;
  talkPair: { x: string; y: string } | null = null;
  talkT = 0;
  evN = 0;
  events: FeedEvent[] = [];
  tv = new THREE.Vector3();
  tw: { fp: THREE.Vector3; tp: THREE.Vector3; ft: THREE.Vector3; tt: THREE.Vector3; t: number } | null = null;
  animId = 0;

  // Pintu depan ganda: dua daun, engsel di tiang kiri & kanan, bertemu di tengah
  // bukaan. Keduanya mengayun ke luar (+z) — ke dalam akan menyapu sprite yang lagi
  // di area play. Tanda rotasi daun kanan dibalik dari yang kiri supaya sama-sama keluar.
  frontDoorL: THREE.Group | null = null;
  frontDoorR: THREE.Group | null = null;
  doorAngleL = 0;
  doorAngleR = 0;
  // Timer tahan dipisah per daun, bukan satu untuk berdua: kalau digabung, agen kedua
  // yang lewat di sisi berlawanan membuat daun pertama menutup mendadak di tengah ayunan.
  doorHeldUntilL = 0;
  doorHeldUntilR = 0;
  // Ambang trigger selalu dibandingkan ke waypoint pintu, bukan ke posisi bebas:
  // playC cuma 1.6 m dari pintu, jadi jarak saja bikin pintu menganga terus.
  DOOR_LEAD = 1.7;
  DOOR_OPEN_ANGLE = -1.42;
  DOOR_HOLD_OPEN_MS = 1200;

  onStateChange?: () => void;
  onLiveMessage?: (msg: string) => void;
  onToast?: (msg: string) => void;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.canvas = canvas;
    this.overlay = overlay;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d12);
    this.scene.fog = new THREE.FogExp2(0x0b0d12, 0.022);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 150);
    this.camera.position.set(0, 13, 17);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2.12;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 42;
    this.controls.target.set(0, 1, 0.5);

    this.initLights();
    this.initOfficeEnvironment();
    this.initStreetFront();
    this.initWallAc();
    this.initWaypoints();
    this.resize();

    window.addEventListener('resize', this.handleResize);
    canvas.addEventListener('pointerdown', () => { this.tw = null; });
  }

  handleResize = () => {
    this.resize();
  };

  resize() {
    const w = this.canvas.parentElement?.clientWidth || this.canvas.clientWidth;
    const h = this.canvas.parentElement?.clientHeight || this.canvas.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  initLights() {
    // Cahaya jendela sengaja ditahan di bawah "siang bolong": ruangan tetap hangat
    // tapi tidak memutih, dan shadow pass kedua tidak mendominasi fill rate.
    this.scene.add(new THREE.AmbientLight(0x9a8d7a, 0.68));
    const hemi = new THREE.HemisphereLight(0xfff1d6, 0x241a12, 0.62);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffdfb0, 1.0);
    sun.position.set(9, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    this.scene.add(sun);

    // Matahari sore miring dari jendela kiri. Arahnya (0.78, -0.46, 0.44): turun
    // menyilang ruangan, jadi kusen jatuh sebagai garis diagonal di lantai.
    const lowSun = new THREE.DirectionalLight(0xffd9a0, 1.45);
    lowSun.position.set(-14, 9.5, -7);
    lowSun.target.position.set(2, 0, 2);
    lowSun.castShadow = true;
    lowSun.shadow.mapSize.set(2048, 2048);
    const lc = lowSun.shadow.camera;
    lc.left = -18;
    lc.right = 18;
    lc.top = 18;
    lc.bottom = -18;
    lc.near = 0.5;
    lc.far = 46;
    // Bias negatif kecil: tanpa ini permukaan lantai dapat 'shadow acne' dari kusen tipis.
    lowSun.shadow.bias = -0.0006;
    lowSun.shadow.normalBias = 0.02;
    this.scene.add(lowSun, lowSun.target);

    // Pantulan hangat dari lantai/jendela supaya sisi kiri tidak jadi gelap total.
    const bounce = new THREE.PointLight(0xffe2b8, 0.7, 16, 2);
    bounce.position.set(-7.4, 1.6, 1.2);
    this.scene.add(bounce);

    const warm = new THREE.PointLight(0xffb366, 0.55, 22);
    warm.position.set(0, 5, -1);
    this.scene.add(warm);

    const barGlow = new THREE.PointLight(0xff9a3c, 0.9, 10);
    barGlow.position.set(-5.5, 2.6, -4.6);
    this.scene.add(barGlow);

    // Warm rear-corner light sources behind the room, visible as an ambient halo
    // on the back wall and side walls. Sisi kanan dipindah ke lorong toilet.
    [
      [-9.35, 3.45, -5.95],
      [9.15, 3.05, -2.9],
    ].forEach(([x, y, z]) => {
      const cornerGlow = new THREE.PointLight(0xffbf78, 1.65, 9, 1.8);
      cornerGlow.position.set(x, y, z);
      this.scene.add(cornerGlow);
    });
  }

  // ── Dinding kiri: full window ber-frame + lanskap luar yang terang ──────────────
  // Kusen tipis tapi castShadow, jadi sinar sore menjatuhkan garis-garis diagonal
  // ke lantai — itu efek "matahari masuk" yang dicari, bukan sekadar lampu terang.
  buildWindowWall() {
    const X = -10.1;
    const Z0 = -7.7;
    const DEPTH = 16;
    const HEIGHT = 5.4;
    const ZC = Z0 + DEPTH / 2;

    const mat = (c: number, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const frameM = mat(0x1b1611, 0.45, 0.55);
    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };

    // Bukaan kaca: 0.18m di bawah sampai 5.12m di atas — praktis floor-to-ceiling.
    box(0.26, 0.18, DEPTH, mat(0x2a2118, 0.7), X, 0.09, ZC);
    box(0.3, 0.26, DEPTH, mat(0x2a2118, 0.7), X, HEIGHT - 0.13, ZC);
    box(0.3, HEIGHT, 0.3, frameM, X, HEIGHT / 2, Z0 + 0.15);
    box(0.3, HEIGHT, 0.3, frameM, X, HEIGHT / 2, Z0 + DEPTH - 0.15);

    const BAY = 2.0;
    for (let i = 0; i <= DEPTH / BAY; i++) {
      box(0.15, HEIGHT - 0.4, 0.11, frameM, X + 0.02, HEIGHT / 2, Z0 + i * BAY);
    }
    [1.8, 3.6].forEach((y) => {
      box(0.11, 0.09, DEPTH, frameM, X + 0.02, y, ZC);
    });

    // Ambang dalam: tempat gelas & pot kecil.
    box(0.34, 0.06, DEPTH, mat(0x6b4a2b, 0.6), X + 0.24, 0.2, ZC);

    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(DEPTH - 0.2, HEIGHT - 0.4),
      new THREE.MeshStandardMaterial({
        color: 0xcfe9ff,
        transparent: true,
        opacity: 0.13,
        roughness: 0.06,
        metalness: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    glass.rotation.y = Math.PI / 2;
    glass.position.set(X + 0.05, HEIGHT / 2, ZC);
    this.scene.add(glass);

    // Langit luar digambar MeshBasicMaterial: tidak kena pencahayaan dalam, jadi tetap
    // terlihat silau seperti matahari beneran di balik kaca.
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 16),
      new THREE.MeshBasicMaterial({ map: this.createSignTex(1024, 540, paintSkyBackdrop), side: THREE.DoubleSide })
    );
    sky.rotation.y = Math.PI / 2;
    sky.position.set(-14.5, 5.2, ZC);
    this.scene.add(sky);

    const terrace = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, DEPTH + 2),
      mat(0xbfae94, 0.85)
    );
    terrace.rotation.x = -Math.PI / 2;
    terrace.position.set(-12.2, 0.02, ZC);
    terrace.receiveShadow = true;
    this.scene.add(terrace);

    // Semak di luar: siluet bulat, cukup untuk menjual kedalaman.
    const shrubM = mat(0x3f5a33, 0.9);
    [[-12.4, -5.6], [-13.1, -1.2], [-12.6, 3.4], [-13.4, 6.6]].forEach(([x, z], i) => {
      const r = 0.7 + (i % 2) * 0.35;
      const shrub = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), shrubM);
      shrub.position.set(x, r * 0.75, z);
      this.scene.add(shrub);
    });

    // Pot kecil di ambang jendela — di luar rentang meja bar supaya tetap terlihat.
    const potM = mat(0x8a4f2c, 0.8);
    [-6.8, -6.1, 4.6, 6.4].forEach((z, i) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.16, 12), potM);
      pot.position.set(X + 0.24, 0.31, z);
      pot.castShadow = true;
      this.scene.add(pot);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13 + (i % 2) * 0.04, 10, 8), mat(0x4c7a3f, 0.85));
      leaf.position.set(X + 0.24, 0.5, z);
      leaf.castShadow = true;
      this.scene.add(leaf);
    });
  }

  // ── Meja panjang + bar stool di sepanjang dinding kaca ───────────────────────
  buildWindowBar() {
    const mat = (c: number, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const woodM = mat(0x7a5230, 0.55, 0.08);
    const steelM = mat(0x2b3038, 0.35, 0.85);
    const X = -9.5;
    const ZC = -1.0;
    const LEN = 9.2;
    const TOP_Y = 1.06;

    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };

    box(0.92, 0.07, LEN, woodM, X, TOP_Y, ZC);
    box(0.05, 0.26, LEN, mat(0x5c3a20, 0.7), X + 0.44, TOP_Y - 0.17, ZC);
    [-5.2, -1.0, 3.2].forEach((z) => {
      box(0.78, TOP_Y - 0.04, 0.07, steelM, X, (TOP_Y - 0.04) / 2, z);
      box(0.86, 0.04, 0.1, steelM, X, 0.02, z);
    });

    // Rak di tembok kaca + gelas gantung: bikin dinding kiri terasa berfungsi.
    box(0.26, 0.05, LEN, woodM, X - 0.42, 1.66, ZC);
    [-4.4, -2.4, 0.4, 2.4].forEach((z, i) => {
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 10), mat(i % 2 ? 0xe8dcc8 : 0x9ec5d8, 0.6));
      mug.position.set(X - 0.42, 1.74, z);
      mug.castShadow = true;
      this.scene.add(mug);
    });

    const stoolAt = (z: number) => {
      const g = new THREE.Group();
      g.position.set(-8.72, 0, z);
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.06, 18), woodM);
      seat.position.y = 0.72;
      seat.castShadow = true;
      g.add(seat);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 10), steelM);
      post.position.y = 0.36;
      post.castShadow = true;
      g.add(post);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.035, 18), steelM);
      foot.position.y = 0.02;
      g.add(foot);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 6, 18), steelM);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.26;
      g.add(ring);
      this.scene.add(g);
    };
    [-4.4, -2.4, 0.4, 2.4].forEach(stoolAt);

    // Lampu gantung di atas counter: satu point light untuk seluruh bar (murah),
    // tiga kap lampu sebagai visual.
    [-4.2, -1.0, 2.2].forEach((z) => {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 6), mat(0x14181f, 0.6));
      cord.position.set(X, 3.5, z);
      this.scene.add(cord);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.2, 16, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x2f2a24, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })
      );
      shade.position.set(X, 2.9, z);
      shade.castShadow = true;
      this.scene.add(shade);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
      );
      bulb.position.set(X, 2.83, z);
      this.scene.add(bulb);
    });
    const barLight = new THREE.PointLight(0xffc98a, 0.9, 7, 2);
    barLight.position.set(X, 2.7, ZC);
    this.scene.add(barLight);
  }

  // ── Berkas cahaya matahari (volumetrik palsu) + debu melayang ────────────────
  initSunShafts() {
    // Harus sama dengan arah lowSun di initLights — kalau tidak, berkas cahaya dan
    // bayangan kusen saling bertentangan dan otaknya langsung protes.
    const from = new THREE.Vector3(-14, 9.5, -7);
    const to = new THREE.Vector3(2, 0, 2);
    const dir = to.clone().sub(from).normalize();

    const fade = this.createCanvasTex(8, 128, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(255,236,200,0.95)');
      grad.addColorStop(0.55, 'rgba(255,220,160,0.42)');
      grad.addColorStop(1, 'rgba(255,210,140,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });

    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a.toArray(), ...b.toArray(), ...c.toArray(), ...d.toArray()]), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      return geo;
    };

    // 3 berkas, bukan 4: tiap quad tambahan adalah overdraw seukuran layar, dan
    // DoubleSide menggandakannya lagi. Tiga masih terbaca sebagai deretan sinar.
    const bays = [-3.7, -0.7, 2.3];
    const HALF = 0.75;
    const TOP_Y = 4.5;
    const X0 = -9.9;
    const t = TOP_Y / -dir.y;
    const land = new THREE.Vector3(X0, TOP_Y, 0).clone().add(dir.clone().multiplyScalar(t));
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();

    bays.forEach((zc) => {
      const topL = new THREE.Vector3(X0, TOP_Y, zc - HALF);
      const topR = new THREE.Vector3(X0, TOP_Y, zc + HALF);
      const botR = new THREE.Vector3(land.x, 0.03, zc + HALF + dir.z * t);
      const botL = new THREE.Vector3(land.x, 0.03, zc - HALF + dir.z * t);

      const shaft = new THREE.Mesh(
        quad(topL, topR, botR, botL),
        new THREE.MeshBasicMaterial({
          map: fade,
          color: 0xffd9a0,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      shaft.renderOrder = 3;
      this.scene.add(shaft);
      this.sunShafts.push({ m: shaft.material as THREE.MeshBasicMaterial, base: 0.22, ph: Math.random() * 9 });

      // Genangan cahaya di lantai: belah ketupat dari ujung berkas sepanjang meja bar.
      const p0 = botL.clone().addScaledVector(flat, -0.15);
      const p1 = botR.clone().addScaledVector(flat, -0.15);
      const p2 = botR.clone().addScaledVector(flat, 1.9);
      const p3 = botL.clone().addScaledVector(flat, 1.9);
      const pool = new THREE.Mesh(
        quad(p0, p1, p2, p3),
        new THREE.MeshBasicMaterial({
          color: 0xffca7a,
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      pool.rotation.x = 0;
      pool.renderOrder = 2;
      this.scene.add(pool);
      this.sunPools.push({ m: pool.material as THREE.MeshBasicMaterial, base: 0.14, ph: Math.random() * 9 });
    });

    // Debu dalam berkas: 24 titik per bay, digerakkan sepanjang `dir` tiap frame.
    const motes: { t: number; lat: number; bay: number; sway: number }[] = [];
    const positions = new Float32Array(bays.length * 24 * 3);
    for (let bay = 0; bay < bays.length; bay++) {
      for (let i = 0; i < 24; i++) {
        motes.push({ t: Math.random(), lat: (Math.random() - 0.5) * 1.6, bay, sway: Math.random() * 6.28 });
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffe6bd,
        size: 0.035,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    pts.renderOrder = 4;
    this.scene.add(pts);
    this.dust = { pts, motes, bays: bays.map((z) => new THREE.Vector3(X0, TOP_Y, z)), dir, span: t };
    this.stepDust(0);
  }

  // Posisi debu dihitung ulang tiap frame: sepanjang berkas + ayunan lateral kecil.
  stepDust(dt: number) {
    const d = this.dust;
    if (!d) return;
    const attr = d.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    d.motes.forEach((mote, i) => {
      mote.t += dt * 0.012;
      if (mote.t > 1) {
        mote.t = 0;
        mote.lat = (Math.random() - 0.5) * 1.6;
      }
      mote.sway += dt * 0.6;
      const start = d.bays[mote.bay];
      const x = start.x + d.dir.x * d.span * mote.t;
      const y = start.y + d.dir.y * d.span * mote.t;
      const z = start.z + d.dir.z * d.span * mote.t + Math.sin(mote.sway) * 0.05 + mote.lat * 0.35;
      attr.setXYZ(i, x, y, z);
    });
    attr.needsUpdate = true;
  }

  createCanvasTex(w: number, h: number, fn: (g: CanvasRenderingContext2D, w: number, h: number) => void, rx = 1, ry = 1) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (g) fn(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Tekstur signage: resolusi tinggi + anisotropic filtering supaya teks tetap tajam
  // saat dilihat dari sudut kamera yang menukik (penyebab utama tulisan jadi blur).
  createSignTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (g) draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    // Anisotropic filtering HANYA berpengaruh kalau mipmap chain-nya ada —
    // generateMipmaps:false bikin `anisotropy` jadi no-op dan teks yang di-downscale
    // jauh (2000px → ~80px di layar) malah shimmering/hilang. Jadi: mipmaps ON +
    // minFilter trilinear + anisotropy maksimum.
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    try {
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    } catch {
      /* renderer belum siap — fallback ke default */
    }
    t.needsUpdate = true;
    return t;
  }

  /**
   * Tekstur oak. Yang bikin kayu ini terbaca sebagai oak dan bukan "cokelat bergaris"
   * ada dua: cathedral figure (busur bersarang hasil gergajian plain-sawn) dan ray
   * fleck (serpihan pendek medullary ray). Keduanya wajib ada.
   *
   * `dark` bukan sekadar warna dasar diganti: di atas dasar gelap, seluruh stroke gelap
   * akan lenyap, jadi tiap elemen dapat pasangan terang. `shade` menggelapkan merata
   * (dipakai untuk kaki/pedestal supaya tidak semiring permukaan meja).
   */
  createOakTex(size = 512, dark = false, shade = 1) {
    const P = dark
      ? {
          base: '#4a3220',
          boardA: '232,190,138',
          boardB: '10,5,1',
          glue: 'rgba(6,3,1,.7)',
          archDark: '12,6,2',
          archLight: '186,140,84',
          grainDark: '14,7,2',
          grainLight: '204,160,104',
          fleck: '226,188,134',
          flecks: 90,
        }
      : {
          base: '#c9a06a',
          boardA: '255,228,182',
          boardB: '86,52,18',
          glue: 'rgba(48,28,8,.5)',
          archDark: '66,38,12',
          archLight: '255,236,200',
          grainDark: '58,32,10',
          grainLight: '255,234,198',
          fleck: '255,238,204',
          flecks: 140,
        };
    return this.createCanvasTex(size, size, (g, w, h) => {
      g.fillStyle = P.base;
      g.fillRect(0, 0, w, h);

      // Papan-papan terglem: beda tone tipis + garis lem. Tanpa ini tekstur terasa
      // "satu potong" dan malah kelihatan seperti wallpaper.
      const boards = 4;
      const bw = w / boards;
      for (let b = 0; b < boards; b++) {
        g.fillStyle = `rgba(${b % 2 ? P.boardA : P.boardB},${0.05 + Math.random() * 0.05})`;
        g.fillRect(b * bw, 0, bw, h);
        g.fillStyle = P.glue;
        g.fillRect(b * bw, 0, 1.5, h);
      }

      const arches = (cx: number, spread: number) => {
        const n = 5 + ((Math.random() * 4) | 0);
        for (let a = 0; a < n; a++) {
          const rx = spread * (0.18 + a * 0.07);
          const ry = h * (0.18 + a * 0.13);
          // Dua pass: gelap + terang tipis. Pada dark oak cuma pass terang yang
          // membuat figure masih terbaca sama sekali.
          const strokes: [string, number][] = [
            [`rgba(${P.archDark},`, 0.1 + Math.random() * 0.14],
            [`rgba(${P.archLight},`, 0.05 + Math.random() * 0.07],
          ];
          strokes.forEach(([rgb, alpha]) => {
            g.strokeStyle = `${rgb}${alpha})`;
            g.lineWidth = 1 + Math.random() * 2.5;
            for (const [s, e] of [[-Math.PI / 2, Math.PI / 2], [Math.PI / 2, (3 * Math.PI) / 2]] as [number, number][]) {
              g.beginPath();
              g.ellipse(cx, h * 0.5, rx, ry, 0, s, e);
              g.stroke();
            }
          });
        }
      };
      for (let b = 0; b < boards; b++) arches(b * bw + bw * (0.35 + Math.random() * 0.3), bw);

      // Serat memanjang, sedikit bergelombang.
      for (let i = 0; i < 260; i++) {
        const x = Math.random() * w;
        g.strokeStyle = `rgba(${Math.random() > 0.5 ? P.grainDark : P.grainLight},${0.04 + Math.random() * 0.09})`;
        g.lineWidth = 0.6 + Math.random() * 1.6;
        g.beginPath();
        g.moveTo(x, 0);
        for (let y = 0; y <= h; y += 24) g.lineTo(x + Math.sin((y / h) * 6 + x) * 2.2, y);
        g.stroke();
      }

      for (let i = 0; i < P.flecks; i++) {
        g.fillStyle = `rgba(${P.fleck},${0.08 + Math.random() * 0.14})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 9, 1 + Math.random() * 2);
      }

      if (shade < 1) {
        g.fillStyle = `rgba(0,0,0,${1 - shade})`;
        g.fillRect(0, 0, w, h);
      }
    }, 1, 1);
  }

  /** Isi papan menu 3D. Dipanggil ulang tiap tagihan berubah. */
  setMenuBoard(rows: MenuBoardRow[]) {
    const next = rows.length ? rows.slice(0, 5) : PLACEHOLDER_MENU;
    const changed = JSON.stringify(next) !== JSON.stringify(this.menuBoardRows);
    this.menuBoardRows = next;
    if (!changed || !this.menuSign) return;

    // Tekstur lama dibuang dulu: menggantinya tanpa dispose membocorkan VRAM tiap update.
    const material = this.menuSign.material as THREE.MeshBasicMaterial;
    const previous = material.map;
    material.map = this.createSignTex(2194, 768, (g, w, h) => this.drawMenuBoard(g, w, h));
    material.needsUpdate = true;
    previous?.dispose();
  }

  drawMenuBoard(g: CanvasRenderingContext2D, w: number, h: number) {
    paintSignBoard(g, w, h, '#111827', 'rgba(251,191,36,.85)');

    g.fillStyle = '#fde68a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `900 ${Math.round(h * 0.062)}px ${SIGN_FONT}`;
    g.fillText('ORCA24 COWORKING', w / 2, h * 0.09);

    g.strokeStyle = 'rgba(251,191,36,.45)';
    g.lineWidth = Math.max(2, h * 0.006);
    g.beginPath();
    g.moveTo(w * 0.1, h * 0.155);
    g.lineTo(w * 0.9, h * 0.155);
    g.stroke();

    const rows = this.menuBoardRows;
    const top = h * 0.19;
    const bottom = h * 0.96;
    const rowH = (bottom - top) / rows.length;
    const nameSize = Math.min(Math.round(h * 0.085), Math.round(rowH * 0.5));
    const subSize = Math.max(13, Math.round(nameSize * 0.4));

    rows.forEach((row, i) => {
      const center = top + rowH * i + rowH / 2;
      const hasSub = Boolean(row.model);
      const baseline = center - (hasSub ? subSize * 0.55 : 0);

      g.textAlign = 'left';
      g.fillStyle = '#f8fafc';
      g.font = `800 ${nameSize}px ${SIGN_FONT}`;
      const label = String(row.drink || '').toUpperCase();
      g.fillText(label, w * 0.08, baseline);
      const nameWidth = g.measureText(label).width;

      g.textAlign = 'right';
      g.fillStyle = '#fbbf24';
      g.font = `800 ${nameSize}px ${SIGN_FONT}`;
      const price = String(row.price || '');
      g.fillText(price, w * 0.92, baseline);
      const priceWidth = g.measureText(price).width;

      // Titik-titik penghubung, dijepit supaya tidak menimpa harga saat namanya panjang.
      g.textAlign = 'left';
      g.fillStyle = 'rgba(148,163,184,.42)';
      g.font = `600 ${Math.round(nameSize * 0.7)}px ${SIGN_FONT}`;
      const gap = w * 0.92 - priceWidth - (w * 0.08 + nameWidth) - w * 0.04;
      if (gap > 0) g.fillText('·'.repeat(Math.max(2, Math.floor(gap / (nameSize * 0.35)))), w * 0.08 + nameWidth + w * 0.02, baseline);

      if (hasSub) {
        g.fillStyle = 'rgba(148,163,184,.8)';
        g.font = `600 ${subSize}px ${SIGN_FONT}`;
        g.fillText(clipText(String(row.model), 40), w * 0.08, center + nameSize * 0.45);
      }

      // Sisi kanan baris kedua: jumlah seduhan, supaya papan ini terbaca sebagai
      // menu terlaris, bukan sekadar daftar harga.
      if (row.sold) {
        g.textAlign = 'right';
        g.fillStyle = 'rgba(251,191,36,.85)';
        g.font = `700 ${subSize}px ${SIGN_FONT}`;
        g.fillText(String(row.sold), w * 0.92, center + nameSize * 0.45);
      }
    });
  }

  initOfficeEnvironment() {
    const M = (c: number, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
      const ms = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      ms.position.set(x, y, z);
      if (ry) ms.rotation.y = ry;
      ms.castShadow = ms.receiveShadow = true;
      this.scene.add(ms);
      return ms;
    };
    const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 20) => {
      const ms = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
      ms.position.set(x, y, z);
      ms.castShadow = ms.receiveShadow = true;
      this.scene.add(ms);
      return ms;
    };

    // Wood floor
    const woodTex = this.createCanvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#7a5230';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 64; i++) {
        g.fillStyle = `rgba(${40 + (Math.random() * 40 | 0)},${22 + (Math.random() * 22 | 0)},10,.25)`;
        g.fillRect(0, i * 8, w, 3 + Math.random() * 4);
      }
      for (let p = 0; p < 8; p++) {
        g.fillStyle = 'rgba(20,10,4,.55)';
        g.fillRect(p * 64, 0, 2, h);
      }
    }, 6, 4);

    const gf = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 16),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55, metalness: 0.08 })
    );
    gf.rotation.x = -Math.PI / 2;
    gf.position.set(0, 0, 0.3);
    gf.receiveShadow = true;
    this.scene.add(gf);

    // Rugs
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.4), M(0x7c2d12, 0.95));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-1.4, 0.012, 2.6);
    rug.receiveShadow = true;
    this.scene.add(rug);

    const rug2 = new THREE.Mesh(new THREE.CircleGeometry(2.4, 28), M(0x1e3a5f, 0.95));
    rug2.rotation.x = -Math.PI / 2;
    rug2.position.set(6.6, 0.015, 4.6);
    rug2.receiveShadow = true;
    this.scene.add(rug2);

    // Walls
    const wallM = M(0x241a12, 0.9);
    box(22, 5.4, 0.4, wallM, 0, 2.7, -6.9);
    // Dinding kiri: full window ber-frame supaya cahaya sore masuk ke ruangan.
    this.buildWindowWall();
    box(0.4, 5.4, 16, wallM, 10.1, 2.7, 0.3);
    // box(22, 0.5, 0.4, wallM, 0, 5.1, 7.6); // removed top horizontal beam

    // Meja panjang + bar stool menempel dinding kaca, lalu berkas sinarnya.
    this.buildWindowBar();
    this.initSunShafts();

    // Rear room corner lights: thin vertical fixtures + soft wall/floor glow.
    const cornerLightMat = new THREE.MeshStandardMaterial({
      color: 0x2b1808,
      emissive: 0xffa33c,
      emissiveIntensity: 2.4,
      roughness: 0.45,
      metalness: 0.08,
    });
    const cornerGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffb45e,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Pojok belakang kiri: tetap jadi sudut dengan lampu. Pojok belakang kanan
    // sekarang ditempati lorong + ruang toilet, jadi lampunya dipindah ke dinding
    // lorong (lihat blok "Sconce lorong toilet" di bawah).
    [-1].forEach((side) => {
      const strip = box(0.11, 3.75, 0.08, cornerLightMat, side * 9.78, 2.65, -6.54);
      strip.castShadow = false;
      strip.receiveShadow = false;

      const backHalo = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.05), cornerGlowMat.clone());
      backHalo.position.set(side * 9.18, 2.65, -6.64);
      this.scene.add(backHalo);

      const sideHalo = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 4.05), cornerGlowMat.clone());
      sideHalo.position.set(side * 9.88, 2.65, -5.9);
      sideHalo.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.scene.add(sideHalo);

      const floorGlow = new THREE.Mesh(
        new THREE.CircleGeometry(0.95, 32),
        new THREE.MeshBasicMaterial({
          color: 0xff9a3c,
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      floorGlow.rotation.x = -Math.PI / 2;
      floorGlow.position.set(side * 9.25, 0.018, -5.95);
      this.scene.add(floorGlow);
    });

    // Sconce lorong toilet — pengganti lampu sudut kanan, menempel di dinding kanan.
    const corridorStrip = box(0.08, 3.75, 0.11, cornerLightMat, 9.84, 2.65, -2.9);
    corridorStrip.castShadow = false;
    corridorStrip.receiveShadow = false;

    const corridorHalo = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.05), cornerGlowMat.clone());
    corridorHalo.position.set(9.8, 2.65, -2.9);
    corridorHalo.rotation.y = -Math.PI / 2;
    this.scene.add(corridorHalo);

    const corridorFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff9a3c,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    corridorFloorGlow.rotation.x = -Math.PI / 2;
    corridorFloorGlow.position.set(9.1, 0.018, -2.9);
    this.scene.add(corridorFloorGlow);

    // Sconce sudut tembok office × toilet — sisi luar partisi lorong (menghadap ruang
    // duduk) selama ini gelap karena sconce lorong terhalang partisi. Tingginya dibatasi
    // 2.4: partisi cuma setinggi PART_H (3.2), jadi strip 3.75 ala dinding utama akan
    // menembus atap lorong.
    const cornerSconce = box(0.08, 2.4, 0.11, cornerLightMat, 7.42, 1.7, -6);
    cornerSconce.castShadow = false;
    cornerSconce.receiveShadow = false;

    const cornerSconceHalo = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 2.6), cornerGlowMat.clone());
    cornerSconceHalo.position.set(7.35, 1.7, -6);
    cornerSconceHalo.rotation.y = Math.PI / 2;
    this.scene.add(cornerSconceHalo);

    const cornerSconceFloorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff9a3c,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    cornerSconceFloorGlow.rotation.x = -Math.PI / 2;
    cornerSconceFloorGlow.position.set(6.95, 0.018, -6);
    this.scene.add(cornerSconceFloorGlow);

    const cornerSconceLight = new THREE.PointLight(0xffbf78, 1.5, 8, 1.8);
    cornerSconceLight.position.set(6.85, 2.05, -6);
    this.scene.add(cornerSconceLight);

    // Storefront glass. Bukaan pintu (x[4.75, 7.25]) dipotong dari panel: tanpa ini,
    // daun pintu yang mengayun ke luar menyapu bidang kaca di z=7.55.
    const DOOR_GAP: [number, number] = [4.75, 7.25];
    const clipPastDoor = (x0: number, x1: number): [number, number][] => {
      if (x1 <= DOOR_GAP[0] || x0 >= DOOR_GAP[1]) return [[x0, x1]];
      const out: [number, number][] = [];
      if (x0 < DOOR_GAP[0]) out.push([x0, DOOR_GAP[0]]);
      if (x1 > DOOR_GAP[1]) out.push([DOOR_GAP[1], x1]);
      return out;
    };
    for (let i = 0; i < 5; i++) {
      const cx = -7.2 + i * 3.6;
      clipPastDoor(cx - 1.45, cx + 1.45).forEach(([x0, x1]) => {
        const gl = new THREE.Mesh(
          new THREE.PlaneGeometry(x1 - x0, 2.6),
          new THREE.MeshStandardMaterial({ color: 0x9fc7e8, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0.4 })
        );
        gl.position.set((x0 + x1) / 2, 1.7, 7.55);
        this.scene.add(gl);
      });
    }

    // Coffee shop order counter: prominent service bar for the entry flow.
    const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

    const makeSign = (
      draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
      w: number,
      h: number,
      x: number,
      y: number,
      z: number
    ) => {
      // Ukuran canvas ditentukan dari ASPEK papan, bukan dari satuan dunia:
      // 768px tinggi sudah jauh di atas tinggi layar papan (max ~90px), jadi
      // mipmap + anisotropy cukup untuk menjaga teks tetap tajam tanpa memboroskan VRAM.
      const ch = 768;
      const cw = Math.max(256, Math.round(ch * (w / h)));
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: this.createSignTex(cw, ch, draw), side: THREE.DoubleSide })
      );
      sign.position.set(x, y, z);
      this.scene.add(sign);
      return sign;
    };

    const boardBg = paintSignBoard;

    box(5.65, 0.95, 1.12, M(0x3a2517, 0.55), -5.2, 0.48, -4.9);
    box(5.85, 0.08, 1.34, M(0x1c130c, 0.35), -5.2, 1, -4.9);
    box(5.8, 0.18, 0.1, M(0xd09a58, 0.42), -5.2, 1.09, -4.22);
    box(5.7, 0.08, 0.08, new THREE.MeshStandardMaterial({ color: 0x7c2d12, emissive: 0xf59e0b, emissiveIntensity: 0.18 }), -5.2, 0.18, -4.21);
    [-7.55, -6.45, -5.35, -4.25, -3.15].forEach((x) => {
      box(0.045, 0.72, 0.08, M(0x6b3f22, 0.65), x, 0.52, -4.2);
    });

    // Back-bar equipment: menu, espresso machine, cashier, cups, and pastry case.
    // Menu board: isinya live dari tagihan. Kecil dan digantung di bawah mezanine,
    // persis di atas meja pesanan tempat antrean berhenti — papan besar di dinding
    // belakang sekarang tertutup pelantai mushola dan malah terbaca sebagai dinding.
    this.menuSign = makeSign(
      (g, w, h) => this.drawMenuBoard(g, w, h),
      3.0, 1.05, -5.2, 1.8, -4.45
    );



    const espressoMachine = (x: number, z: number) => {
      const group = new THREE.Group();
      group.position.set(x, 1.08, z);
      this.scene.add(group);

      const chrome = new THREE.MeshStandardMaterial({ color: 0xc4ccd6, roughness: 0.16, metalness: 0.96 });
      const darkChrome = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.2, metalness: 0.85 });
      const blackGloss = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.18, metalness: 0.45 });
      const warmBlack = new THREE.MeshStandardMaterial({ color: 0x15100b, roughness: 0.3, metalness: 0.35 });
      const brass = new THREE.MeshStandardMaterial({ color: 0xb7792b, roughness: 0.22, metalness: 0.78 });
      const rubber = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.72, metalness: 0.05 });
      const glow = new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x38bdf8, emissiveIntensity: 1.15, roughness: 0.25, metalness: 0.25 });

      const addBox = (w: number, h: number, d: number, mat: THREE.Material, lx: number, ly: number, lz: number, ry = 0) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(lx, ly, lz);
        mesh.rotation.y = ry;
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      };
      const addCyl = (
        rt: number,
        rb: number,
        h: number,
        mat: THREE.Material,
        lx: number,
        ly: number,
        lz: number,
        seg = 32,
        rot: [number, number, number] = [0, 0, 0]
      ) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
        mesh.position.set(lx, ly, lz);
        mesh.rotation.set(rot[0], rot[1], rot[2]);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      };

      // Mesin kopi hyper-realistis: chrome body, glossy face, gauges, portafilter,
      // steam wand, milk pitcher, drip-tray grill, cups, and subtle animated steam.
      addBox(1.58, 0.58, 0.5, blackGloss, 0, 0.34, 0);
      addBox(1.72, 0.08, 0.58, chrome, 0, 0.68, 0);
      addBox(1.68, 0.07, 0.56, chrome, 0, 0.06, 0);
      addBox(1.44, 0.16, 0.035, warmBlack, 0, 0.5, 0.285);
      addBox(1.32, 0.055, 0.08, darkChrome, 0, 0.19, 0.32);
      addBox(1.52, 0.04, 0.28, darkChrome, 0, 0.1, 0.36);
      for (let i = -5; i <= 5; i++) {
        addBox(0.012, 0.012, 0.25, chrome, i * 0.12, 0.135, 0.38);
      }

      const gaugeTex = this.createCanvasTex(256, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#f8fafc';
        g.beginPath();
        g.arc(w / 2, h / 2, 104, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#111827';
        g.lineWidth = 10;
        g.stroke();
        g.strokeStyle = '#dc2626';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(w / 2, h / 2);
        g.lineTo(w * 0.76, h * 0.34);
        g.stroke();
        g.fillStyle = '#111827';
        g.font = '900 30px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('BAR', w / 2, h * 0.68);
      });
      const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.115, 40), new THREE.MeshBasicMaterial({ map: gaugeTex }));
      gauge.position.set(0, 0.53, 0.308);
      group.add(gauge);

      [-0.4, 0.4].forEach((bx) => {
        addCyl(0.1, 0.1, 0.09, chrome, bx, 0.38, 0.32, 32, [Math.PI / 2, 0, 0]);
        addCyl(0.075, 0.085, 0.08, brass, bx, 0.31, 0.35, 28, [Math.PI / 2, 0, 0]);
        addBox(0.34, 0.045, 0.06, rubber, bx + 0.22, 0.28, 0.43, -0.3);
        addCyl(0.035, 0.035, 0.08, rubber, bx + 0.38, 0.25, 0.48, 18, [Math.PI / 2, 0, 0]);
      });

      [-0.56, -0.28, 0.28, 0.56].forEach((bx, i) => {
        addCyl(0.04, 0.04, 0.035, i % 2 ? brass : chrome, bx, 0.61, 0.305, 20, [Math.PI / 2, 0, 0]);
      });
      addBox(0.38, 0.12, 0.028, glow, 0, 0.63, 0.31);

      addCyl(0.015, 0.015, 0.48, chrome, -0.76, 0.32, 0.28, 16, [-0.52, 0, 0.18]);
      addCyl(0.035, 0.035, 0.045, chrome, -0.83, 0.12, 0.41, 16, [Math.PI / 2, 0, 0]);
      addCyl(0.13, 0.1, 0.24, chrome, -0.98, 0.14, 0.23, 28);
      addBox(0.18, 0.035, 0.05, chrome, -0.83, 0.2, 0.23, 0.45);

      [-0.52, -0.22, 0.16, 0.5].forEach((cx, i) => {
        addCyl(0.075, 0.06, 0.11, M(i % 2 ? 0xfffbeb : 0xf8fafc, 0.46), cx, 0.79, -0.06, 18);
      });
      addBox(0.26, 0.025, 0.08, brass, 0.72, 0.46, 0.31);
      addCyl(0.045, 0.045, 0.09, rubber, 0.84, 0.46, 0.31, 18, [0, 0, Math.PI / 2]);

      const steam = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })
      );
      steam.position.set(x - 0.8, 1.72, z + 0.38);
      this.scene.add(steam);
      this.steams.push({ m: steam, t: Math.random() * 9, base: 1.72 });

      return group;
    };

    // Grinder / back-bar block.
    box(1.2, 1.5, 0.8, M(0x111318, 0.4), -7, 1.7, -5.4);
    box(1.2, 0.1, 0.8, new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff9a3c, emissiveIntensity: 0.6 }), -7, 0.95, -5.4);
    cyl(0.34, 0.28, 0.38, new THREE.MeshStandardMaterial({ color: 0x9aa3b2, transparent: true, opacity: 0.42, roughness: 0.16, metalness: 0.25 }), -4.95, 1.54, -5.24, 32);
    cyl(0.22, 0.26, 0.22, M(0x3f2a1b, 0.45, 0.22), -4.95, 1.18, -5.24, 24);
    espressoMachine(-4.38, -4.72);
    box(0.45, 0.28, 0.32, M(0x0f172a, 0.45), -3.35, 1.2, -4.35, -0.25);
    box(0.36, 0.2, 0.04, new THREE.MeshStandardMaterial({ color: 0x111827, emissive: 0x38bdf8, emissiveIntensity: 0.9 }), -3.3, 1.32, -4.18, -0.25);
    box(1.18, 0.4, 0.45, new THREE.MeshStandardMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.15 }), -6.35, 1.28, -4.22);
    [-6.7, -6.35, -6.02].forEach((x, i) => {
      cyl(0.11, 0.13, 0.09, M(i % 2 ? 0xf59e0b : 0x92400e, 0.75), x, 1.08, -4.08, 14);
    });

    // Queue guide on the floor so agents visibly walk to the counter before seating.
    box(0.08, 0.035, 2.0, M(0xd97706, 0.5), -6.75, 0.035, -2.55);
    box(0.08, 0.035, 2.0, M(0xd97706, 0.5), -3.65, 0.035, -2.55);
    box(3.18, 0.035, 0.08, M(0xd97706, 0.5), -5.2, 0.035, -1.55);

    // Standing lamp mundur ke tembok belakang, di sisi kanan ujung counter. Sengaja di
    // luar lajur jalan order→gN (z≈-2.9) supaya tidak pernah ditembus agent.
    const LAMP_X = -1.55;
    const LAMP_Z = -6.15;
    const lampBrass = new THREE.MeshStandardMaterial({ color: 0xb7792b, roughness: 0.26, metalness: 0.8 });
    const lampIron = new THREE.MeshStandardMaterial({ color: 0x1c130c, roughness: 0.5, metalness: 0.35 });
    const lampShade = new THREE.MeshStandardMaterial({
      color: 0xf7e3c0,
      emissive: 0xffb366,
      emissiveIntensity: 1.35,
      roughness: 0.62,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

    cyl(0.3, 0.36, 0.06, lampIron, LAMP_X, 0.03, LAMP_Z, 24);
    cyl(0.045, 0.05, 1.62, lampBrass, LAMP_X, 0.84, LAMP_Z, 14);
    const shade = cyl(0.26, 0.44, 0.5, lampShade, LAMP_X, 1.9, LAMP_Z, 28);
    shade.castShadow = false;
    cyl(0.055, 0.055, 0.06, lampBrass, LAMP_X, 2.18, LAMP_Z, 14);

    // Bibir bawah kap = sumber cahaya yang kelihatan, bukan cuma PointLight tak terlihat.
    const lampMouth = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffd9a0,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    lampMouth.rotation.x = Math.PI / 2;
    lampMouth.position.set(LAMP_X, 1.655, LAMP_Z);
    this.scene.add(lampMouth);

    const lampPool = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffb366,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    lampPool.rotation.x = -Math.PI / 2;
    lampPool.position.set(LAMP_X, 0.02, LAMP_Z);
    this.scene.add(lampPool);

    const lampLight = new THREE.PointLight(0xffc27a, 1.5, 9, 1.7);
    lampLight.position.set(LAMP_X, 1.78, LAMP_Z);
    this.scene.add(lampLight);


    const barista = this.createPersonMesh(0xf59e0b, 'Barista');
    barista.g.position.set(-5.45, 0, -5.75);
    barista.g.rotation.y = 0;
    barista.aL.rotation.x = -0.55;
    barista.aR.rotation.x = -0.85;

    // Barista standby detail: apron, cap, name badge, towel, cup, and tamper.
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.68, metalness: 0.06 });
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.42, 0.035), apronMat);
    apron.position.set(0, 0.76, 0.205);
    apron.castShadow = true;
    barista.g.add(apron);

    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.012), new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.42, metalness: 0.2 }));
    badge.position.set(0.08, 0.88, 0.228);
    barista.g.add(badge);

    const capMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.52, metalness: 0.04 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 24), capMat);
    cap.position.set(0, 0.17, 0);
    cap.castShadow = true;
    barista.head.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.025, 0.14), capMat);
    brim.position.set(0, 0.14, 0.13);
    brim.castShadow = true;
    barista.head.add(brim);

    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.035), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.86 }));
    towel.position.set(-0.23, 0.84, 0.18);
    towel.rotation.z = 0.12;
    towel.castShadow = true;
    barista.g.add(towel);

    const cupInHand = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.11, 16), new THREE.MeshStandardMaterial({ color: 0xfffbeb, roughness: 0.5, metalness: 0.08 }));
    cupInHand.position.set(-0.31, 0.72, 0.18);
    cupInHand.rotation.x = 0.2;
    cupInHand.castShadow = true;
    barista.g.add(cupInHand);

    const tamper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 18), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.28, metalness: 0.75 }));
    tamper.position.set(0.31, 0.72, 0.16);
    tamper.rotation.z = Math.PI / 2;
    tamper.castShadow = true;
    barista.g.add(tamper);

    // Columns
    [[-9.6, -1], [9.6, -1], [-9.6, 4], [9.6, 4]].forEach(([x, z]) => box(0.34, 3.4, 0.34, M(0x1d140d, 0.7), x, 1.7, z));

    // Tables helper
    // Setiap meja dicatat supaya nomornya bisa dihitung belakangan (lihat blok
    // "Nomor meja" di bawah) alih-alih di-hardcode per meja.
    const tableSpots: { x: number; z: number; ex: number; ez: number; round: boolean }[] = [];
    const oakTop = new THREE.MeshStandardMaterial({ map: this.createOakTex(512, true), roughness: 0.46, metalness: 0.04 });
    const oakBase = new THREE.MeshStandardMaterial({ map: this.createOakTex(512, true, 0.68), roughness: 0.62, metalness: 0.03 });
    const roundTable = (x: number, z: number, r: number) => {
      cyl(r, r, 0.08, oakTop, x, 0.72, z, 28);
      cyl(0.12, 0.3, 0.7, oakBase, x, 0.36, z, 12);
      tableSpots.push({ x, z, ex: r, ez: r, round: true });
    };
    const rectTable = (x: number, z: number, w: number, d: number) => {
      box(w, 0.07, d, oakTop, x, 0.72, z);
      [[-w / 2 + 0.15, -d / 2 + 0.15], [w / 2 - 0.15, -d / 2 + 0.15], [-w / 2 + 0.15, d / 2 - 0.15], [w / 2 - 0.15, d / 2 - 0.15]].forEach(([dx, dz]) =>
        box(0.09, 0.72, 0.09, oakBase, x + dx, 0.36, z + dz)
      );
      tableSpots.push({ x, z, ex: w / 2, ez: d / 2, round: false });
    };

    // Ground tables — area depan counter (lajur antrean x[-6.75,-3.65] z[-3.55,-1.55])
    // dibersihkan total, meja digeser ke pinggir kiri, area tengah, dan deret jendela depan.
    roundTable(-3.6, 2.2, 1.05);
    roundTable(3.4, 2, 1.05);
    rectTable(-1.4, 5, 2.6, 0.95);
    roundTable(0.6, -1.8, 0.95);
    // Meja 6 dulu duduk persis di sumbu tangga (x 1.4, z 0.95) — pelantai mushola
    // turun di x[0.6,2.0] z=-0.25, jadi meja menutup mulut tangga dan antrean naik.
    // digeser ke tengah, keluar dari sumbu itu. z sengaja tetap < 1.6: nomor kartu
    // dihitung dari urutan (z, x), naik ke 1.6+ akan mengubahnya jadi TABLE 8.
    roundTable(-0.6, 1.5, 0.9);
    roundTable(-6.95, 1.8, 0.8);
    roundTable(6.75, 1.6, 0.8);
    roundTable(4.9, -1.6, 0.8);
    rectTable(1.5, 5.9, 2.2, 0.95);

    // Back tables
    rectTable(0, -3.9, 2.6, 0.95);
    roundTable(3.6, -3.6, 1.05);
    roundTable(6.4, -3.4, 0.85);

    // Sisi kiri ditempati meja panjang jendela (buildWindowBar) — meja bulat lama
    // akan menabrak counter-nya.
    roundTable(-5.9, 6.75, 0.7);
    roundTable(-4.4, 6.75, 0.7);

    // Nomor meja — kartu tent ala kafe: kertas krem 15×11cm di atas dudukan kuningan,
    // bukan papan emissive. Jauh lebih kecil dari versi awal (0.66×0.40) yang di skala
    // dunia setara papan 66cm di atas meja kopi. Konsekuensinya disengaja: di kamera
    // default angkanya cuma ~5px dan baru kebaca setelah zoom — itu harga dari realistis.
    const CARD_W = 0.15;
    const CARD_H = 0.11;
    const STAND_H = 0.055;
    const hw = CARD_W / 2;
    const hd = CARD_H / 2;
    const cardTexW = 256;
    const cardTexH = Math.round(cardTexW / (CARD_W / CARD_H));
    const cardBrass = new THREE.MeshStandardMaterial({ color: 0xb7792b, roughness: 0.26, metalness: 0.8 });
    tableSpots
      .sort((a, b) => a.z - b.z || a.x - b.x)
      .forEach((t, i) => {
        // Jarak terjauh pusat kartu ke tepi depan (+z) dengan sudut terjauh MASIH
        // menapak di permukaan. Dulu offsetnya rasio buta (ex*0.45, ez*0.5) yang di
        // meja bundar kecil menjuntai sampai 14cm ke luar lingkaran.
        const reach = t.round ? Math.sqrt(Math.max(0, t.ex * t.ex - hw * hw)) : t.ez;
        const cz = t.z + reach - hd - 0.01;

        cyl(0.035, 0.045, 0.012, cardBrass, t.x, 0.766, cz, 12);
        cyl(0.006, 0.006, STAND_H, cardBrass, t.x, 0.76 + STAND_H / 2, cz, 6);

        const card = new THREE.Mesh(
          new THREE.PlaneGeometry(CARD_W, CARD_H),
          new THREE.MeshBasicMaterial({
            map: this.createSignTex(cardTexW, cardTexH, (g, w, h) => {
              g.fillStyle = '#efe7d6';
              g.fillRect(0, 0, w, h);
              for (let s = 0; s < 260; s++) {
                g.fillStyle = `rgba(120,100,70,${Math.random() * 0.06})`;
                g.fillRect(Math.random() * w, Math.random() * h, 2, 1);
              }
              g.strokeStyle = '#3b2f22';
              g.lineWidth = Math.max(1, h * 0.014);
              g.strokeRect(w * 0.06, h * 0.09, w * 0.88, h * 0.82);
              g.lineWidth = Math.max(1, h * 0.006);
              g.strokeRect(w * 0.088, h * 0.128, w * 0.824, h * 0.744);
              g.fillStyle = '#3b2f22';
              g.textAlign = 'center';
              g.textBaseline = 'middle';
              g.font = `700 ${Math.round(h * 0.115)}px ${FONT}`;
              g.fillText('TABLE', w / 2, h * 0.27);
              g.font = `900 ${Math.round(h * 0.44)}px ${FONT}`;
              g.fillText(String(i + 1), w / 2, h * 0.62);
            }),
            side: THREE.DoubleSide,
          })
        );
        card.position.set(t.x, 0.76 + STAND_H + hd, cz);
        card.rotation.x = -0.22;
        this.scene.add(card);
      });

    // Lounge & Playground
    box(2.6, 0.42, 0.9, M(0x274058, 0.85), -7.6, 0.21, 4.6, 0.2);
    box(1.5, 0.5, 0.7, M(0x0f766e, 0.85), 5.2, 0.25, -4.4);
    box(0.9, 0.35, 0.9, M(0xb45309, 0.9), 6.9, 0.18, 3.6);
    box(0.9, 0.35, 0.9, M(0x7c3aed, 0.9), 7.9, 0.18, 4.6);
    box(0.9, 0.35, 0.9, M(0x0ea5e9, 0.9), 6, 0.18, 5.4);
    box(2.2, 0.75, 1.1, M(0x14532d, 0.7), 3.4, 0.45, -4.9);
    box(2, 0.06, 0.9, new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.9 }), 3.4, 0.86, -4.9);

    // Arcade machine
    box(1, 0.9, 0.5, M(0x7c2d12, 0.6), 8.9, 0.45, 2.2);
    const arcS = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
    arcS.position.set(8.9, 0.75, 1.93);
    arcS.rotation.y = Math.PI;
    this.scene.add(arcS);

    // Tanaman hias: cannabis. Pojok belakang kanan tetap di sisi lorong toilet
    // (6.95, -0.95) supaya tidak kejebak di dalam ruang WC.
    // Daunnya digambar ke tekstur lalu ditempel ke bidang miring — siluet 7-leaflet
    // runcing itu satu-satunya bentuk yang langsung dikenali; blob Dodecahedron
    // tidak akan pernah kelihatan begitu, sekeras apa pun warnanya diganti.
    const weedLeafTex = this.createSignTex(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const ox = w / 2;
      const oy = h * 0.94;
      const leaflet = (len: number, wid: number, teeth: number) => {
        // Sisi kanan naik ke ujung, lalu cermin turun — takik tiap langkah bikin
        // margin serrated yang jadi ciri daunnya.
        const edge: [number, number][] = [];
        for (let i = 1; i <= teeth; i++) {
          const t = i / teeth;
          const half = wid * Math.sin(Math.PI * (0.16 + 0.84 * t)) * (1 - t * 0.5);
          edge.push([half, -len * t]);
          edge.push([half * 0.48, -len * (t + 0.4 / teeth)]);
        }
        g.beginPath();
        g.moveTo(0, 0);
        edge.forEach(([px, py]) => g.lineTo(px, py));
        g.lineTo(0, -len);
        for (let i = edge.length - 1; i >= 0; i--) g.lineTo(-edge[i][0], edge[i][1]);
        g.closePath();
        g.fill();
        g.stroke();
      };
      // [derajat dari vertikal, panjang relatif] — leaflet tengah paling panjang.
      const blades: [number, number][] = [[0, 1], [-24, 0.93], [24, 0.93], [-49, 0.76], [49, 0.76], [-76, 0.52], [76, 0.52]];
      const grad = g.createLinearGradient(0, oy, 0, oy - h * 0.86);
      grad.addColorStop(0, '#2f7033');
      grad.addColorStop(1, '#15471a');
      g.fillStyle = grad;
      g.strokeStyle = 'rgba(8,36,10,.6)';
      g.lineWidth = 3;
      blades.forEach(([deg, rel]) => {
        g.save();
        g.translate(ox, oy);
        g.rotate((deg * Math.PI) / 180);
        leaflet(h * 0.86 * rel, w * 0.052 * rel, 7);
        g.restore();
      });
      g.strokeStyle = 'rgba(158,214,148,.32)';
      g.lineWidth = 2;
      blades.forEach(([deg, rel]) => {
        g.save();
        g.translate(ox, oy);
        g.rotate((deg * Math.PI) / 180);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -h * 0.84 * rel);
        g.stroke();
        g.restore();
      });
    });
    // alphaTest tanpa transparent: urutan render tetap benar dan shadow map ikut
    // memotong daun, jadi tanaman tidak melempar bayangan jadi satu blob kotak.
    const weedLeafMat = new THREE.MeshStandardMaterial({
      map: weedLeafTex,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.72,
      metalness: 0.02,
    });
    const weedAt = (x: number, z: number, s: number) => {
      cyl(0.3 * s, 0.22 * s, 0.34 * s, M(0x9a4a2f, 0.85), x, 0.17 * s, z, 16);
      cyl(0.315 * s, 0.315 * s, 0.045 * s, M(0x7d3a24, 0.85), x, 0.35 * s, z, 16);
      cyl(0.27 * s, 0.27 * s, 0.02, M(0x241a10, 0.95), x, 0.36 * s, z, 16);
      cyl(0.022, 0.038 * s, 1.0 * s, M(0x4d6b28, 0.8), x, 0.85 * s, z, 8);

      // Tiga tingkat daun, tiap tingkat lebih lebar dan lebih menunduk.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.35;
        const tier = i % 3;
        const size = (0.62 + tier * 0.1) * s;
        const base = (0.55 + tier * 0.3) * s;
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(size, size), weedLeafMat);
        leaf.position.set(x + Math.cos(a) * 0.06 * s, base + 0.44 * size, z + Math.sin(a) * 0.06 * s);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = -a;
        leaf.rotation.x = -0.5 - tier * 0.18;
        leaf.castShadow = true;
        this.scene.add(leaf);
      }

      // Bud di pucuk, biar puncak tanaman tidak berhenti jadi kipas rata.
      const budMat = M(0x86b061, 0.85);
      [[0, 1.34, 0.085], [0.1, 1.2, 0.06], [-0.09, 1.22, 0.06]].forEach(([dx, dy, dr]) => {
        const bud = new THREE.Mesh(new THREE.IcosahedronGeometry(dr * s, 0), budMat);
        bud.position.set(x + dx * s, dy * s, z);
        bud.castShadow = true;
        this.scene.add(bud);
      });
    };
    [
      [-9.4, -5.9, 1.0],
      [6.95, -0.95, 0.85],
      [-9.4, 6.6, 0.95],
      [9.4, 6.6, 0.9],
      [3.2, 6.6, 0.8],
      [-3, 6.6, 0.8],
    ].forEach(([x, z, s]) => weedAt(x, z, s));

    // ---------------------------------------------------------------------
    // Lorong + ruang toilet di pojok belakang kanan.
    // Koridor : x[7.6, 9.9]  z[-4.45, -1.5]  (mulut lorong menghadap area duduk)
    // Ruang WC: x[7.6, 9.9]  z[-6.7, -4.45]
    // Dinding belakang (z=-6.9) dan dinding kanan (x=10.1) yang sudah ada
    // dipakai sebagai sisi luar ruang WC.
    // ---------------------------------------------------------------------
    const PART_T = 0.22;
    const PART_H = 3.2;
    const partM = M(0x2d2117, 0.92);
    const partTrimM = M(0x1c130c, 0.6);

    // Dinding kiri lorong.
    box(PART_T, PART_H, 5.2, partM, 7.6, PART_H / 2, -4.1);
    box(PART_T + 0.05, 0.09, 5.2, partTrimM, 7.6, 0.045, -4.1);

    // Dinding depan WC dengan lubang pintu di x[8.3, 9.35].
    box(0.7, PART_H, PART_T, partM, 7.95, PART_H / 2, -4.45);
    box(0.55, PART_H, PART_T, partM, 9.625, PART_H / 2, -4.45);
    box(1.05, 0.55, PART_T, partM, 8.825, 2.925, -4.45);
    // Kusen pintu.
    box(0.08, 2.72, PART_T + 0.05, partTrimM, 8.3, 1.36, -4.45);
    box(0.08, 2.72, PART_T + 0.05, partTrimM, 9.35, 1.36, -4.45);

    // Daun pintu dibuka ke dalam ruang WC.
    const wcDoor = new THREE.Group();
    wcDoor.position.set(8.34, 0, -4.45);
    wcDoor.rotation.y = 0.72;
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.98, 2.62, 0.06), M(0x4a2f1c, 0.62));
    doorPanel.position.set(0.49, 1.31, 0);
    doorPanel.castShadow = true;
    doorPanel.receiveShadow = true;
    wcDoor.add(doorPanel);
    const doorHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.28, metalness: 0.85 })
    );
    doorHandle.rotation.x = Math.PI / 2;
    doorHandle.position.set(0.86, 1.12, 0.07);
    wcDoor.add(doorHandle);
    this.scene.add(wcDoor);

    // Lantai keramik lorong + ruang WC, kontras dengan lantai kayu.
    const tileTex = this.createCanvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#525a66';
      g.fillRect(0, 0, w, h);
      const n = 4;
      const s = w / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          g.fillStyle = (i + j) % 2 ? '#6d7683' : '#79828f';
          g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
        }
      }
    }, 3, 7);
    const corridorFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 2.95),
      new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.4, metalness: 0.12 })
    );
    corridorFloor.rotation.x = -Math.PI / 2;
    corridorFloor.position.set(8.75, 0.02, -2.975);
    corridorFloor.receiveShadow = true;
    this.scene.add(corridorFloor);

    const wcFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 2.25),
      new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.34, metalness: 0.14 })
    );
    wcFloor.rotation.x = -Math.PI / 2;
    wcFloor.position.set(8.75, 0.023, -5.575);
    wcFloor.receiveShadow = true;
    this.scene.add(wcFloor);

    // Papan nama di atas pintu.
    makeSign((g, w, h) => {
      boardBg(g, w, h, '#0f172a', 'rgba(226,232,240,.85)');
      g.fillStyle = '#e2e8f0';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${Math.round(h * 0.4)}px ${FONT}`;
      g.fillText('TOILET', w / 2, h * 0.5);
    }, 1.0, 0.46, 8.825, 2.93, -4.31);

    // Penunjuk arah di mulut lorong, menghadap ruang duduk (sisi -x).
    const dirSign = makeSign((g, w, h) => {
      boardBg(g, w, h, '#111827', 'rgba(148,163,184,.5)');
      g.fillStyle = '#e2e8f0';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${Math.round(h * 0.27)}px ${FONT}`;
      g.fillText('TOILET', w * 0.5, h * 0.33);
      // Panah ke kiri pada kanvas = ke arah belakang ruangan (lorong WC).
      g.beginPath();
      g.moveTo(w * 0.24, h * 0.68);
      g.lineTo(w * 0.42, h * 0.55);
      g.lineTo(w * 0.42, h * 0.81);
      g.closePath();
      g.fill();
      g.fillRect(w * 0.4, h * 0.64, w * 0.34, h * 0.08);
    }, 0.66, 0.36, 7.47, 2.12, -1.95);
    dirSign.rotation.y = -Math.PI / 2;

    // Porcelain di dalam ruang WC: kloset, wastafel, cermin.
    const porcelain = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.22, metalness: 0.05 });
    box(0.52, 0.56, 0.2, porcelain, 8.05, 0.62, -6.55);
    cyl(0.21, 0.17, 0.44, porcelain, 8.05, 0.28, -6.16, 16);
    const wcSeat = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 20), porcelain);
    wcSeat.rotation.x = -Math.PI / 2;
    wcSeat.position.set(8.05, 0.51, -6.12);
    this.scene.add(wcSeat);

    box(0.66, 0.62, 0.44, M(0x334155, 0.7), 9.42, 0.36, -6.4);
    cyl(0.21, 0.17, 0.09, porcelain, 9.42, 0.7, -6.4, 18);
    box(0.05, 0.16, 0.05, M(0xc0c8d4, 0.25, 0.9), 9.42, 0.83, -6.56);
    const wcMirror = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.66),
      new THREE.MeshStandardMaterial({ color: 0xbfd7e8, roughness: 0.06, metalness: 0.95 })
    );
    wcMirror.position.set(9.42, 1.55, -6.66);
    this.scene.add(wcMirror);

    // Keset di depan pintu + lampu kecil di dalam ruang WC.
    const wcRug = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.55), M(0x1e3a5f, 0.95));
    wcRug.rotation.x = -Math.PI / 2;
    wcRug.position.set(8.82, 0.026, -4.02);
    this.scene.add(wcRug);

    cyl(0.16, 0.2, 0.09, new THREE.MeshStandardMaterial({ color: 0x1f2937, emissive: 0xdbeafe, emissiveIntensity: 1.1, roughness: 0.4 }), 8.75, 2.5, -5.55, 16);

    const wcLight = new THREE.PointLight(0xdceeff, 0.85, 4.5, 2);
    wcLight.position.set(8.75, 2.35, -5.5);
    this.scene.add(wcLight);

    // Door & exit
    box(0.3, 2.9, 0.3, M(0x1c130c, 0.6), 4.6, 1.45, 7.5);
    box(0.3, 2.9, 0.3, M(0x1c130c, 0.6), 7.4, 1.45, 7.5);
    box(3.1, 0.35, 0.32, M(0x1c130c, 0.6), 6, 3, 7.5);

    // Papan fascia "open 24 hours" di atas pintu masuk, menghadap kamera storefront.
    // Teksturnya dibuat seukuran rasio papan sendiri: kalau lewat makeSign, papan 5:1
    // dipaksa jadi canvas 3840px lebar cuma untuk menampung satu baris teks.
    const openSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.52),
      new THREE.MeshBasicMaterial({
        map: this.createSignTex(1024, 205, (g, w, h) => {
          g.fillStyle = '#0b1220';
          g.fillRect(0, 0, w, h);
          const lw = Math.max(2, Math.round(h * 0.06));
          g.strokeStyle = 'rgba(251,191,36,.85)';
          g.lineWidth = lw;
          g.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
          g.lineWidth = Math.max(1, Math.round(h * 0.02));
          g.strokeRect(w * 0.035, h * 0.16, w * 0.93, h * 0.68);
          g.fillStyle = '#fde68a';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `900 ${Math.round(h * 0.42)}px ${FONT}`;
          g.fillText('OPEN 24 HOURS', w / 2, h * 0.53);
        }),
        side: THREE.DoubleSide,
      })
    );
    openSign.position.set(6, 3.5, 7.7);
    this.scene.add(openSign);

    // Halo tipis di belakang papan supaya terbaca seperti lightbox yang nyala sendiri.
    const openSignGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 0.9),
      new THREE.MeshBasicMaterial({
        color: 0xffb45e,
        transparent: true,
        opacity: 0.13,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    openSignGlow.position.set(6, 3.5, 7.67);
    this.scene.add(openSignGlow);

    // Daun pintu ganda. Tiap daun digantung di grup kosong tepat di titik engselnya
    // lalu panelnya digeser sejauh DOOR_W ke arah dalam, jadi rotasi Y murni = ayunan.
    // 2 × 1,24m untuk bukaan 2,5m → sisa 2cm di tengah: daunnya bisa ketemu tanpa nagih.
    const DOOR_W = 1.24;
    const doorLeaf = (hingeX: number, dir: 1 | -1) => {
      const g = new THREE.Group();
      g.position.set(hingeX, 0, 7.5);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, 2.78, 0.06), M(0x4a2f1c, 0.62));
      panel.position.set(dir * (DOOR_W / 2), 1.39, 0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      g.add(panel);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(DOOR_W * 0.7, 1.5, 0.02),
        new THREE.MeshStandardMaterial({
          color: 0x9fd8ff,
          transparent: true,
          opacity: 0.22,
          roughness: 0.12,
          metalness: 0.1,
        })
      );
      glass.position.set(dir * (DOOR_W / 2), 1.86, 0.036);
      g.add(glass);
      // Handle di sisi pertemuan (tengah bukaan), bukan di dekat engsel.
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.34, 10),
        M(0xd09a58, 0.35, 0.7)
      );
      handle.position.set(dir * (DOOR_W - 0.08), 1.16, 0.09);
      g.add(handle);
      this.scene.add(g);
      return g;
    };
    this.frontDoorL = doorLeaf(4.75, 1);
    this.frontDoorR = doorLeaf(7.25, -1);

    // Initialize the 14 chairs and tables
    const chairM = M(0x4a2f1c, 0.7);
    const chairAt = (x: number, z: number, ry: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      const se = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.46), chairM);
      se.position.y = 0.46;
      se.castShadow = true;
      g.add(se);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.07), chairM);
      bk.position.set(0, 0.78, 0.22);
      bk.castShadow = true;
      g.add(bk);
      [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([dx, dz]) => {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 8), M(0x2b2118, 0.6));
        l.position.set(dx, 0.23, dz);
        g.add(l);
      });
      this.scene.add(g);
      return g;
    };

    const coffeeCup = (x: number, y: number, z: number) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.1, 12), M(0xf3e7d3, 0.5));
      c.position.set(x, y, z);
      c.castShadow = true;
      this.scene.add(c);
      const st = new THREE.Mesh(
        new THREE.PlaneGeometry(0.16, 0.22),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
      );
      st.position.set(x, y + 0.2, z);
      this.scene.add(st);
      this.steams.push({ m: st, t: Math.random() * 9, base: y + 0.2 });
    };

    const laptopAt = (x: number, y: number, z: number, ry: number, color: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = ry;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.34), M(0x14181f, 0.45));
      b.castShadow = true;
      g.add(b);
      const sm = new THREE.MeshBasicMaterial({ color });
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3), sm);
      s.position.set(0, 0.17, -0.14);
      s.rotation.x = -0.32;
      g.add(s);
      this.scene.add(g);
      this.screens.push({ m: sm, base: color, ph: Math.random() * 9 });
      return g;
    };

    OFFICE_SEATS.forEach((s) => {
      const seatPos = new THREE.Vector3(s.seat[0], 0, s.seat[1]);
      const dir = new THREE.Vector3(Math.sin(s.rot), 0, Math.cos(s.rot));
      const stand = seatPos.clone().add(dir.clone().multiplyScalar(1.05));
      stand.y = 0;
      this.seats[s.id] = { seat: seatPos, stand, rot: s.rot, y: 0, topY: s.topY ?? 0.76 };

      // Kursi kosong hanya kursi + meja. Laptop/kopi ditambahkan dinamis
      // ketika ada real agent yang menempati seat tersebut.
      // Seat bar pakai stool yang sudah dibangun buildWindowBar(), jadi jangan
      // tumpuk dengan kursi kantor biasa.
      if (!s.bar) chairAt(seatPos.x, seatPos.z, s.rot + Math.PI);
    });
  }

  // AC split di tembok belakang, di atas area duduk kanan. Sengaja di x=4.6:
  // papan menu sudah menempati x[-8,-2.4] di dinding yang sama, dan partisi
  // lorong WC mulai di x=7.6 — celah di antaranya kosong dan menghadap kamera default.
  initWallAc() {
    this.wallAc = createWallAcUnit({ x: 4.6, y: 4.15, z: -6.7 });
    this.scene.add(this.wallAc.group);
  }

  // Depan office: trotoar paving + kanstin + jalan raya aspal, membentang ke +z dari
  // lantai kayu. Dipisah dari initOfficeEnvironment() karena bidangnya datar dan
  // teksturnya kanvas sendiri — tidak ada satu pun yang bergantung pada isi ruangan.
  initStreetFront() {
    this.streetFront = createStreetFront();
    this.scene.add(this.streetFront.group);
    this.scene.add(createIndomaret().group);
  }

  setAcMode(mode: AcMode) {
    this.acMode = mode;
  }

  // Daya AC: auto = ruangan ramai bikin AC kerja lebih keras; manual on/off untuk demo.
  updateAc(dt: number) {
    let target: number;
    if (this.acMode === 'off') {
      target = 0;
    } else if (this.acMode === 'on') {
      target = 1;
    } else {
      const working = this.agents.reduce(
        (n, a) => n + (a.present && a.mode === 'work' ? 1 : 0),
        0
      );
      target = Math.min(1, 0.42 + working * 0.15);
    }
    this.acPower += (target - this.acPower) * Math.min(1, dt * 1.8);
    this.wallAc?.update(dt, this.acPower);
    this.mezzanine?.update(dt);
  }

  initWaypoints() {
    this.waypoints = {
      gC: new THREE.Vector3(0, 0, 3.2),
      gN: new THREE.Vector3(0, 0, -2.4),
      gW: new THREE.Vector3(-5.5, 0, 0.4),
      gE: new THREE.Vector3(5, 0, 0.4),
      queue: new THREE.Vector3(-5.2, 0, -1.6),
      order: new THREE.Vector3(-5.2, 0, -3.6),
      bar: new THREE.Vector3(-5.2, 0, -3.6),
      door: new THREE.Vector3(6, 0, 7.2),
      out: new THREE.Vector3(6, 0, 11),
      playA: new THREE.Vector3(6.6, 0, 4.2),
      playB: new THREE.Vector3(7.9, 0, 5.2),
      playC: new THREE.Vector3(5.6, 0, 5.6),
      // Lorong & ruang toilet di pojok belakang kanan (belum dipakai path agent).
      corridor: new THREE.Vector3(8.78, 0, -2.6),
      toilet: new THREE.Vector3(8.78, 0, -5.4),
    };
    this.playSpots = [this.waypoints.playA, this.waypoints.playB, this.waypoints.playC];

    this.mezzanine = createMusholaMezzanine();
    this.scene.add(this.mezzanine.group);
    // Anak tangga naik 0.215 — di bawah ambang 0.3 mesin pergerakan, jadi agent
    // bisa naik ke lantai dua tanpa perubahan pada stepPerson.
    const stair = this.mezzanine.stairWaypoints;
    this.waypoints.mezzFoot = this.mezzanine.stairMouth;
    this.waypoints.mezzTop = stair[stair.length - 1];
    this.waypoints.mezzLanding = this.mezzanine.landing;
    this.waypoints.mezzPrayer = this.mezzanine.prayerSpots[0];
  }

  hashText(text: string) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  inferAgentGender(name: string, avatar?: string): 'female' | 'male' | 'neutral' {
    const clean = name
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-zA-Z\s]/g, ' ');
    const tokens = clean.split(/\s+/).filter(Boolean);
    const femaleNames = new Set([
      // pool persona (80% cewek)
      'saarah', 'clara', 'camille', 'amara', 'nadia', 'kirana', 'alya', 'sinta', 'maya', 'dewi',
      'putri', 'intan', 'rani', 'sekar', 'melati', 'wulan', 'tari', 'dinda', 'nabila', 'farah',
      'salma', 'zahra', 'laila', 'mira', 'ayu', 'novi', 'salsabila', 'yuni', 'prita', 'melly',
      'cahya', 'arumi', 'mega', 'rossa', 'tiara', 'rika', 'mila', 'astri', 'cempaka', 'larasati',
      'anisa', 'citra', 'kenanga', 'tasya', 'niken', 'fitri', 'monica', 'lina', 'bella', 'reni',
      'amira', 'noor', 'elise', 'freya', 'chloe', 'maeve', 'lucia', 'iris', 'hana', 'nina',
      'zoe', 'kira', 'alina', 'sena', 'esme', 'aruna', 'kavya', 'selene', 'maira', 'anindya',
      'saras', 'indira', 'kamila', 'alea', 'rhea', 'callista', 'anwita', 'vania', 'nayla', 'aisyah',
      // sub-agent personas
      'dara', 'riri', 'nana', 'tita',
      // nama umum / fallback
      'sarah', 'saa', 'amelia', 'anita', 'bella', 'clara', 'dewi', 'dina', 'elsa', 'emma',
      'grace', 'hannah', 'indah', 'jane', 'jessica', 'kartika', 'kate', 'lila', 'lisa', 'luna',
      'maria', 'melati', 'mia', 'nabila', 'olivia', 'putri', 'ratna', 'reva', 'sari', 'siti',
      'sophia', 'tiara', 'wulan', 'yuni', 'zahra', 'female', 'woman', 'girl', 'lady'
    ]);
    const maleNames = new Set([
      // pool persona
      'budi', 'santoso', 'rizky', 'pratama', 'ahmad', 'fauzi', 'bayu', 'saputra', 'dimas',
      'wicaksono', 'andi', 'wijaya', 'hendra', 'gunawan', 'teguh', 'setiawan', 'yoga', 'mahendra',
      'arif', 'rahman', 'naufal', 'hakim', 'reza', 'maulana', 'doni', 'kurniawan', 'joko',
      'priyanto', 'rafi', 'hidayat', 'galih', 'prakoso', 'yusuf', 'ramadhan', 'rangga', 'aditya',
      'bima', 'ardiansyah', 'satria', 'wibowo', 'hadi',
      // nama umum / fallback
      'rizoa', 'agus', 'ari', 'arya', 'bagas', 'ary', 'daniel', 'david', 'eko', 'fahri', 'farhan',
      'ilham', 'iqbal', 'joko', 'michael', 'nathan', 'rama', 'rian', 'ryan', 'tono', 'william',
      'male', 'man', 'boy', 'gentleman'
    ]);

    if (avatar && /👩|👱‍♀️|🙋‍♀️|🧕|👸/.test(avatar)) return 'female';
    if (avatar && /👨|👱‍♂️|🙋‍♂️|🤴/.test(avatar)) return 'male';
    if (tokens.some((token) => femaleNames.has(token))) return 'female';
    if (tokens.some((token) => maleNames.has(token))) return 'male';
    return 'neutral';
  }

  createPersonMesh(colorHex: number, agentName = '', avatar?: string) {
    const M = (c: number, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const g = new THREE.Group();
    const skin = M(0xe8b88a, 0.75);
    const shirt = M(colorHex, 0.75);
    const pants = M(0x232a3a, 0.8);
    const hairM = M(0x241a12, 0.9);
    const hatM = M(colorHex, 0.58, 0.03);
    const accentM = M(0xf8fafc, 0.65);
    const gender = this.inferAgentGender(agentName, avatar);
    const variant = this.hashText(agentName || avatar || String(colorHex));

    const lL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.13), pants);
    lL.position.set(-0.1, 0.25, 0);
    const lR = lL.clone();
    lR.position.x = 0.1;
    g.add(lL, lR);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.55, 10), shirt);
    torso.position.y = 0.78;
    torso.castShadow = true;
    g.add(torso);

    const aL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.46, 0.09), shirt);
    aL.geometry.translate(0, -0.18, 0);
    aL.position.set(-0.27, 1, 0);
    const aR = aL.clone();
    aR.position.x = 0.27;
    g.add(aL, aR);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), skin);
    head.position.y = 1.22;
    head.castShadow = true;
    g.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.176, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairM
    );
    hair.position.set(0, 0.03, 0);
    head.add(hair);

    if (gender === 'female') {
      if (variant % 2 === 0) {
        const longHair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 14), hairM);
        longHair.scale.set(0.95, 1.65, 0.58);
        longHair.position.set(0, -0.1, -0.075);
        longHair.castShadow = true;
        head.add(longHair);

        const sideLock = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), hairM);
        sideLock.scale.set(0.7, 1.8, 0.5);
        sideLock.position.set(0.13, -0.06, 0.055);
        head.add(sideLock);
      } else {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), hairM);
        bun.position.set(0, -0.02, -0.19);
        bun.castShadow = true;
        head.add(bun);

        const ponytail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.28, 12), hairM);
        ponytail.position.set(0, -0.15, -0.2);
        ponytail.rotation.x = 0.2;
        ponytail.castShadow = true;
        head.add(ponytail);

        const hairTie = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 8, 18), accentM);
        hairTie.position.set(0, -0.04, -0.175);
        hairTie.rotation.x = Math.PI / 2;
        head.add(hairTie);
      }
    } else if (gender === 'male') {
      const hatVariant = variant % 3;
      if (hatVariant === 0) {
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 18), hatM);
        crown.position.set(0, 0.115, 0);
        crown.castShadow = true;
        head.add(crown);

        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.025, 0.13), hatM);
        brim.position.set(0, 0.08, 0.14);
        brim.castShadow = true;
        head.add(brim);
      } else if (hatVariant === 1) {
        const beanie = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
          hatM
        );
        beanie.position.set(0, 0.08, 0);
        beanie.scale.y = 0.8;
        beanie.castShadow = true;
        head.add(beanie);

        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.035, 18), accentM);
        rim.position.set(0, 0.03, 0);
        rim.castShadow = true;
        head.add(rim);
      } else {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.03, 24), hatM);
        brim.position.set(0, 0.075, 0);
        brim.castShadow = true;
        head.add(brim);

        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 18), hatM);
        crown.position.set(0, 0.16, 0);
        crown.castShadow = true;
        head.add(crown);
      }
    }

    this.scene.add(g);
    return { g, lL, lR, aL, aR, head, torso };
  }

  aisleFor(a: AgentData) {
    const x = a.seat[0];
    if (x < -4.5) return this.waypoints.gW;
    if (x > 4.5) return this.waypoints.gE;
    return a.seat[1] > 3 ? this.waypoints.gC : this.waypoints.gN;
  }

  randomRange(min: number, max: number) {
    return min + Math.random() * (max - min);
  }

  randomizeGroundPoint(point: THREE.Vector3, xRadius: number, zRadius: number) {
    return point.clone().add(new THREE.Vector3(
      this.randomRange(-xRadius, xRadius),
      0,
      this.randomRange(-zRadius, zRadius)
    ));
  }

  isCentral(a: AgentData) {
    return Math.abs(a.seat[0]) < 4.5;
  }

  buildEntrancePath(a: AgentData) {
    const seat = this.seats[a.id];
    const pts = [
      this.randomizeGroundPoint(this.waypoints.out, 1.25, 0.45),
      this.randomizeGroundPoint(this.waypoints.door, 0.95, 0.18),
      this.randomizeGroundPoint(this.waypoints.queue, 0.35, 0.2),
      this.randomizeGroundPoint(this.waypoints.order, 0.28, 0.12),
    ];
    a.orderStopIndex = pts.length - 1;
    a.orderUntil = null;
    a.hasOrderedCoffee = false;
    a.orderTaskBefore = null;

    const aisle = this.randomizeGroundPoint(this.aisleFor(a), 0.4, 0.35);

    if (aisle.distanceTo(this.waypoints.order) > 0.4) {
      pts.push(aisle);
    }
    if (seat) {
      pts.push(seat.stand.clone());
    }

    return pts;
  }

  buildExitPath(a: AgentData): THREE.Vector3[] {
    const current = a._p?.g.position.clone();
    // Sesi yang mati saat agent ada di lantai dua harus turun lewat lif, bukan
    // menembus pelantai. Titik awalnya tetap posisi dia sekarang.
    if (current && current.y > 0.5 && this.mezzanine) {
      if (a.musholaSpot != null) this.musholaSlots.delete(a.musholaSpot);
      a.musholaSpot = null;
      const atFoot = this.waypoints.mezzFoot.clone();
      return [current.clone(), ...this.stairDescentFrom(a), atFoot, ...this.groundExitPath(a, atFoot)];
    }
    if (current) current.y = 0;
    return this.groundExitPath(a, current);
  }

  private groundExitPath(a: AgentData, current: THREE.Vector3 | undefined): THREE.Vector3[] {
    // Kalau sesi berakhir saat agent masih di area luar/pintu, jangan paksa dia
    // masuk dulu; langsung balik ke luar supaya gerakannya tetap natural.
    if (current && current.z > this.waypoints.door.z - 0.2) {
      return [this.randomizeGroundPoint(this.waypoints.out, 1.25, 0.45)];
    }

    const pts: THREE.Vector3[] = [];
    const seat = this.seats[a.id];
    if (seat && (!current || current.distanceTo(seat.stand) > 0.35)) {
      pts.push(seat.stand.clone());
    }

    const aisle = this.randomizeGroundPoint(this.aisleFor(a), 0.4, 0.35);
    if (!current || current.distanceTo(aisle) > 0.35) {
      pts.push(aisle);
    }

    pts.push(
      this.randomizeGroundPoint(this.waypoints.door, 0.95, 0.18),
      this.randomizeGroundPoint(this.waypoints.out, 1.25, 0.45)
    );
    return pts;
  }

  startExit(a: AgentData) {
    if (a.mode === 'leaving' || a.after === 'break_out') return;

    this.removeSeatItems(a.id);
    a.status = 'offline';
    a.task = 'Sesi selesai — berjalan keluar pintu';
    a.prog = 100;
    this.setPath(a, this.buildExitPath(a), 'leaving', { after: 'break_out' });
    this.feed('move', 'ORCA24 Hub', `${a.name} selesai dan berjalan keluar pintu.`);
    if (this.onToast) this.onToast(`🚪 ${a.name} berjalan keluar pintu`);
  }

  addSeatItems(
    agentId: string,
    seatConfig: { seat: [number, number]; rot: number; topY?: number },
    color = 0x38bdf8
  ) {
    if (this.seatItems[agentId]) return;

    const mat = (c: number, r = 0.8, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const seatPos = new THREE.Vector3(seatConfig.seat[0], 0, seatConfig.seat[1]);
    const tx = seatPos.x - Math.sin(seatConfig.rot) * 0.55;
    const tz = seatConfig.seat[1] - Math.cos(seatConfig.rot) * 0.55;
    // Meja bar lebih tinggi dari meja kerja; laptop & cangkir harus nempel permukaannya.
    const topY = seatConfig.topY ?? 0.76;
    const objects: THREE.Object3D[] = [];

    const laptop = new THREE.Group();
    laptop.position.set(tx, topY, tz);
    laptop.rotation.y = seatConfig.rot + Math.PI;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.34), mat(0x14181f, 0.45));
    base.castShadow = true;
    laptop.add(base);
    const screenMat = new THREE.MeshBasicMaterial({ color });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3), screenMat);
    screen.position.set(0, 0.17, -0.14);
    screen.rotation.x = -0.32;
    laptop.add(screen);
    this.scene.add(laptop);
    objects.push(laptop);

    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.1, 12), mat(0xf3e7d3, 0.5));
    cup.position.set(tx + 0.35, topY + 0.02, tz + 0.15);
    cup.castShadow = true;
    this.scene.add(cup);
    objects.push(cup);

    const steamMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
    );
    steamMesh.position.set(cup.position.x, cup.position.y + 0.2, cup.position.z);
    this.scene.add(steamMesh);
    objects.push(steamMesh);

    const screenPulse = { m: screenMat, base: color, ph: Math.random() * 9 };
    const steam = { m: steamMesh, t: Math.random() * 9, base: cup.position.y + 0.2 };    this.screens.push(screenPulse);
    this.steams.push(steam);
    this.seatItems[agentId] = { objects, screen: screenPulse, steam };
  }

  removeSeatItems(agentId: string) {
    const items = this.seatItems[agentId];
    if (!items) return;

    items.objects.forEach((object) => this.scene.remove(object));
    if (items.screen) {
      this.screens = this.screens.filter((screen) => screen !== items.screen);
    }
    if (items.steam) {
      this.steams = this.steams.filter((steam) => steam !== items.steam);
    }
    delete this.seatItems[agentId];
  }

  removeAgent(a: AgentData) {
    if (a.musholaSpot != null) this.musholaSlots.delete(a.musholaSpot);
    this.removeSeatItems(a.id);
    if (a._p) {
      this.scene.remove(a._p.g);
    }
    delete this.seats[a.id];

    const idx = this.agents.indexOf(a);
    if (idx >= 0) {
      this.agents.splice(idx, 1);
    }

    if (this.onStateChange) this.onStateChange();
  }

  /** true kalau dia sedang dalam perjalanan ke lantai dua atau sudah duduk di saf. */
  isMusholaBound(a: AgentData): boolean {
    return a.mode === 'mushola' || a.after === 'mushola';
  }

  freeMusholaSpot(): number | null {
    const spots = this.mezzanine?.prayerSpots.length ?? 0;
    for (let i = 0; i < spots; i++) {
      if (!this.musholaSlots.has(i)) return i;
    }
    return null;
  }

  /** Titik turun, dimulai dari anak tangga terdekat dengan ketinggian agent sekarang. */
  stairDescentFrom(a: AgentData): THREE.Vector3[] {
    const stair = this.mezzanine?.stairWaypoints;
    if (!stair) return [];
    const y = a._y ?? a._p?.g.position.y ?? 0;
    let idx = 0;
    let best = Infinity;
    stair.forEach((w, i) => {
      const d = Math.abs(w.y - y);
      if (d < best) {
        best = d;
        idx = i;
      }
    });
    return stair.slice(0, idx + 1).reverse().map((w) => w.clone());
  }

  goToMushola(a: AgentData) {
    const mezz = this.mezzanine;
    if (!mezz || !this.seats[a.id]) return;
    const spot = this.freeMusholaSpot();
    if (spot === null) return;

    this.musholaSlots.set(spot, a.id);
    a.musholaSpot = spot;
    const cur = a._p?.g.position.clone() ?? this.seats[a.id].stand.clone();
    this.setPath(
      a,
      [
        cur,
        this.aisleFor(a).clone(),
        this.waypoints.mezzFoot.clone(),
        ...mezz.stairWaypoints.map((w) => w.clone()),
        mezz.landing.clone(),
        mezz.prayerSpots[spot].clone()
      ],
      'to',
      { after: 'mushola' }
    );
    a.task = 'Naik ke mushola';
    this.feed('move', 'ORCA24 Hub', `${a.name} naik ke lantai dua.`);
    if (this.onToast) this.onToast(`🕌 ${a.name} naik ke mushola`);
  }

  leaveMushola(a: AgentData) {
    if (a.musholaSpot != null) this.musholaSlots.delete(a.musholaSpot);
    a.musholaSpot = null;
    const seat = this.seats[a.id];
    const cur = a._p?.g.position.clone() ?? seat?.stand.clone() ?? new THREE.Vector3();
    this.setPath(
      a,
      [cur, ...this.stairDescentFrom(a), this.waypoints.mezzFoot.clone(), this.aisleFor(a).clone(), seat?.stand.clone() ?? cur],
      'back',
      { after: 'work' }
    );
    a.task = 'Ada task baru — turun ke meja';
    this.feed('move', 'ORCA24 Hub', `${a.name} turun dari mushola kembali ke meja.`);
    if (this.onToast) this.onToast(`💻 ${a.name} turun dari mushola`);
  }

  /** Hitung waktu menganggur di meja; cukup lama -> antar ke saf. */
  trackMusholaIdle(a: AgentData, dt: number) {
    if (!this.mezzanine) return;
    const waiting = a.present && !a.path.length && a.mode === 'idle' && !this.isMusholaBound(a);
    a.idle = waiting ? a.idle + dt : 0;
    // Ambang tiap agent digeser dari urutan kursi supaya tidak naik berombongan.
    const threshold = this.musholaIdleAfter + (a.order % 6) * 7;
    if (waiting && a.idle >= threshold && this.musholaSlots.size < this.mezzanine.prayerSpots.length) {
      this.goToMushola(a);
    }
  }

  buildPath(fromA: AgentData, toA?: AgentData, purpose?: string) {
    const F = this.seats[fromA.id];
    const pts = [F.stand.clone()];

    if (!toA) {
      if (purpose === 'out') {
        pts.push(this.aisleFor(fromA).clone(), this.waypoints.door.clone(), this.waypoints.out.clone());
      } else {
        const sp = this.playSpots[Math.floor(Math.random() * this.playSpots.length)].clone();
        pts.push(this.aisleFor(fromA).clone(), sp);
      }
      return pts;
    }

    const T = this.seats[toA.id];
    const af = this.aisleFor(fromA);
    const at = this.aisleFor(toA);

    if (af === at) {
      pts.push(af.clone());
    } else if (this.isCentral(fromA) && this.isCentral(toA)) {
      const mx = (fromA.seat[0] + toA.seat[0]) / 2;
      const mz = (fromA.seat[1] + toA.seat[1]) / 2 + 0.9;
      pts.push(new THREE.Vector3(mx, 0, mz));
    } else {
      pts.push(af.clone());
      if (Math.abs(fromA.seat[0] - toA.seat[0]) > 4) {
        pts.push(new THREE.Vector3((fromA.seat[0] + toA.seat[0]) / 2, 0, 1));
      }
      pts.push(at.clone());
    }
    pts.push(T.stand.clone());
    return pts;
  }

  setPath(a: AgentData, pts: THREE.Vector3[], mode: any, meta?: any) {
    a.path = pts;
    a.wi = 0;
    a.mode = mode;
    Object.assign(a, meta || {});
    a.phase = Math.random() * 9;
  }

  feed(kind: any, who: string, text: string, code?: string) {
    this.evN++;
    const now = new Date();
    const t = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    this.events.unshift({ n: this.evN, kind, who, text, code, t });
    if (this.events.length > 90) this.events.pop();

    if (this.onLiveMessage) this.onLiveMessage(`${who}: ${text}`);
    if (this.onStateChange) this.onStateChange();
  }

  say(a: AgentData, text: string) {
    a.talk = { text, until: this.simMs + 9000 };
    this.feed('chat', a.name, `“${text}”`);
    if (this.onStateChange) this.onStateChange();
  }

  beam(fromId: string, toId: string) {
    const fromA = this.agents.find((x) => x.id === fromId);
    const toA = this.agents.find((x) => x.id === toId);
    if (!fromA || !toA) return;

    const F = fromA._p.g;
    const T = toA._p.g;
    const p1 = F.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const p2 = T.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    const mid = p1.clone().lerp(p2, 0.5);
    mid.y += 1.3;

    const cur = new THREE.QuadraticBezierCurve3(p1, mid, p2);
    const li = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(cur.getPoints(20)),
      new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.5 })
    );
    this.scene.add(li);

    const pk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    this.scene.add(pk);
    this.beams.push({ pk, li, cur, pr: 0, sp: 0.02 });
  }

  // Hanya agen yang memang berniat melewati doorway yang boleh membuka pintu.
  // Goal pintu di-randomize ±0.95 x / ±0.18 z, jadi window pembanding dilebarkan.
  requestDoorIfPassing(goal: THREE.Vector3, pos: THREE.Vector3) {
    const door = this.waypoints.door;
    if (!door) return;
    if (Math.abs(goal.x - door.x) > 1.1 || Math.abs(goal.z - door.z) > 0.45) return;
    if (Math.hypot(pos.x - door.x, pos.z - door.z) > this.DOOR_LEAD) return;
    // Daun mana yang terbuka mengikuti sisi lintasan agen, bukan dipilih acak per event:
    // waypoint pintu sudah di-randomize ±0.95 pada sumbu X, jadi kanan/kirinya berubah
    // sendiri tiap ada yang lewat dan tetap konsisten selama satu lintasan.
    if (goal.x < door.x) this.doorHeldUntilL = this.simMs + this.DOOR_HOLD_OPEN_MS;
    else this.doorHeldUntilR = this.simMs + this.DOOR_HOLD_OPEN_MS;
  }

  stepDoor(dt: number) {
    if (!this.frontDoorL || !this.frontDoorR) return;
    const openL = this.simMs < this.doorHeldUntilL;
    const openR = this.simMs < this.doorHeldUntilR;
    // Easing eksponensial cukup untuk buka+tutup yang terasa halus tanpa tween system.
    const ease = Math.min(1, dt * 7);
    const tL = openL ? this.DOOR_OPEN_ANGLE : 0;
    const tR = openR ? -this.DOOR_OPEN_ANGLE : 0;
    this.doorAngleL += (tL - this.doorAngleL) * ease;
    this.doorAngleR += (tR - this.doorAngleR) * ease;
    if (!openL && Math.abs(this.doorAngleL) < 0.002) this.doorAngleL = 0;
    if (!openR && Math.abs(this.doorAngleR) < 0.002) this.doorAngleR = 0;
    this.frontDoorL.rotation.y = this.doorAngleL;
    this.frontDoorR.rotation.y = this.doorAngleR;
  }

  stepPerson(a: AgentData, dt: number) {
    const P = a._p;
    if (!P) return;
    const now = performance.now();

    if (!a.path.length) {
      // Jangan tarik agent di lantai dua kembali ke kursi lantai satu.
      if (a.mode !== 'mushola') {
        a._y = this.seats[a.id]?.y || 0;
      }
      P.g.position.y = a._y;

      if (a.mode === 'talk') {
        P.head.rotation.y = Math.sin(now * 0.002 + a.order) * 0.25;
        const s = Math.sin(now * 0.004);
        P.aL.rotation.x = -0.5 + s * 0.12;
        P.aR.rotation.x = -0.5 - s * 0.12;
      } else if (a.mode === 'work') {
        P.aL.rotation.x = -0.85;
        P.aR.rotation.x = -0.85 + Math.sin(now * 0.02 + a.order) * 0.12;
        P.head.rotation.x = 0.18 + Math.sin(now * 0.0015) * 0.04;
        P.head.rotation.y = 0;
      } else if (a.mode === 'mushola') {
        // Duduk bersila di sajadah, statis tanpa siklus.
        const ease = Math.min(1, dt * 3);
        P.g.rotation.x += (0.18 - P.g.rotation.x) * ease;
        P.lL.rotation.x += (-1.55 - P.lL.rotation.x) * ease;
        P.lR.rotation.x = P.lL.rotation.x;
        P.aL.rotation.x += (-0.9 - P.aL.rotation.x) * ease;
        P.aR.rotation.x += (-0.9 - P.aR.rotation.x) * ease;
        P.head.position.y += (1.22 - 0.12 - P.head.position.y) * ease;
        P.head.rotation.y = 0;
      } else {
        P.aL.rotation.x *= 0.9;
        P.aR.rotation.x *= 0.9;
        P.head.rotation.y = 0;
        P.g.rotation.x *= 0.85;
      }
      return;
    }

    if (a._y === undefined) a._y = P.g.position.y;
    const goal = a.path[a.wi];
    if (!goal) return;

    this.requestDoorIfPassing(goal, P.g.position);

    const dx = goal.x - P.g.position.x;
    const dz = goal.z - P.g.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.15 && Math.abs(goal.y - a._y) < 0.3) {
      a._y = goal.y;
      P.g.position.y = goal.y;

      if (a.orderStopIndex === a.wi && !a.hasOrderedCoffee) {
        P.g.rotation.y = Math.PI;
        P.head.rotation.y = Math.sin(now * 0.004 + a.order) * 0.12;
        P.aL.rotation.x = -0.72 + Math.sin(now * 0.006) * 0.1;
        P.aR.rotation.x = -1.05 + Math.sin(now * 0.007) * 0.12;
        P.lL.rotation.x = P.lR.rotation.x = 0;

        if (!a.orderUntil) {
          a.orderUntil = this.simMs + this.randomRange(1800, 3200);
          a.orderTaskBefore = a.task;
          const modelLabel = a.model ? `${a.model}` : 'Pi CLI';
          a.task = `Loading ${modelLabel}…`;
          this.feed('move', 'Barista Counter', `${a.name} berhenti sebentar.`);
          this.say(a, modelLabel);
          if (this.onToast) this.onToast(`☕ ${a.name} — ${modelLabel}`);
        }

        if (this.simMs < a.orderUntil) {
          return;
        }

        a.hasOrderedCoffee = true;
        a.orderUntil = null;
        if (a.task.startsWith('Loading ')) {
          a.task = a.orderTaskBefore || 'Menuju seat';
        }
        a.orderTaskBefore = null;
        this.feed('move', 'Barista Counter', `${a.name} siap lanjut ke seat.`);
        if (this.onToast) this.onToast(`🥤 ${a.name} lanjut ke seat`);
      }

      a.wi++;
      if (a.wi >= a.path.length) {
        a.path = [];
        const nextMode = a.after || (a.status === 'working' ? 'work' : 'idle');
        a.after = null;

        if (nextMode === 'break_out') {
          this.feed('move', 'ORCA24 Hub', `${a.name} sudah keluar pintu.`);
          this.removeAgent(a);
          return;
        }

        a.mode = nextMode;
        a.prog = nextMode === 'work' ? Math.max(a.prog || 0, 65) : 0;

        if (nextMode === 'mushola') {
          // Sampai di saf: menghadap dinding belakang (kiblat) dan jangan ditarik
          // kembali ke kursi — dia memang sedang tidak di kursinya.
          P.g.rotation.y = Math.PI;
          a.task = 'Duduk di mushola';
        } else {
          const S = this.seats[a.id];
          if (S) {
            P.g.position.copy(S.seat);
            a._y = S.y;
            P.g.rotation.y = S.rot + Math.PI;
          }
        }
        P.lL.rotation.x = P.lR.rotation.x = 0;
      }
      return;
    }

    const sp = a.speed * (this.speed > 1 ? 1.35 : 1);
    const st = Math.min(dist, sp * dt);
    if (dist > 1e-4) {
      P.g.position.x += (dx / dist) * st;
      P.g.position.z += (dz / dist) * st;
      P.g.rotation.y = Math.atan2(dx, dz);
    }
    a._y += Math.sign(goal.y - a._y) * Math.min(Math.abs(goal.y - a._y), sp * dt * 1.1);

    // Turun dari pose shalat begitu dia berjalan lagi.
    P.g.rotation.x *= 0.86;
    // Kepala kembali ke posisi normal (1.22) setelah sujud.
    P.head.position.y += (1.22 - P.head.position.y) * Math.min(1, dt * 2.4);
    a.phase = (a.phase || 0) + dt * 11;
    const sw = Math.sin(a.phase);
    P.lL.rotation.x = sw * 0.65;
    P.lR.rotation.x = -sw * 0.65;
    P.aL.rotation.x = -sw * 0.5;
    P.aR.rotation.x = sw * 0.5;
    P.head.rotation.x = 0;
    P.g.position.y = a._y + Math.abs(Math.cos(a.phase)) * 0.05;
  }

  updateFloatingPills() {
    const w = this.canvas.parentElement?.clientWidth || this.canvas.clientWidth;
    const h = this.canvas.parentElement?.clientHeight || this.canvas.clientHeight;

    this.agents.forEach((a) => {
      const el = document.getElementById(`pill-${a.id}`);
      if (!el) return;

      if (!this.labelsOn || !a.present || !a._p) {
        el.style.display = 'none';
        return;
      }

      this.tv.set(a._p.g.position.x, a._p.g.position.y + 1.75, a._p.g.position.z).project(this.camera);
      if (this.tv.z > 1) {
        el.style.display = 'none';
        return;
      }

      const x = (this.tv.x * w) / 2 + w / 2;
      const y = (-this.tv.y * h) / 2 + h / 2;

      if (x < -80 || x > w + 80 || y < -40 || y > h + 60) {
        el.style.display = 'none';
        return;
      }

      el.style.display = 'block';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    });
  }

  animate = () => {
    this.animId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.tw) {
      this.tw.t += dt / 0.8;
      const k = this.tw.t >= 1 ? 1 : 1 - Math.pow(1 - this.tw.t, 3);
      this.camera.position.lerpVectors(this.tw.fp, this.tw.tp, k);
      this.controls.target.lerpVectors(this.tw.ft, this.tw.tt, k);
      if (this.tw.t >= 1) this.tw = null;
    }

    this.controls.update();

    if (!this.paused) {
      this.simMs += dt * 1000 * this.speed;

      this.agents.forEach((a) => {
        if (a.talk && this.simMs > a.talk.until) {
          a.talk = null;
        }
        if (a.present) this.stepPerson(a, dt);
        this.trackMusholaIdle(a, dt);
      });

      this.stepDoor(dt);

      // Beams
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i];
        b.pr += b.sp * (this.speed > 1 ? 2 : 1);
        if (b.pr >= 1) {
          this.scene.remove(b.pk, b.li);
          this.beams.splice(i, 1);
        } else {
          b.pk.position.copy(b.cur.getPoint(b.pr));
        }
      }

      // Screens & steams
      this.screens.forEach((s) => {
        s.ph += dt;
        s.m.color.setHex(s.base).multiplyScalar(0.9 + 0.1 * Math.sin(s.ph * 7));
      });
      this.steams.forEach((s) => {
        s.t += dt;
        s.m.position.y += dt * 0.22;
        if (s.m.position.y > s.base + 0.5) s.m.position.y = s.base;
        (s.m.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.sin(s.t * 3)) * 0.14;
      });

      this.steams.forEach((s) => {
        s.t += dt;
        s.m.position.y += dt * 0.22;
        if (s.m.position.y > s.base + 0.5) s.m.position.y = s.base;
        (s.m.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.sin(s.t * 3)) * 0.14;
      });

      // Berkas matahari: napas pelan (debu & intensitas awan), bukan kedip.
      this.sunShafts.forEach((s) => {
        s.ph += dt;
        s.m.opacity = s.base * (0.82 + 0.18 * Math.sin(s.ph * 0.55));
      });
      this.sunPools.forEach((s) => {
        s.ph += dt;
        s.m.opacity = s.base * (0.86 + 0.14 * Math.sin(s.ph * 0.55 + 0.6));
      });
      this.stepDust(dt);

      this.updateAc(dt);
    }

    this.updateFloatingPills();
    this.renderer.render(this.scene, this.camera);
  };

  start() {
    this.animate();
  }

  stop() {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.handleResize);
  }

  camPreset(preset: 'over' | 'ground' | 'play' | 'street') {
    const P = {
      over: { p: [0, 13, 17], t: [0, 1, 0.5] },
      ground: { p: [-1, 6.5, 11], t: [-1, 0, 1.5] },
      play: { p: [2.5, 5, 11], t: [6.6, 0, 4] },
      // Satu-satunya preset yang membingkai depan bangunan. Kamera 'over' memotong
      // tanah di z=8,6, jadi trotoar/aspal (z > 9) tidak pernah masuk frame-nya.
      street: { p: [0, 9, 26], t: [0, 1.5, 6] },
    }[preset] || { p: [0, 13, 17], t: [0, 1, 0.5] };

    this.tw = {
      fp: this.camera.position.clone(),
      tp: new THREE.Vector3(...P.p as [number, number, number]),
      ft: this.controls.target.clone(),
      tt: new THREE.Vector3(...P.t as [number, number, number]),
      t: 0,
    };
  }

  selectAgent(id: string, fly = true) {
    const a = this.agents.find((x) => x.id === id);
    if (!a || !a.present || !a._p) return;

    if (fly) {
      const p = a._p.g.position;
      this.tw = {
        fp: this.camera.position.clone(),
        tp: new THREE.Vector3(p.x + 4.5, p.y + 5, p.z + 6.5),
        ft: this.controls.target.clone(),
        tt: new THREE.Vector3(p.x, p.y + 1, p.z),
        t: 0,
      };
    }
  }

  burst() {
    confetti({ particleCount: 70, spread: 70, origin: { y: 0.7 } });
  }

  // =========================================================================
  // 100% REAL PI SESSIONS & TELEMETRY SYNC
  // =========================================================================
  syncRealSessions(realSessions: Session[]) {
    // Hanya tampilkan sesi yang statusnya bukan offline
    const activeReal = realSessions.filter((s) => s.status !== 'offline');

    // Buat pemetaan kursi untuk setiap sesi aktif. Agent ID memakai session ID asli
    // supaya bubble tetap unik walau kursi/persona berulang.
    activeReal.forEach((s, idx) => {
      let existing = this.agents.find((a) => a.realSessionId === s.id);
      const targetMode = s.status === 'working' ? 'work' : 'idle';

      if (!existing) {
        const occupiedSeats = new Set(this.agents.map((a) => `${a.seat[0]},${a.seat[1]}`));
        const seatConfig = OFFICE_SEATS.find((seat) => !occupiedSeats.has(`${seat.seat[0]},${seat.seat[1]}`)) || OFFICE_SEATS[idx % OFFICE_SEATS.length];
        const seatPos = new THREE.Vector3(seatConfig.seat[0], 0, seatConfig.seat[1]);
        const standDir = new THREE.Vector3(Math.sin(seatConfig.rot), 0, Math.cos(seatConfig.rot));
        const stand = seatPos.clone().add(standDir.multiplyScalar(1.05));
        const colorHex = parseInt((s.color || '#38bdf8').replace('#', '0x'), 16) || 0x38bdf8;
        const agentId = `real_${String(s.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

        this.seats[agentId] = { seat: seatPos, stand, rot: seatConfig.rot, y: 0 };
        this.addSeatItems(agentId, seatConfig, colorHex);

        const personMesh = this.createPersonMesh(colorHex, s.name, s.avatar);
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

        const entrancePath = this.buildEntrancePath(newAgent);
        personMesh.g.position.copy(entrancePath[0]);
        this.setPath(newAgent, entrancePath, 'to', { after: targetMode });
        this.agents.push(newAgent);
        this.feed('move', 'ORCA24 Hub', `${s.name} masuk dari pintu menuju meja.`);
        if (this.onToast) this.onToast(`🚪 ${s.name} masuk dari pintu → meja`);
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
        const existingSeatConfig = OFFICE_SEATS.find((seat) => seat.seat[0] === existing.seat[0] && seat.seat[1] === existing.seat[1]);
        if (existingSeatConfig) this.addSeatItems(existing.id, existingSeatConfig, existing.c);
        existing.llmStream = s.liveStream || existing.llmStream;
        existing.status = s.status;
        existing.prog = targetMode === 'work' ? 80 : 0;

        if (targetMode === 'work' && this.isMusholaBound(existing)) {
          // Ada task baru: potong saf-nya sekarang juga, bukan setelah selesai jalan.
          this.leaveMushola(existing);
        } else if (this.isMusholaBound(existing)) {
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
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const a = this.agents[i];
      if (a.realSessionId && !activeIds.has(a.realSessionId)) {
        this.startExit(a);
      }
    }

    if (this.onStateChange) this.onStateChange();
  }

  handleRealToolCall(tc: ToolCall) {
    const agent = this.agents.find((a) => a.realSessionId === tc.session_id) || this.agents[0];
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
    this.feed('tool', agent.name, tc.tool_name, tc.input_json || '');
  }

  handleSubagentSpawn(subagent: Session) {
    this.feed('sys', 'Sub-Agent Coordinator', `🤖 Subagent di-spawn: ${subagent.name}`);
    if (this.onToast) this.onToast(`🤖 Subagent di-spawn: ${subagent.name}`);
  }
}
