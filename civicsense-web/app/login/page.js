'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error);
    router.push(data.role === 'ADMIN' ? '/admin' : data.role === 'STAFF' ? '/staff' : '/complaints');
    router.refresh();
  }

  function demo(addr) {
    setEmail(addr);
    setPassword('password123');
    setError('');
  }

  return (
    <div className="narrow">
      <h1>Sign in</h1>
      <p className="sub">CivicSense complaint portal</p>

      <form className="card" onSubmit={submit}>
        {error && <div className="alert err">{error}</div>}

        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} autoComplete="username"
               onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={password} autoComplete="current-password"
               onChange={(e) => setPassword(e.target.value)} required />

        <div className="row" style={{ marginTop: 18 }}>
          <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <span className="spacer" />
          <span className="meta">No account? <Link href="/register">Register</Link></span>
        </div>
      </form>

      <div className="card tight">
        <div className="meta" style={{ marginBottom: 8 }}>
          <b>Demo accounts</b> — all use the password <code>password123</code>
        </div>
        <div className="row">
          <button className="secondary small" type="button" onClick={() => demo('sanjay.k@example.com')}>
            Citizen · Sanjay
          </button>
          <button className="secondary small" type="button" onClick={() => demo('ramesh.g@citycorp.gov.in')}>
            Staff · Roads (Ramesh)
          </button>
          <button className="secondary small" type="button" onClick={() => demo('sunitha.d@citycorp.gov.in')}>
            Staff · Water (Sunitha)
          </button>
          <button className="secondary small" type="button" onClick={() => demo('admin@citycorp.gov.in')}>
            Admin
          </button>
        </div>
      </div>
    </div>
  );
}
