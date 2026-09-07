function localApiOrigin(): string {
  const { protocol, hostname, port } = window.location;
  if (port === '5173') return `${protocol}//${hostname}:4317`;
  return '';
}

export function officeApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${localApiOrigin()}${normalized}`;
}

export function officeWsUrl(): string {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const { hostname, port } = window.location;
  const host = port === '5173' ? `${hostname}:4317` : window.location.host;
  return `${wsProtocol}//${host}/ws`;
}
