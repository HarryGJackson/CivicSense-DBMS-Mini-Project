import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '../../lib/db';
import { getSession } from '../../lib/auth';
import MergePanel from './MergePanel';
import SqlPeek from '../../components/SqlPeek';

// Every pair of still-open complaints in the same ward whose embeddings are
// close: a self-join on complaints, compared with pgvector's distance operator.
const PAIRS_SQL = `
  SELECT a.complaint_id AS child_id,  a.title AS child_title,
         b.complaint_id AS parent_id, b.title AS parent_title,
         w.ward_name,
         ROUND((1 - (a.embedding <=> b.embedding))::NUMERIC, 4) AS similarity
    FROM complaints a
    JOIN complaints b ON b.ward_id = a.ward_id
                     AND b.complaint_id < a.complaint_id
                     AND b.parent_complaint_id IS NULL
                     AND b.status IN ('OPEN','ROUTED','IN_PROGRESS')
                     AND b.embedding IS NOT NULL
    JOIN wards w ON w.ward_id = a.ward_id
   WHERE a.parent_complaint_id IS NULL
     AND a.status IN ('OPEN','ROUTED','IN_PROGRESS')
     AND a.embedding IS NOT NULL
     AND (1 - (a.embedding <=> b.embedding)) >= 0.72
     AND ($1::int IS NULL OR a.routed_dept_id = $1)
   ORDER BY similarity DESC
   LIMIT 10`;

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const session = getSession();
  if (!session) redirect('/login');
  // the page refuses non-staff, and so does every API route behind it
  if (session.role !== 'STAFF' && session.role !== 'ADMIN') {
    return (
      <div className="narrow">
        <h1>Staff queue</h1>
        <div className="alert err">
          This page is for department staff. You are signed in as {session.role}.
        </div>
      </div>
    );
  }

  // admins see everything; staff see only their own department
  const deptFilter = session.role === 'ADMIN' ? null : session.dept_id;

  const [queue, pairs, breaches] = await Promise.all([
    query(
      `SELECT c.complaint_id, c.title, c.status, c.priority, c.is_hotspot,
              c.endorsement_count, c.created_at, c.sla_deadline,
              w.ward_name, cc.category_name
         FROM complaints c
         JOIN wards w                 ON w.ward_id      = c.ward_id
         JOIN complaint_categories cc ON cc.category_id = c.category_id
        WHERE c.parent_complaint_id IS NULL
          AND c.status NOT IN ('RESOLVED','CLOSED')
          AND ($1::int IS NULL OR c.routed_dept_id = $1)
        ORDER BY c.priority DESC, c.sla_deadline NULLS LAST`,
      [deptFilter]
    ),
    query(PAIRS_SQL, [deptFilter]),
    query(
      `SELECT complaint_id, title, ward_name, hours_overdue, priority
         FROM v_sla_breaches
        WHERE ($1::text IS NULL OR dept_name = $1)
        ORDER BY hours_overdue DESC LIMIT 8`,
      [session.role === 'ADMIN' ? null : session.dept_name]
    ),
  ]);

  return (
    <>
      <h1>Staff queue</h1>
      <p className="sub">
        {session.role === 'ADMIN'
          ? 'Every department.'
          : `${session.dept_name} — complaints routed anywhere else are not yours to change.`}
      </p>

      {breaches.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>
          <h2 style={{ marginTop: 0 }}>Past their SLA ({breaches.length})</h2>
          <p className="meta" style={{ marginTop: -6 }}>From the view <code>v_sla_breaches</code>.</p>
          <table>
            <thead><tr><th>#</th><th>Complaint</th><th>Ward</th><th>Hours over</th></tr></thead>
            <tbody>
              {breaches.map((b) => (
                <tr key={b.complaint_id}>
                  <td>{b.complaint_id}</td>
                  <td><Link href={`/complaints/${b.complaint_id}`}>{b.title}</Link></td>
                  <td>{b.ward_name}</td>
                  <td style={{ color: 'var(--danger)', fontWeight: 600 }}>
                    {Math.round(Number(b.hours_overdue))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MergePanel pairs={pairs} />

      <SqlPeek title="SQL behind the duplicate suggestions" queries={[
        { label: 'Vector self-join — pairs of open complaints in one ward that mean the same thing', sql: PAIRS_SQL },
        { label: 'What the merge button runs — a stored procedure, one transaction', sql: 'CALL merge_duplicate_complaint($1, $2, $3, $4);\n-- child id, parent id, similarity, acting user' },
      ]} />

      <h2>Open complaints ({queue.length})</h2>
      {queue.length === 0 && <div className="empty">Nothing open in your department.</div>}
      {queue.map((c) => (
        <Link key={c.complaint_id} href={`/complaints/${c.complaint_id}`} className="card-link">
          <div className="card">
            <div className="card-row">
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                  <span className={`badge ${c.status}`}>{c.status.replace('_', ' ')}</span>
                  {c.is_hotspot && <span className="badge hot">hotspot</span>}
                </div>
                <div style={{ fontWeight: 600 }}>{c.title}</div>
                <div className="meta">{c.ward_name} · {c.category_name}</div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 92 }}>
                <div className="prio">priority <b>{c.priority}</b></div>
                <div className="meta">{c.endorsement_count} endorsing</div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}
