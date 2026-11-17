import { queryOne } from '../../../../lib/db';
import { hashPassword, setSession, errorResponse } from '../../../../lib/auth';

export async function POST(request) {
  try {
    const { name, email, phone, password } = await request.json();

    if (!name || !email || !password) {
      return Response.json({ error: 'Name, email and password are required' }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Registration only ever creates a CITIZEN. Staff and admin accounts are
    // made by an administrator directly in the database, so nobody can give
    // themselves a privileged role by posting a different value here.
    const hash = hashPassword(password);

    let user;
    try {
      user = await queryOne(
        `INSERT INTO users (name, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, 'CITIZEN')
         RETURNING user_id, name, role`,
        [name.trim(), email.trim().toLowerCase(), phone?.trim() || null, hash]
      );
    } catch (dbErr) {
      // the database has the final say on what is valid; turn its named
      // constraints into messages a person can act on
      if (dbErr.constraint === 'uq_users_email') {
        return Response.json({ error: 'That email is already registered' }, { status: 409 });
      }
      if (dbErr.constraint === 'chk_users_phone') {
        return Response.json({ error: 'Phone must be 10 digits starting 6-9' }, { status: 400 });
      }
      if (dbErr.constraint === 'chk_users_email') {
        return Response.json({ error: 'That does not look like an email address' }, { status: 400 });
      }
      throw dbErr;
    }

    setSession({
      user_id: user.user_id,
      name: user.name,
      role: user.role,
      staff_id: null,
      dept_id: null,
      dept_name: null,
    });

    return Response.json({ ok: true, role: user.role });
  } catch (err) {
    return errorResponse(err);
  }
}
