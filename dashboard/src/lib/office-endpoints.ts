function localApiOrigin(): string {
  const { protocol, hostname, port } = window.location;
  if (port === '5173') return `${protocol}//${hostname}:4317`;
  return '';
}

export function officeApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${localApiOrigin()}${normalized}`;
}

/**
 * Loopback hub = mesin ini, tidak pernah meng-gate pembacaan. Perbandingan harus pakai
 * hostname, bukan URL hasil officeApiUrl(): untuk same-origin fungsi itu mengembalikan
 * path relatif ('/api/state') sehingga pengecekan prefix apa pun selalu gagal.
 */
export function isLoopbackHub(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function officeWsUrl(): string {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const { hostname, port } = window.location;
  const host = port === '5173' ? `${hostname}:4317` : window.location.host;
  return `${wsProtocol}//${host}/ws`;
}
