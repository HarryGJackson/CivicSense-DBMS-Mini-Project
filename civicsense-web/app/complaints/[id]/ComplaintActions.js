'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const NEXT_STATUS = {
  OPEN: ['ROUTED', 'IN_PROGRESS', 'RESOLVED'],
  ROUTED: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
  DUPLICATE: [],
};

export default function ComplaintActions({ complaint, session, canAct, alreadyEndorsed, duplicateCount }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: complaint.title, description: complaint.description });

  const id = complaint.complaint_id;
  const isStaff = session.role === 'STAFF' || session.role === 'ADMIN';
  const isOwner = session.user_id === complaint.filed_by;
  const canEdit = (isOwner || session.role === 'ADMIN') && complaint.status === 'OPEN';
  const options = NEXT_STATUS[complaint.status] || [];

  // every button on this page goes through here: call an API route, show the
  // error if it refuses, otherwise reload the page's data from the database
  async function call(url, body, method = 'POST') {
    setBusy(true);
    setError('');
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function saveEdit() {
    if (await call(`/api/complaints/${id}`, draft, 'PUT')) setEditing(false);
  }

  async function withdraw() {
    if (!window.confirm('Withdraw this complaint? This cannot be undone.')) return;
    setBusy(true);
    const res = await fetch(`/api/complaints/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error);
    router.push('/complaints');
    router.refresh();
  }

  return (
    <>
      {error && <div className="alert err">{error}</div>}

      {/* ---- the person who filed it, while it is still OPEN ---- */}
      {canEdit && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{isOwner ? 'Your complaint' : 'Admin: correct or remove'}</h2>
          {!editing ? (
            <div className="row">
              <button className="secondary" onClick={() => setEditing(true)}>Edit wording</button>
              {duplicateCount === 0 && (
                <button className="danger" disabled={busy} onClick={withdraw}>Withdraw</button>
              )}
              <span className="meta">Possible only while the status is OPEN.</span>
            </div>
          ) : (
            <>
              <label htmlFor="etitle">Title</label>
              <input id="etitle" value={draft.title} maxLength={150}
                     onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <label htmlFor="edesc">Description</label>
              <textarea id="edesc" value={draft.description}
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <div className="meta">Saving recomputes the embedding from the new text.</div>
              <div className="row" style={{ marginTop: 10 }}>
                <button disabled={busy} onClick={saveEdit}>Save changes</button>
                <button className="secondary" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- anyone signed in can endorse ---- */}
      {['OPEN', 'ROUTED', 'IN_PROGRESS'].includes(complaint.status) && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Affected by this too?</h2>
          {alreadyEndorsed ? (
            <div className="alert ok" style={{ margin: 0 }}>
              You have endorsed this complaint. Priority rises as more citizens do.
            </div>
          ) : (
            <>
              <p className="meta" style={{ marginTop: -4 }}>
                Endorsing inserts one row. A trigger then recounts and re-grades the priority.
              </p>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255}
                     placeholder="Optional: add what you have seen" />
              <div className="row" style={{ marginTop: 10 }}>
                <button disabled={busy}
                        onClick={() => call(`/api/complaints/${id}/endorse`, { comment: note })}>
                  Endorse this complaint
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- staff only, and only their own department ---- */}
      {isStaff && (
        <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
          <h2 style={{ marginTop: 0 }}>Staff actions</h2>

          {!canAct ? (
            <div className="alert warn" style={{ margin: 0 }}>
              This complaint is routed to another department, so you cannot change it.
              The API refuses the request too, not just this screen.
            </div>
          ) : options.length === 0 ? (
            <div className="meta">Nothing further to do — this complaint is {complaint.status.toLowerCase()}.</div>
          ) : (
            <>
              <div className="row">
                {options
                  .filter((s) => !['RESOLVED', 'CLOSED'].includes(s))
                  .map((s) => (
                    <button key={s} className="secondary" disabled={busy}
                            onClick={() => call(`/api/complaints/${id}/status`, { status: s })}>
                      Mark {s.replace('_', ' ').toLowerCase()}
                    </button>
                  ))}
              </div>

              {options.some((s) => ['RESOLVED', 'CLOSED'].includes(s)) && (
                <>
                  <label htmlFor="res">Close it with a resolution</label>
                  <textarea id="res" value={resolution} onChange={(e) => setResolution(e.target.value)}
                            placeholder="Drain desilted and the choked section cleared. Grating replaced with a wider mesh."
                            style={{ minHeight: 80 }} />
                  <div className="row" style={{ marginTop: 10 }}>
                    {options
                      .filter((s) => ['RESOLVED', 'CLOSED'].includes(s))
                      .map((s) => (
                        <button key={s} disabled={busy || resolution.trim().length < 10}
                                onClick={() =>
                                  call(`/api/complaints/${id}/status`, {
                                    status: s,
                                    resolution_text: resolution,
                                  })
                                }>
                          Mark {s.toLowerCase()}
                        </button>
                      ))}
                    <span className="meta">Needs at least 10 characters.</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
