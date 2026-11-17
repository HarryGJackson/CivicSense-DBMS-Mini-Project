import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { query, queryOne } from '../../../lib/db';
import { getSession } from '../../../lib/auth';
import ComplaintActions from './ComplaintActions';
import SqlPeek from '../../../components/SqlPeek';

// The weak entity: rows here are written by trigger trg_log_status, never by the app.
const HISTORY_SQL = `
  SELECT h.seq_no, h.old_status, h.new_status, h.changed_at, h.remarks, u.name AS changed_by
    FROM complaint_status_history h
    LEFT JOIN users u ON u.user_id = h.changed_by
   WHERE h.complaint_id = $1
   ORDER BY h.seq_no DESC`;

// The recursive relationship: every complaint whose parent_complaint_id points here.
const DUPLICATES_SQL = `
  SELECT ch.complaint_id, ch.title, ch.similarity_score, u.name AS filed_by
    FROM complaints ch
    JOIN users u ON u.user_id = ch.filed_by
   WHERE ch.parent_complaint_id = $1
   ORDER BY ch.complaint_id`;

export const dynamic = 'force-dynamic';

export default async function ComplaintPage({ params }) {
  const session = getSession();
  if (!session) redirect('/login');
  const id = Number(params.id);

  const complaint = await queryOne(
    `SELECT c.*, w.ward_name, w.zone, cc.category_name, cc.sla_hours,
            d.dept_name, u.name AS filed_by_name,
            su.name AS handled_by_name,
            p.title AS parent_title
       FROM complaints c
       JOIN wards w                 ON w.ward_id      = c.ward_id
       JOIN complaint_categories cc ON cc.category_id = c.category_id
       JOIN users u                 ON u.user_id      = c.filed_by
       LEFT JOIN departments d      ON d.dept_id      = c.routed_dept_id
       LEFT JOIN staff s            ON s.staff_id     = c.handled_by
       LEFT JOIN users su           ON su.user_id     = s.user_id
       LEFT JOIN complaints p       ON p.complaint_id = c.parent_complaint_id
      WHERE c.complaint_id = $1`,
    [id]
  );
  if (!complaint) notFound();

  const [history, endorsements, duplicates, resolution, mine] = await Promise.all([
    query(HISTORY_SQL, [id]),
    query(
      `SELECT u.name, e.endorsed_at, e.comment
         FROM endorsements e JOIN users u ON u.user_id = e.user_id
        WHERE e.complaint_id = $1 ORDER BY e.endorsed_at DESC`,
      [id]
    ),
    query(DUPLICATES_SQL, [id]),
    queryOne(
      `SELECT r.resolution_text, r.resolved_at, u.name AS closed_by
         FROM resolutions r
         JOIN staff s ON s.staff_id = r.closed_by
         JOIN users u ON u.user_id  = s.user_id
        WHERE r.complaint_id = $1`,
      [id]
    ),
    queryOne(
      `SELECT 1 FROM endorsements WHERE complaint_id = $1 AND user_id = $2`,
      [id, session.user_id]
    ),
  ]);

  // staff may only act on complaints routed to their own department
  const canAct =
    session.role === 'ADMIN' ||
    (session.role === 'STAFF' &&
      (complaint.routed_dept_id === null || complaint.routed_dept_id === session.dept_id));

  const overdue =
    complaint.sla_deadline &&
    !['RESOLVED', 'CLOSED', 'DUPLICATE'].includes(complaint.status) &&
    new Date(complaint.sla_deadline) < new Date();

  return (
    <>
      <p className="meta" style={{ marginBottom: 10 }}>
        <Link href="/complaints">← All complaints</Link>
      </p>

      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <span className={`badge ${complaint.status}`}>{complaint.status.replace('_', ' ')}</span>
        {complaint.is_hotspot && <span className="badge hot">ward hotspot</span>}
        {overdue && <span className="badge hot">SLA breached</span>}
        <span className="badge plain">#{complaint.complaint_id}</span>
      </div>

      <h1>{complaint.title}</h1>
      <p className="sub">
        {complaint.ward_name} ({complaint.zone}) · {complaint.category_name}
        {complaint.dept_name && <> · {complaint.dept_name}</>}
        {' · '}filed by {complaint.filed_by_name}
      </p>

      {complaint.parent_complaint_id && (
        <div className="alert info">
          Merged as a duplicate of{' '}
          <Link href={`/complaints/${complaint.parent_complaint_id}`}>
            #{complaint.parent_complaint_id} — {complaint.parent_title}
          </Link>
          {complaint.similarity_score && <> · similarity {Number(complaint.similarity_score).toFixed(2)}</>}
        </div>
      )}

      <div className="grid four" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="n">{complaint.priority}</div><div className="l">Priority</div></div>
        <div className="stat"><div className="n">{complaint.endorsement_count}</div><div className="l">Endorsing</div></div>
        <div className="stat"><div className="n">{duplicates.length}</div><div className="l">Duplicates</div></div>
        <div className="stat">
          <div className="n" style={{ fontSize: 15, paddingTop: 7 }}>
            {complaint.sla_deadline
              ? new Date(complaint.sla_deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
              : '—'}
          </div>
          <div className="l">SLA due</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>What was reported</h2>
        <p style={{ margin: 0 }}>{complaint.description}</p>
      </div>

      {resolution && (
        <div className="card" style={{ borderLeft: '3px solid var(--ok)' }}>
          <h2 style={{ marginTop: 0 }}>How it was fixed</h2>
          <p style={{ margin: '0 0 6px' }}>{resolution.resolution_text}</p>
          <div className="meta">
            {resolution.closed_by} · {new Date(resolution.resolved_at).toLocaleString('en-IN')}
          </div>
        </div>
      )}

      <ComplaintActions
        complaint={complaint}
        session={session}
        canAct={canAct}
        alreadyEndorsed={Boolean(mine)}
        duplicateCount={duplicates.length}
      />

      {duplicates.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Merged into this one</h2>
          <table>
            <thead><tr><th>#</th><th>Reported as</th><th>By</th><th>Similarity</th></tr></thead>
            <tbody>
              {duplicates.map((d) => (
                <tr key={d.complaint_id}>
                  <td>{d.complaint_id}</td>
                  <td><Link href={`/complaints/${d.complaint_id}`}>{d.title}</Link></td>
                  <td>{d.filed_by}</td>
                  <td className="sim">{d.similarity_score ? Number(d.similarity_score).toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Status history</h2>
          <p className="meta" style={{ marginTop: -6 }}>Written automatically by a database trigger.</p>
          <ul className="timeline">
            {history.map((h) => (
              <li key={h.seq_no}>
                <div>
                  <b>{(h.old_status || 'filed').replace('_', ' ')}</b> → <b>{h.new_status.replace('_', ' ')}</b>
                </div>
                <div className="meta">
                  {new Date(h.changed_at).toLocaleString('en-IN')}
                  {h.changed_by && <> · {h.changed_by}</>}
                </div>
                {h.remarks && <div className="meta">{h.remarks}</div>}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Citizens endorsing ({endorsements.length})</h2>
          {endorsements.length === 0 && <div className="empty">Nobody has endorsed this yet.</div>}
          <ul className="timeline">
            {endorsements.map((e, i) => (
              <li key={i}>
                <div><b>{e.name}</b></div>
                {e.comment && <div style={{ fontSize: 13.5 }}>{e.comment}</div>}
                <div className="meta">{new Date(e.endorsed_at).toLocaleDateString('en-IN')}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <SqlPeek queries={[
        { label: `Status history — the weak entity, keyed by (complaint_id, seq_no). Parameter: ${id}`, sql: HISTORY_SQL },
        { label: `Merged duplicates — self-join through the recursive foreign key. Parameter: ${id}`, sql: DUPLICATES_SQL },
      ]} />
    </>
  );
}
