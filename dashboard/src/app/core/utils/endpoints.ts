// ============================================================
// Endpoint resolver — port dari lib/office-endpoints.ts
//
// Prinsip: SELALU same-origin (relatif).
//   - Produksi: hub menyajikan dashboard ini di :4317, jadi '/api/state' sudah benar.
//   - Dev `ng serve` :4200: proxy.conf.json meneruskan /api, /ws, /gateway ke :4317,
//     jadi relativ juga tetap benar.
//
// Kenapa tidak membangun URL absolut ke :4317 saat dev (cara React dulu): hub menjawab
// dengan `Access-Control-Allow-Origin: *`, sedangkan semua fetch kita kirim dengan
// credentials:'include' (butuh cookie token). Kombinasi itu BLOKIR oleh CORS spec, jadi
// dev-modeReact diam-diam hanya jalan kalau origin-nya kebetulan lolos. Lewat proxy,
// tidak ada lintas-origin sama sekali — lebih benar dan tidak rapuh.
// ============================================================

export function officeApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized;
}

/**
 * Loopback hub = mesin ini, tidak pernah meng-gate pembacaan. Perbandingan harus pakai
 * hostname, bukan URL hasil officeApiUrl(): fungsi itu mengembalikan path relatif
 * ('/api/state') sehingga pengecekan prefix apa pun selalu gagal.
 */
export function isLoopbackHub(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function officeWsUrl(): string {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}/ws`;
}
