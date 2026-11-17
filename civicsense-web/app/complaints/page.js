import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '../../lib/db';
import { getSession } from '../../lib/auth';
import Filters from './Filters';
import SqlPeek from '../../components/SqlPeek';

export const dynamic = 'force-dynamic';

export default async function ComplaintsPage({ searchParams }) {
  const session = getSession();
  if (!session) redirect('/login');

  // Build the WHERE clause from whichever filters are set. The values never
  // go into the SQL text: they travel separately as $1, $2, ... parameters.
  const where = ['c.parent_complaint_id IS NULL'];
  const args = [];
  const add = (column, value) => {
    args.push(value);
    where.push(`${column} = $${args.length}`);
  };
  if (searchParams.ward)     add('c.ward_id', searchParams.ward);
  if (searchParams.category) add('c.category_id', searchParams.category);
  if (searchParams.status)   add('c.status', searchParams.status);

  const listSql = `
    SELECT c.complaint_id, c.title, c.status, c.priority, c.is_hotspot,
           c.endorsement_count, c.created_at,
           w.ward_name, cc.category_name, d.dept_name,
           (SELECT COUNT(*) FROM complaints ch
             WHERE ch.parent_complaint_id = c.complaint_id) AS duplicate_count
      FROM complaints c
      JOIN wards w                 ON w.ward_id      = c.ward_id
      JOIN complaint_categories cc ON cc.category_id = c.category_id
      LEFT JOIN departments d      ON d.dept_id      = c.routed_dept_id
     WHERE ${where.join('\n       AND ')}
     ORDER BY c.priority DESC, c.created_at DESC`;

  const [complaints, wards, categories] = await Promise.all([
    query(listSql, args),
    query('SELECT ward_id, ward_name FROM wards ORDER BY ward_number'),
    query('SELECT category_id, category_name FROM complaint_categories ORDER BY category_name'),
  ]);

  const open = complaints.filter((c) => !['RESOLVED', 'CLOSED'].includes(c.status)).length;
  const hotspots = complaints.filter((c) => c.is_hotspot).length;

  return (
    <>
      <h1>Complaints</h1>
      <p className="sub">
        {complaints.length} distinct {complaints.length === 1 ? 'issue' : 'issues'} · {open} still open
        {hotspots > 0 && <> · {hotspots} in flagged hotspots</>}
        {' '}· duplicates are folded into their parent
      </p>

      <Filters wards={wards} categories={categories} current={searchParams} />

      <SqlPeek queries={[{
        label: `Complaint list — joins 4 tables, correlated subquery counts duplicates${args.length ? ` (parameters: ${args.join(', ')})` : ''}`,
        sql: listSql,
      }]} />

      {complaints.length === 0 && <div className="empty">Nothing matches those filters.</div>}

      {complaints.map((c) => (
        <Link key={c.complaint_id} href={`/complaints/${c.complaint_id}`} className="card-link">
          <div className="card">
            <div className="card-row">
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                  <span className={`badge ${c.status}`}>{c.status.replace('_', ' ')}</span>
                  {c.is_hotspot && <span className="badge hot">ward hotspot</span>}
                  {Number(c.duplicate_count) > 0 && (
                    <span className="badge plain">
                      +{c.duplicate_count} duplicate{Number(c.duplicate_count) > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{c.title}</div>
                <div className="meta" style={{ marginTop: 3 }}>
                  {c.ward_name} · {c.category_name}
                  {c.dept_name && <> · {c.dept_name}</>}
                  {' · '}filed {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </div>
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
