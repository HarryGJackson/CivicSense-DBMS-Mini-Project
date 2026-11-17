import { queryOne } from '../../../../lib/db';
import { verifyPassword, setSession, errorResponse } from '../../../../lib/auth';

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // staff_id and the department come along in one join, so the session
    // carries everything the role checks need
    const user = await queryOne(
      `SELECT u.user_id, u.name, u.email, u.password_hash, u.role,
              s.staff_id, s.dept_id, d.dept_name
         FROM users u
         LEFT JOIN staff s       ON s.user_id = u.user_id
         LEFT JOIN departments d ON d.dept_id = s.dept_id
        WHERE lower(u.email) = lower($1)`,
      [email]
    );

    // same message either way, so this cannot be used to discover which
    // email addresses are registered
    if (!user || !verifyPassword(password, user.password_hash)) {
      return Response.json({ error: 'Email or password is incorrect' }, { status: 401 });
    }

    setSession({
      user_id: user.user_id,
      name: user.name,
      role: user.role,
      staff_id: user.staff_id,
      dept_id: user.dept_id,
      dept_name: user.dept_name,
    });

    return Response.json({ ok: true, role: user.role });
  } catch (err) {
    return errorResponse(err);
  }
}
