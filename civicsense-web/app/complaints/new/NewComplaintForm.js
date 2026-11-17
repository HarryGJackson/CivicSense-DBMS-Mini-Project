'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function NewComplaintForm({ wards, categories }) {
  const router = useRouter();
  const [form, setForm] = useState({ title: '', description: '', ward_id: '', category_id: '' });
  const [dupes, setDupes] = useState({ method: 'none', candidates: [] });
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const category = categories.find((c) => String(c.category_id) === String(form.category_id));

  // Look for duplicates as the citizen types, but wait until they pause —
  // otherwise every keystroke would run an embedding and a vector search.
  useEffect(() => {
    const text = `${form.title} ${form.description}`.trim();
    if (text.length < 25 || !form.ward_id) {
      setDupes({ method: 'none', candidates: [] });
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch('/api/complaints/check-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            ward_id: form.ward_id,
          }),
        });
        if (res.ok) setDupes(await res.json());
      } finally {
        setChecking(false);
      }
    }, 700);
    return () => clearTimeout(timer.current);
  }, [form.title, form.description, form.ward_id]);

  async function endorseInstead(id) {
    setBusy(true);
    const res = await fetch(`/api/complaints/${id}/endorse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: 'Reported the same issue' }),
    });
    setBusy(false);
    // already endorsed is fine here — either way their voice is on the record
    if (res.ok || res.status === 409) {
      router.push(`/complaints/${id}`);
      router.refresh();
    } else {
      setError((await res.json()).error);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error);
    router.push(`/complaints/${data.complaint_id}`);
    router.refresh();
  }

  return (
    <div className="narrow">
      <h1>File a complaint</h1>
      <p className="sub">Describe the problem in your own words.</p>

      <form className="card" onSubmit={submit}>
        {error && <div className="alert err">{error}</div>}

        <label htmlFor="title">What is wrong?</label>
        <input id="title" value={form.title} onChange={set('title')} maxLength={150}
               placeholder="Big hole near the bus stop" required />

        <label htmlFor="ward">Which ward?</label>
        <select id="ward" value={form.ward_id} onChange={set('ward_id')} required>
          <option value="">Select a ward…</option>
          {wards.map((w) => (
            <option key={w.ward_id} value={w.ward_id}>{w.ward_name} ({w.zone})</option>
          ))}
        </select>

        <label htmlFor="category">What kind of problem?</label>
        <select id="category" value={form.category_id} onChange={set('category_id')} required>
          <option value="">Select a category…</option>
          {categories.map((c) => (
            <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
          ))}
        </select>
        {category && (
          <div className="meta" style={{ marginTop: 6 }}>
            Goes to <b>{category.dept_name}</b> · due within <b>{category.sla_hours} hours</b>
          </div>
        )}

        <label htmlFor="description">Describe it</label>
        <textarea id="description" value={form.description} onChange={set('description')}
                  placeholder="There is a large crater on the road right beside the bus stand. Autos are almost tipping over when they drive across it."
                  required />
        <div className="meta">{form.description.length} characters · at least 15 needed</div>

        {/* ---- duplicate detection ---- */}
        {checking && <div className="alert info">Checking for complaints about the same problem…</div>}

        {!checking && dupes.candidates.length > 0 && (
          <div className="alert warn" style={{ padding: '12px 14px' }}>
            <div style={{ fontWeight: 650, marginBottom: 2 }}>
              Someone may have already reported this
            </div>
            <div style={{ fontSize: 12.5, marginBottom: 10 }}>
              {dupes.method === 'vector'
                ? 'Matched on meaning, not wording — these may use completely different words.'
                : 'Matched on shared keywords. The embedding model has not loaded, so wording-independent matching is off.'}
            </div>

            {dupes.candidates.map((c) => (
              <div key={c.complaint_id} className="card tight" style={{ marginBottom: 8 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className={`badge ${c.status}`}>{c.status.replace('_', ' ')}</span>
                  <span className="meta">
                    {dupes.method === 'vector' ? 'similarity' : 'rank'}{' '}
                    <span className="sim">{Number(c.similarity).toFixed(2)}</span>
                  </span>
                  <span className="spacer" />
                  <span className="meta">{c.endorsement_count} endorsing</span>
                </div>
                <div style={{ fontWeight: 600, margin: '4px 0 2px' }}>{c.title}</div>
                <div className="meta" style={{ marginBottom: 8 }}>
                  filed by {c.filed_by} on{' '}
                  {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </div>
                <button type="button" className="small" disabled={busy}
                        onClick={() => endorseInstead(c.complaint_id)}>
                  This is the same issue
                </button>
              </div>
            ))}

            <div className="meta">
              None of these? Carry on and file yours below.
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          <button type="submit" disabled={busy}>
            {busy ? 'Filing…' : 'File complaint'}
          </button>
          <span className="meta">
            {dupes.candidates.length > 0 ? 'Files a separate complaint' : ''}
          </span>
        </div>
      </form>
    </div>
  );
}
