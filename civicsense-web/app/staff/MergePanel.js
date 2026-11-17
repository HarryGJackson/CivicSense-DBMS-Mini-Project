'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * Pairs of open complaints in the same ward whose embeddings are close.
 * The system proposes; a human decides. Nothing merges on its own — which is
 * the honest answer to "what if the match is wrong?"
 */
export default function MergePanel({ pairs }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [dismissed, setDismissed] = useState([]);

  const visible = pairs.filter((p) => !dismissed.includes(`${p.child_id}-${p.parent_id}`));

  async function merge(childId, parentId, similarity) {
    setBusy(`${childId}-${parentId}`);
    setError('');
    const res = await fetch(`/api/complaints/${childId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId, similarity }),
    });
    setBusy(null);
    if (!res.ok) return setError((await res.json()).error);
    router.refresh();
  }

  if (pairs.length === 0) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Possible duplicates</h2>
        <div className="meta">
          Nothing above the similarity threshold right now. If every complaint shows
          <code>embedding</code> as NULL, run <code>npm run embed</code> first.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ borderLeft: '3px solid #6938ef' }}>
      <h2 style={{ marginTop: 0 }}>Possible duplicates ({visible.length})</h2>
      <p className="meta" style={{ marginTop: -6 }}>
        Found by comparing embeddings, not words. Confirm or skip — nothing merges automatically.
      </p>
      {error && <div className="alert err">{error}</div>}

      {visible.map((p) => {
        const key = `${p.child_id}-${p.parent_id}`;
        return (
          <div key={key} className="card tight" style={{ marginBottom: 8 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="badge plain">similarity <span className="sim">{Number(p.similarity).toFixed(2)}</span></span>
              <span className="meta">{p.ward_name}</span>
            </div>
            <div style={{ fontSize: 14 }}>
              <div style={{ marginBottom: 2 }}>
                <span className="meta">keep </span>
                <Link href={`/complaints/${p.parent_id}`}><b>#{p.parent_id}</b> {p.parent_title}</Link>
              </div>
              <div>
                <span className="meta">merge </span>
                <Link href={`/complaints/${p.child_id}`}><b>#{p.child_id}</b> {p.child_title}</Link>
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="small" disabled={busy === key}
                      onClick={() => merge(p.child_id, p.parent_id, p.similarity)}>
                {busy === key ? 'Merging…' : 'Same issue — merge'}
              </button>
              <button className="secondary small" onClick={() => setDismissed([...dismissed, key])}>
                Different issues
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
