import React, { useState } from 'react';

interface AccessGateProps {
  onSubmit: (token: string) => Promise<boolean>;
}

/**
 * Inline unlock prompt for a gated hub. Deliberately not a redirect: the dashboard is
 * embedded in Orca's webview, and navigating away from the SPA during a data fetch
 * fights the host's own reload loop.
 */
export const AccessGate: React.FC<AccessGateProps> = ({ onSubmit }) => {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    const ok = await onSubmit(token.trim());
    if (!ok) setError('Token tidak cocok dengan hub ini.');
    setBusy(false);
  };

  return (
    <div className="access-gate">
      <form onSubmit={submit}>
        <h1>☕ ORCA24 Coworking</h1>
        <p className="sub">
          Kantor ini menampung sesi dari beberapa mesin, jadi isinya terkunci. Tempel
          <code> OFFICE_TOKEN </code> hub.
        </p>
        {error && <p className="err">{error}</p>}
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="OFFICE_TOKEN"
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={busy || !token.trim()}>
          {busy ? 'Memeriksa…' : 'Masuk'}
        </button>
      </form>
    </div>
  );
};
