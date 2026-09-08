import * as THREE from 'three';

// AC split di tembok + pita penanda aliran udara.
// Kenapa pita dan bukan partikel salju: strip kertas yang berkibar adalah cara paling
// murah membaca "AC-nya nyala" dari kejauhan — gerakan hidup vs menjuntai mati langsung
// kebaca tanpa perlu teks, dan amplitude-nya bisa dipakai sebagai meteran beban ruangan.

export type AcMode = 'auto' | 'on' | 'off';

export type WallAcUnit = {
  group: THREE.Group;
  update: (dt: number, power: number) => void;
};

const RIBBON_TINTS = [0x22d3ee, 0xf472b6, 0xfbbf24, 0xa7f3d0];
// Panjang dipangkas 60% dari 0.9; lebar ikut dikecilkan supaya proporsinya masih
// kertas, bukan spanduk. Konstanta goyahan di bawah diturunkan dari RIBBON_LEN, jadi
// mengubah dua angka ini saja sudah mengubah ukuran pita secara utuh.
const RIBBON_LEN = 0.36;
const RIBBON_W = 0.05;
const RIBBON_SEGS = 14;
const RIBBON_X = [-0.62, -0.21, 0.21, 0.62];

type Ribbon = {
  mesh: THREE.Mesh;
  base: Float32Array;
  phase: number;
  swing: number;
};

