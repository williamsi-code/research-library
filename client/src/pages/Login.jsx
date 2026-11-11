import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onSignedIn }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', { method: 'POST', body: { password } });
      onSignedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="brand-mark large" aria-hidden="true" />
        <h1>Research library</h1>
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
