// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.

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

// Lanskap luar untuk dinding kaca. MeshBasicMaterial membuat lukisan malam ini tetap
// terbaca di balik kaca, tapi paletnya sengaja redup agar tidak silau.
export function paintSkyBackdrop(g: CanvasRenderingContext2D, w: number, h: number) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#030817');
  sky.addColorStop(0.45, '#0b1a31');
  sky.addColorStop(0.72, '#17283a');
  sky.addColorStop(1, '#1d2419');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const moonX = w * 0.78;
  const moonY = h * 0.2;
  const moonGlow = g.createRadialGradient(moonX, moonY, 8, moonX, moonY, h * 0.45);
  moonGlow.addColorStop(0, 'rgba(226,238,255,0.58)');
  moonGlow.addColorStop(0.14, 'rgba(164,190,230,0.22)');
  moonGlow.addColorStop(1, 'rgba(72,95,140,0)');
  g.fillStyle = moonGlow;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#dbeafe';
  g.beginPath();
  g.arc(moonX, moonY, h * 0.035, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(220,235,255,0.74)';
  for (let i = 0; i < 95; i++) {
    const x = (i * 131 + 17) % w;
    const y = (i * 47 + 23) % Math.floor(h * 0.52);
    const r = 0.7 + ((i * 7) % 12) / 10;
    g.globalAlpha = 0.22 + ((i * 19) % 55) / 100;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const horizon = h * 0.67;
  const drawMountain = (cx: number, baseY: number, width: number, height: number, color: string, rim: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(cx - width * 0.56, baseY);
    g.lineTo(cx - width * 0.24, baseY - height * 0.56);
    g.lineTo(cx - width * 0.06, baseY - height * 0.42);
    g.lineTo(cx + width * 0.08, baseY - height);
    g.lineTo(cx + width * 0.31, baseY - height * 0.5);
    g.lineTo(cx + width * 0.56, baseY);
    g.closePath();
    g.fill();
    g.strokeStyle = rim;
    g.lineWidth = Math.max(2, h * 0.005);
    g.beginPath();
    g.moveTo(cx - width * 0.52, baseY);
    g.lineTo(cx + width * 0.08, baseY - height);
    g.lineTo(cx + width * 0.54, baseY);
    g.stroke();
  };
  // Dua gunung jauh di belakang sabana — lebih gelap, dengan rim moonlight agar tidak blank.
  drawMountain(w * 0.34, horizon + h * 0.035, w * 0.47, h * 0.36, '#16283a', 'rgba(146,177,214,0.28)');
  drawMountain(w * 0.72, horizon + h * 0.04, w * 0.52, h * 0.42, '#112434', 'rgba(151,184,220,0.3)');
  const savanna = g.createLinearGradient(0, horizon, 0, h);
  savanna.addColorStop(0, '#29351f');
  savanna.addColorStop(0.5, '#3b351b');
  savanna.addColorStop(1, '#241a0e');
  g.fillStyle = savanna;
  g.fillRect(0, horizon, w, h - horizon);
  // Lapisan rumput sabana yang rendah dan kontrasnya lembut supaya malam tetap kebaca.
  g.strokeStyle = 'rgba(166,145,72,0.26)';
  g.lineWidth = Math.max(1.4, h * 0.004);
  for (let i = 0; i < 6; i++) {
    const y = horizon + h * (0.04 + i * 0.052);
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += w / 12) {
      g.lineTo(x, y + Math.sin(i * 1.7 + x * 0.014) * h * 0.012);
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(189,163,84,0.33)';
  g.lineWidth = 1;
  for (let i = 0; i < 85; i++) {
    const x = (i * 73) % w;
    const y = horizon + h * 0.08 + ((i * 41) % Math.floor(h * 0.24));
    const blade = 7 + ((i * 17) % 18);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + ((i % 3) - 1) * 3, y - blade);
    g.stroke();
  }
  // Siluet akasia malam sebagai aksen sabana.
  g.fillStyle = 'rgba(13,24,13,0.78)';
  [0.12, 0.53, 0.88].forEach((p, i) => {
    const x = w * p;
    const y = horizon + h * (0.035 + (i % 2) * 0.025);
    g.fillRect(x - 2, y - h * 0.1, 4, h * 0.1);
    g.beginPath();
    g.ellipse(x, y - h * 0.1, w * 0.045, h * 0.03, 0, 0, Math.PI * 2);
    g.fill();
  });
}

export const SIGN_FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

export function clipText(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}