// Plat muka digambar ke kanvas: tekstur murah, dan "PI-AIR 22°C" tetap kebaca
// sebagai produk, bukan balok putih polos.
function facePlateTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#eef2f7';
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = 'rgba(15,23,42,.16)';
    g.lineWidth = 5;
    g.strokeRect(3, 3, 506, 122);
    g.fillStyle = '#0f172a';
    g.font = "800 44px 'Plus Jakarta Sans', system-ui, sans-serif";
    g.textBaseline = 'middle';
    g.fillText('PI-AIR', 30, 66);
    g.fillStyle = '#0e7490';
    g.font = "700 32px 'JetBrains Mono', monospace";
    g.fillText('22°C', 300, 66);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWallAcUnit(mount: { x: number; y: number; z: number }): WallAcUnit {
  const group = new THREE.Group();
  group.position.set(mount.x, mount.y, mount.z);

  const shell = new THREE.MeshStandardMaterial({ color: 0xf2f5f9, roughness: 0.42, metalness: 0.06 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xcfd8e3, roughness: 0.55, metalness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5, metalness: 0.18 });

  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Badan unit: kotak atas + bibir bawah bulat (silinder melintang) supaya tidak
  // kelihatan seperti router wifi.
  add(new THREE.BoxGeometry(1.9, 0.34, 0.34), shell, 0, 0.07, 0.17);
  const lip = add(new THREE.CylinderGeometry(0.17, 0.17, 1.9, 22), shell, 0, -0.1, 0.28, 0);
  lip.rotation.z = Math.PI / 2;
  add(new THREE.BoxGeometry(1.94, 0.05, 0.36), trim, 0, 0.26, 0.17);
  add(new THREE.BoxGeometry(0.05, 0.3, 0.32), trim, -0.96, 0.06, 0.17);
  add(new THREE.BoxGeometry(0.05, 0.3, 0.32), trim, 0.96, 0.06, 0.17);

  // Celah hisap di permukaan atas (kamera default melihat dari atas, jadi slot di
  // punggung unit tidak akan pernah kelihatan) + slot keluaran udara di bibir bawah.
  [0.1, 0.17, 0.24].forEach((z) => add(new THREE.BoxGeometry(1.6, 0.014, 0.022), dark, 0, 0.29, z));
  add(new THREE.BoxGeometry(1.72, 0.06, 0.03), dark, 0, -0.2, 0.4);

  // Kisi pengarah (swing vane) — satu-satunya bagian yang bergerak di bodinya.
  const flap = add(new THREE.BoxGeometry(1.74, 0.026, 0.19), trim, 0, -0.225, 0.47, -0.35);

  // Plat merek di muka.
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.21),
    new THREE.MeshStandardMaterial({ map: facePlateTex(), roughness: 0.5, metalness: 0.04 })
  );
  plate.position.set(-0.42, 0.09, 0.352);
  group.add(plate);

  // LED status: menyala cyan mengikuti daya, mati saat AC off.
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x0b2b33,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.2,
    roughness: 0.3,
    metalness: 0.1,
  });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 12), ledMat);
  led.position.set(0.74, 0.09, 0.35);
  group.add(led);

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.position.set(0.74, 0.09, 0.36);
  group.add(halo);

  // Pita: diikat di bibir keluaran, menggantung ke bawah, lalu ditiup ke depan.
  const ribbonMats: THREE.MeshStandardMaterial[] = [];
  const ribbons: Ribbon[] = RIBBON_X.map((x, i) => {
    const geo = new THREE.PlaneGeometry(RIBBON_W, RIBBON_LEN, 1, RIBBON_SEGS);
    geo.translate(0, -RIBBON_LEN / 2, 0);
    const tint = RIBBON_TINTS[i % RIBBON_TINTS.length];
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: tint,
        roughness: 0.78,
        metalness: 0.02,
        side: THREE.DoubleSide,
        // Emissive sendiri: di ketinggian 4 m tembok belakang cuma kena ambient hangat,
        // jadi kertas tanpa cahaya sendiri terbaca sebagai abu-abu, bukan pita warna.
        emissive: tint,
        emissiveIntensity: 0.3,
      })
    );
    ribbonMats.push(mesh.material as THREE.MeshStandardMaterial);
    mesh.position.set(x, -0.24, 0.44);
    mesh.castShadow = false;
    group.add(mesh);

    // Sehelai tape kecil supaya titik ikatnya terbaca, bukan pita melayang.
    // Titik ikat ikut dikecilkan: tape 0.1 lebih lebar dari pita baru dan terbaca
    // sebagai lakban, bukan simpul.
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.02), trim);
    tape.position.set(x, -0.225, 0.45);
    group.add(tape);

    return {
      mesh,
      base: Float32Array.from(geo.attributes.position.array as Float32Array),
      phase: i * 1.7,
      swing: i * 0.9,
    };
  });

  // Wisp udara dingin: quad tipis additive yang meluncur turun-maju lalu pudar.
  const wisps: { m: THREE.Mesh; t: number; sp: number; x0: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.13),
      new THREE.MeshBasicMaterial({
        color: 0xa8e6ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    const x0 = (i - 2) * 0.24;
    m.position.set(x0, -0.3, 0.5);
    group.add(m);
    wisps.push({ m, t: i / 5, sp: 0.5 + (i % 3) * 0.12, x0 });
  }

  // Lampu dingin di mulut keluaran: bikin bodi, pita, dan sepotong tembok di
  // sekitarnya ikut kebaca, dan padam total saat AC off.
  const coldLight = new THREE.PointLight(0x9fd8ff, 0, 7, 2);
  coldLight.position.set(0, -0.22, 0.8);
  group.add(coldLight);

  let clock = 0;

  const update: WallAcUnit['update'] = (dt, power) => {
    clock += dt;
    const p = Math.max(0, Math.min(1, power));

    ledMat.emissiveIntensity = 0.12 + 3.4 * p;
    (halo.material as THREE.MeshBasicMaterial).opacity = 0.05 + 0.4 * p;
    coldLight.intensity = 2.1 * p;
    ribbonMats.forEach((m) => {
      m.emissiveIntensity = 0.14 + 0.52 * p;
    });

    // Kisi bergoyang pelan saat nyala; menutup rapi saat mati.
    flap.rotation.x = -0.34 - 0.3 * p * (0.55 + 0.45 * Math.sin(clock * 0.9));

    // Ampplitudo relatif panjang: 0.15 di pita 0.36 = 42% panjangnya, pita bakal
    // terlihat mencambuk sendiri. Rasio aslinya (0.012/0.15 pada 0.9) dipertahankan.
    // Kontras ON/OFF sengaja lebar: mati = menjuntai nyaris diam, nyala = berkibar.
    const amp = RIBBON_LEN * (0.004 + 0.24 * p);
    const speed = 1.2 + 8.6 * p;
    ribbons.forEach((r) => {
      r.swing += dt * (0.1 + 2.5 * p);
      // Angin nyembur ke depan (+z) dan sedikit ke samping; makin kencang, makin miring.
      r.mesh.rotation.x = -(0.03 + 1.15 * p) * (0.85 + 0.15 * Math.sin(r.swing + r.phase));
      r.mesh.rotation.z = Math.sin(r.swing * 0.8 + r.phase) * 0.1 * (0.35 + p);

      const pos = r.mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const bx = r.base[i * 3];
        const by = r.base[i * 3 + 1];
        // k = 0 di titik ikat, 1 di ujung bebas — simpangan kuadratik bikin pita
        // "lembut" alih-alih bergetar kaku seperti batang.
        const k = Math.max(0, Math.min(1, -by / RIBBON_LEN));
        const w = Math.pow(k, 1.35);
        const wave = Math.sin(clock * speed + k * 7.2 + r.phase);
        pos.setXYZ(
          i,
          bx + wave * amp * w,
          by + Math.cos(clock * speed * 0.7 + k * 5.1 + r.phase) * amp * 0.2 * w,
          wave * amp * 0.5 * w + k * RIBBON_LEN * 0.155 * p
        );
      }
      pos.needsUpdate = true;
      r.mesh.geometry.computeVertexNormals();
    });

    wisps.forEach((w) => {
      w.t += dt * w.sp * (0.25 + 1.5 * p);
      if (w.t > 1) w.t -= 1;
      const k = w.t;
      // x0 disimpan: menghitung ulang dari posisi sebelumnya bikin wisp merayap
      // masuk ke tengah tiap frame alih-alih menyebar.
      w.m.position.set(w.x0 + (k - 0.5) * 0.16, -0.3 - k * 1.15, 0.5 + k * 0.75);
      w.m.rotation.x = -0.6;
      w.m.scale.setScalar(0.7 + k * 1.1);
      (w.m.material as THREE.MeshBasicMaterial).opacity = p * 0.16 * Math.sin(Math.PI * k);
    });
  };

  return { group, update };
}
