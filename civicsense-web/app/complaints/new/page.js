import { redirect } from 'next/navigation';
import { query } from '../../../lib/db';
import { getSession } from '../../../lib/auth';
import NewComplaintForm from './NewComplaintForm';

export const dynamic = 'force-dynamic';

export default async function NewComplaintPage() {
  const session = getSession();
  if (!session) redirect('/login');

  const [wards, categories] = await Promise.all([
    query('SELECT ward_id, ward_name, zone FROM wards ORDER BY ward_number'),
    query(`SELECT cc.category_id, cc.category_name, cc.sla_hours, d.dept_name
             FROM complaint_categories cc
             JOIN departments d ON d.dept_id = cc.default_dept_id
            ORDER BY cc.category_name`),
  ]);

  return <NewComplaintForm wards={wards} categories={categories} />;
}
