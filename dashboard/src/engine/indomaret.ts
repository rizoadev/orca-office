import * as THREE from 'three';

export type IndomaretStore = {
  group: THREE.Group;
};

const STORE_LEFT = 10.48;
const STORE_WIDTH = 3.08;
const STORE_RIGHT = STORE_LEFT + STORE_WIDTH;
const FRONT_Z = 8.28;
const BACK_Z = 5.18;
const FACADE_Y = 3.58;
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

function meshBox(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function meshPlane(
  group: THREE.Group,
  w: number,
  h: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function indomaretSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 220;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#f4f1e8';
    g.fillRect(0, 0, canvas.width, canvas.height);

    g.fillStyle = '#d9252a';
    g.fillRect(0, 0, canvas.width, 28);
    g.fillStyle = '#f5c242';
    g.fillRect(0, 28, canvas.width, 16);
    g.fillStyle = '#08783f';
    g.fillRect(0, 44, canvas.width, 176);

    g.strokeStyle = 'rgba(255,255,255,.72)';
    g.lineWidth = 5;
    g.strokeRect(11, 53, canvas.width - 22, 155);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = `900 92px ${FONT}`;
    g.fillText('INDOMARET', canvas.width / 2, 135);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function productTexture(color: string, label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,.88)';
    g.fillRect(10, 44, 108, 34);
    g.fillStyle = '#17324a';
    g.font = `800 15px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 64, 61);
    g.fillStyle = 'rgba(255,255,255,.4)';
    g.fillRect(18, 17, 92, 7);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createIndomaret(): IndomaretStore {
  const group = new THREE.Group();
  group.name = 'indomaret-partial-store';

  const white = new THREE.MeshStandardMaterial({ color: 0xf1eee5, roughness: 0.72 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0b7040, roughness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd6252a, roughness: 0.58 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf2bf3c, roughness: 0.58 });
  const aluminium = new THREE.MeshStandardMaterial({ color: 0x8d9aa1, roughness: 0.34, metalness: 0.55 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x6e6d65, roughness: 0.88 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x83bdc2,
    roughness: 0.18,
    metalness: 0.05,
    transmission: 0.08,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  });
  const inside = new THREE.MeshStandardMaterial({ color: 0x203f35, roughness: 0.92 });
  const signMaterial = new THREE.MeshBasicMaterial({ map: indomaretSignTexture(), side: THREE.DoubleSide });

  // Hanya irisan depan ruko: sisi kanannya sengaja berhenti seperti potongan frame.
  meshBox(group, STORE_WIDTH + 0.12, 0.18, 3.18, floor, (STORE_LEFT + STORE_RIGHT) / 2, 0.03, 6.72);
  meshBox(group, STORE_WIDTH, 3.55, 0.16, white, (STORE_LEFT + STORE_RIGHT) / 2, 2.05, BACK_Z);
  meshBox(group, 0.16, 3.55, 3.1, white, STORE_LEFT + 0.08, 2.05, 6.73);
  meshBox(group, 0.16, 3.55, 3.1, white, STORE_RIGHT - 0.08, 2.05, 6.73);
  meshBox(group, STORE_WIDTH + 0.18, 0.34, 3.25, white, (STORE_LEFT + STORE_RIGHT) / 2, 4.08, 6.7);

  // Papan hijau, garis warna, dan logo adalah penanda visual utama toko tetangga.
  meshBox(group, STORE_WIDTH + 0.06, 0.78, 0.18, trim, (STORE_LEFT + STORE_RIGHT) / 2, FACADE_Y, FRONT_Z + 0.01);
  meshPlane(group, STORE_WIDTH - 0.08, 0.68, signMaterial, (STORE_LEFT + STORE_RIGHT) / 2, FACADE_Y, FRONT_Z + 0.115);
  meshBox(group, STORE_WIDTH + 0.1, 0.08, 0.2, red, (STORE_LEFT + STORE_RIGHT) / 2, 4.0, FRONT_Z + 0.02);
  meshBox(group, STORE_WIDTH + 0.1, 0.06, 0.2, yellow, (STORE_LEFT + STORE_RIGHT) / 2, 3.91, FRONT_Z + 0.02);

  // Kaca depan dan kusen tipis memberi cukup interior tanpa membuat toko penuh.
  meshPlane(group, STORE_WIDTH - 0.32, 2.42, glass, (STORE_LEFT + STORE_RIGHT) / 2, 1.83, FRONT_Z + 0.03);
  for (const x of [STORE_LEFT + 0.2, STORE_LEFT + 1.05, STORE_LEFT + 1.88, STORE_RIGHT - 0.2]) {
    meshBox(group, 0.045, 2.52, 0.08, aluminium, x, 1.83, FRONT_Z + 0.09);
  }
  meshBox(group, STORE_WIDTH - 0.25, 0.045, 0.08, aluminium, (STORE_LEFT + STORE_RIGHT) / 2, 3.03, FRONT_Z + 0.09);
  meshBox(group, STORE_WIDTH - 0.25, 0.045, 0.08, aluminium, (STORE_LEFT + STORE_RIGHT) / 2, 0.62, FRONT_Z + 0.09);

  // Rak dan produk cukup samar: toko terbaca sebagai retail, tetapi tidak mengambil alih office.
  meshBox(group, 1.9, 2.0, 0.25, inside, 11.35, 1.45, 6.0);
  meshBox(group, 1.9, 0.06, 0.38, aluminium, 11.35, 0.74, 5.83);
  meshBox(group, 1.9, 0.06, 0.38, aluminium, 11.35, 1.4, 5.83);
  meshBox(group, 1.9, 0.06, 0.38, aluminium, 11.35, 2.06, 5.83);

  const products = [
    ['#d83b32', 'SNACK'],
    ['#f0b72f', 'DRINK'],
    ['#2f83c5', 'MILK'],
    ['#ef7a25', 'COFFEE'],
    ['#c74688', 'SOAP'],
    ['#54a957', 'TEA'],
  ];
  products.forEach(([color, label], i) => {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const product = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.34, 0.08),
      new THREE.MeshStandardMaterial({ map: productTexture(color, label), roughness: 0.72 })
    );
    product.position.set(10.75 + col * 0.56, 0.91 + row * 0.66, 5.78);
    product.castShadow = true;
    group.add(product);
  });

  // Kulkas minuman kecil di ujung irisan toko, ikon retail yang masih tampak dari jauh.
  meshBox(group, 0.58, 1.42, 0.42, new THREE.MeshStandardMaterial({ color: 0xdde8e4, roughness: 0.32, metalness: 0.15 }), 12.72, 0.76, 7.25);
  meshBox(group, 0.48, 0.58, 0.025, new THREE.MeshBasicMaterial({ color: 0x8dd4dc, transparent: true, opacity: 0.56 }), 12.72, 1.0, 7.47);
  meshBox(group, 0.48, 0.04, 0.04, red, 12.72, 1.42, 7.48);

  return { group };
}
