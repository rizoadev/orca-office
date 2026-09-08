// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.
import { Injectable, inject } from '@angular/core';
import * as THREE from 'three';
import { EngineContext } from '../core/engine-context';
import { TextureFactoryService } from '../core/texture-factory.service';
import type { MenuBoardRow } from '../core/engine-menu-data';
import { PLACEHOLDER_MENU } from '../core/engine-menu-data';
import { paintSignBoard, SIGN_FONT, clipText } from '../core/engine-painters';

@Injectable()
export class MenuBoardService {
  private readonly ctx = inject(EngineContext);
  private readonly tex = inject(TextureFactoryService);

  // Papan menu 3D — digambar ulang dari tagihan sungguhan (nama kopi = model LLM).
  menuBoardRows: MenuBoardRow[] = PLACEHOLDER_MENU;

  menuSign: THREE.Mesh | null = null;

  setMenuBoard(rows: MenuBoardRow[]) {
    const next = rows.length ? rows.slice(0, 5) : PLACEHOLDER_MENU;
    const changed = JSON.stringify(next) !== JSON.stringify(this.menuBoardRows);
    this.menuBoardRows = next;
    if (!changed || !this.menuSign) return;

    // Tekstur lama dibuang dulu: menggantinya tanpa dispose membocorkan VRAM tiap update.
    const material = this.menuSign.material as THREE.MeshBasicMaterial;
    const previous = material.map;
    material.map = this.tex.createSignTex(2194, 768, (g, w, h) => this.drawMenuBoard(g, w, h));
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
}
