// AUTO-DIGENERASI oleh tools/decompose-engine.mjs dari officeEngine.ts.
// Badan fungsi dipindah VERBATIM; satu-satunya perubahan adalah `this.<X>` → `this.<pemilik>.<X>`.
// Untuk mengubah logika: sunting sumber lalu jalankan ulang generator, atau putuskan
// sumber kebenaran pindah ke file ini dan hapus generatornya.

export type MenuBoardRow = { drink: string; model?: string; price: string; sold?: string };

// Menu hiasan sebelum ada satu pun sesi Pi menyeduh token.
export const PLACEHOLDER_MENU: MenuBoardRow[] = [
  { drink: 'ESPRESSO', price: '—' },
  { drink: 'LATTE', price: '—' },
  { drink: 'AMERICANO', price: '—' },
];
