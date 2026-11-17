'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error);
    router.push('/complaints');
    router.refresh();
  }

  return (
    <div className="narrow">
      <h1>Register</h1>
      <p className="sub">Citizen account. Staff accounts are created by the corporation.</p>

      <form className="card" onSubmit={submit}>
        {error && <div className="alert err">{error}</div>}

        <label htmlFor="name">Full name</label>
        <input id="name" value={form.name} onChange={set('name')} required />

        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={form.email} onChange={set('email')} required />

        <label htmlFor="phone">Phone <span className="meta">(optional, 10 digits)</span></label>
        <input id="phone" value={form.phone} onChange={set('phone')}
               inputMode="numeric" maxLength={10} placeholder="9845012345" />

        <label htmlFor="password">Password <span className="meta">(at least 8 characters)</span></label>
        <input id="password" type="password" value={form.password}
               onChange={set('password')} autoComplete="new-password" required />

        <div className="row" style={{ marginTop: 18 }}>
          <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
          <span className="spacer" />
          <span className="meta">Already registered? <Link href="/login">Sign in</Link></span>
        </div>
      </form>
    </div>
  );
}
