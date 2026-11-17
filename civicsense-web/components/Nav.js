'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function Nav({ session }) {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const is = (p) => (path === p || path.startsWith(p + '/') ? 'link active' : 'link');

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/complaints" className="brand">
          Civic<span>Sense</span>
        </Link>

        {session && (
          <>
            <Link href="/complaints" className={path.startsWith('/complaints') && path !== '/complaints/new' ? 'link active' : 'link'}>Complaints</Link>
            <Link href="/complaints/new" className={is('/complaints/new')}>File a complaint</Link>
            <Link href="/search" className={is('/search')}>Search</Link>
            {/* these two only render for the roles that may use them, and the
                API routes behind them check the role again on every request */}
            {(session.role === 'STAFF' || session.role === 'ADMIN') && (
              <Link href="/staff" className={is('/staff')}>Staff queue</Link>
            )}
            {session.role === 'ADMIN' && (
              <Link href="/admin" className={is('/admin')}>Dashboard</Link>
            )}
          </>
        )}

        <div className="nav-right">
          {session ? (
            <>
              <span className="whoami">
                <b>{session.name}</b> · {session.role}
                {session.dept_name ? ` · ${session.dept_name}` : ''}
              </span>
              <button className="secondary small" onClick={logout}>Sign out</button>
            </>
          ) : (
            <>
              <Link href="/login" className="link">Sign in</Link>
              <Link href="/register" className="btn small">Register</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
