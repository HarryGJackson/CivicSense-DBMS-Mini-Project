import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query, queryOne } from '../../lib/db';
import { getSession } from '../../lib/auth';
import SqlPeek from '../../components/SqlPeek';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') {
    return (
      <div className="narrow">
        <h1>Dashboard</h1>
        <div className="alert err">
          Administrators only. You are signed in as {session.role}.
        </div>
      </div>
    );
  }

  // every panel below is a database view, not a query assembled here
  const [totals, workload, hotspots, clusters, breaches, embedded, viewDef] = await Promise.all([
    queryOne(
      `SELECT COUNT(*) FILTER (WHERE parent_complaint_id IS NULL)              AS distinct_issues,
              COUNT(*) FILTER (WHERE status = 'DUPLICATE')                     AS merged,
              COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED','DUPLICATE')) AS open,
              COUNT(*) FILTER (WHERE is_hotspot)                               AS hotspot_rows
         FROM complaints`
    ),
    query('SELECT * FROM v_department_workload ORDER BY total_assigned DESC'),
    query('SELECT * FROM v_ward_hotspots'),
    query('SELECT * FROM v_duplicate_clusters'),
    query('SELECT * FROM v_sla_breaches ORDER BY hours_overdue DESC LIMIT 6'),
    queryOne('SELECT COUNT(embedding) AS done, COUNT(*) AS total FROM complaints'),
    // ask PostgreSQL for the view's own definition, so what is shown below is
    // what the database actually holds rather than a copy typed in here
    queryOne(`SELECT pg_get_viewdef('v_duplicate_clusters'::regclass, true) AS def`),
  ]);

  const pending = Number(embedded.total) - Number(embedded.done);

  return (
    <>
      <h1>Dashboard</h1>
      <p className="sub">Every panel here reads a database view.</p>

      {pending > 0 && (
        <div className="alert warn">
          {pending} of {embedded.total} complaints have no embedding yet, so duplicate
          detection falls back to keyword search. Run{' '}
          <code>npm run embed</code> to fix that.
        </div>
      )}

      <div className="grid four">
        <div className="stat"><div className="n">{totals.distinct_issues}</div><div className="l">Distinct issues</div></div>
        <div className="stat"><div className="n">{totals.open}</div><div className="l">Still open</div></div>
        <div className="stat"><div className="n">{totals.merged}</div><div className="l">Merged duplicates</div></div>
        <div className="stat"><div className="n">{totals.hotspot_rows}</div><div className="l">Hotspot-flagged</div></div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Department workload</h2>
        <p className="meta" style={{ marginTop: -6 }}><code>v_department_workload</code></p>
        <table>
          <thead>
            <tr><th>Department</th><th>Assigned</th><th>Pending</th><th>In progress</th><th>Done</th><th>Avg hours to resolve</th></tr>
          </thead>
          <tbody>
            {workload.map((d) => (
              <tr key={d.dept_id}>
                <td><b>{d.dept_name}</b></td>
                <td>{d.total_assigned}</td>
                <td>{d.pending}</td>
                <td>{d.in_progress}</td>
                <td>{d.completed}</td>
                <td>{d.avg_resolution_hours ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid two">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Ward hotspots</h2>
          <p className="meta" style={{ marginTop: -6 }}><code>v_ward_hotspots</code> — many separate issues of one kind in one ward</p>
          {hotspots.length === 0 && <div className="empty">No ward is over its threshold.</div>}
          <table>
            <thead><tr><th>Ward</th><th>Category</th><th>Issues</th><th>Backing</th><th>Flagged</th></tr></thead>
            <tbody>
              {hotspots.map((h, i) => (
                <tr key={i}>
                  <td><b>{h.ward_name}</b></td>
                  <td>{h.category_name}</td>
                  <td>{h.distinct_issues}</td>
                  <td>{h.total_endorsements ?? 0}</td>
                  <td>{h.flagged_hotspot ? <span className="badge hot">yes</span> : <span className="badge plain">no</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Duplicate clusters</h2>
          <p className="meta" style={{ marginTop: -6 }}><code>v_duplicate_clusters</code> — resolved with a recursive CTE</p>
          {clusters.length === 0 && <div className="empty">Nothing has been merged yet.</div>}
          <table>
            <thead><tr><th>Parent</th><th>Ward</th><th>Dupes</th><th>Chain</th><th>Avg sim</th></tr></thead>
            <tbody>
              {clusters.map((c) => (
                <tr key={c.parent_id}>
                  <td><Link href={`/complaints/${c.parent_id}`}>#{c.parent_id} {c.parent_title}</Link></td>
                  <td>{c.ward_name}</td>
                  <td>{c.duplicate_count}</td>
                  <td>{c.chain_depth}</td>
                  <td className="sim">{c.avg_similarity ? Number(c.avg_similarity).toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>SLA breaches</h2>
        <p className="meta" style={{ marginTop: -6 }}><code>v_sla_breaches</code></p>
        {breaches.length === 0 && <div className="empty">Nothing overdue.</div>}
        <table>
          <thead><tr><th>#</th><th>Complaint</th><th>Ward</th><th>Department</th><th>Hours over</th></tr></thead>
          <tbody>
            {breaches.map((b) => (
              <tr key={b.complaint_id}>
                <td>{b.complaint_id}</td>
                <td><Link href={`/complaints/${b.complaint_id}`}>{b.title}</Link></td>
                <td>{b.ward_name}</td>
                <td>{b.dept_name ?? '—'}</td>
                <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{Math.round(Number(b.hours_overdue))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SqlPeek queries={[
        { label: 'Each panel is one line — the logic lives in the view', sql: `SELECT * FROM v_department_workload ORDER BY total_assigned DESC;
SELECT * FROM v_ward_hotspots;
SELECT * FROM v_duplicate_clusters;
SELECT * FROM v_sla_breaches ORDER BY hours_overdue DESC LIMIT 6;` },
        { label: 'v_duplicate_clusters as PostgreSQL stores it — note WITH RECURSIVE', sql: 'CREATE VIEW v_duplicate_clusters AS\n' + viewDef.def },
      ]} />
    </>
  );
}
