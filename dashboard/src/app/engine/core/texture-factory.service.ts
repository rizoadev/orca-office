// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from './engine-context';

@Injectable()
export class TextureFactoryService {
  private readonly ctx = inject(EngineContext);

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
      t.anisotropy = this.ctx.renderer.capabilities.getMaxAnisotropy();
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
}
