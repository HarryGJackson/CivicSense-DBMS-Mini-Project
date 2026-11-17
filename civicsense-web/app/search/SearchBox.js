'use client';

import { useState } from 'react';
import Link from 'next/link';

const TRY = [
  'crater beside the bus stand, autos tipping over',
  'road is dark at night and feels unsafe',
  'tap water wasted on the street',
  'rubbish heap smells bad near school',
];

function Results({ rows, scoreLabel }) {
  if (rows.length === 0) return <div className="empty">Found nothing.</div>;
  return (
    <table>
      <thead><tr><th>#</th><th>Complaint</th><th>Ward</th><th>{scoreLabel}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.complaint_id}>
            <td>{r.complaint_id}</td>
            <td><Link href={`/complaints/${r.complaint_id}`}>{r.title}</Link></td>
            <td>{r.ward_name}</td>
            <td className="sim">{Number(r.score).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SearchBox() {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(text) {
    setBusy(true);
    setError('');
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { setData(null); return setError(body.error); }
    setData(body);
  }

  return (
    <>
      <h1>Search: words against meaning</h1>
      <p className="sub">
        One search, answered by both halves of the database. Left: PostgreSQL full-text
        search. Right: pgvector similarity search.
      </p>

      <form className="card" onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <div className="row">
          <input value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }}
                 placeholder="Describe a problem in your own words" />
          <button type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="meta">Try:</span>
          {TRY.map((t) => (
            <button key={t} type="button" className="secondary small"
                    onClick={() => { setQ(t); run(t); }}>
              {t}
            </button>
          ))}
        </div>
      </form>

      {error && <div className="alert err">{error}</div>}

      {data && (
        <>
          <div className="cols">
            <div className="card">
              <h2 style={{ marginTop: 0 }}>By keywords</h2>
              <p className="meta" style={{ marginTop: -6 }}>
                Relational side · <code>to_tsvector @@ plainto_tsquery</code> · GIN index
              </p>
              <Results rows={data.keyword} scoreLabel="Rank" />
            </div>

            <div className="card">
              <h2 style={{ marginTop: 0 }}>By meaning</h2>
              <p className="meta" style={{ marginTop: -6 }}>
                Vector side · <code>embedding &lt;=&gt; query</code> · HNSW index
              </p>
              {data.semantic === null ? (
                <div className="alert warn" style={{ margin: 0 }}>
                  The embedding model has not loaded, so the vector search could not run.
                  Check the terminal running <code>npm run dev</code>, and make sure
                  <code> npm run embed</code> has been run once.
                </div>
              ) : (
                <Results rows={data.semantic} scoreLabel="Similarity" />
              )}
            </div>
          </div>

          <details className="sqlpeek">
            <summary>SQL behind this page</summary>
            <div className="sqlpeek-label">Keyword search — parameter $1 is the text you typed</div>
            <pre>{data.sql.keyword.replace(/^\n/, '')}</pre>
            <div className="sqlpeek-label">Vector search — parameter $1 is the 384-number embedding of that text</div>
            <pre>{data.sql.vector.replace(/^\n/, '')}</pre>
          </details>
        </>
      )}
    </>
  );
}
