/**
 * Authentication and role-based access control.
 *
 * Passwords are stored as bcrypt hashes, never plain text.
 * The session is a cookie holding the user's id, name and role, signed with
 * an HMAC so the browser cannot edit it — change one character of the payload
 * and the signature no longer matches, so the session is rejected.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { queryOne } from './db';

const COOKIE = 'civicsense_session';
const SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
const MAX_AGE = 60 * 60 * 8; // eight hours

// ---------------------------------------------------------------- passwords

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

// ----------------------------------------------------------------- sessions

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function unsign(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  // timing-safe compare, so the signature cannot be guessed byte by byte
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function setSession(user) {
  cookies().set(COOKIE, sign({ ...user, exp: Date.now() + MAX_AGE * 1000 }), {
    httpOnly: true,         // JavaScript in the page cannot read it
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}

/** The signed-in user, or null. Safe to call from any server component. */
export function getSession() {
  return unsign(cookies().get(COOKIE)?.value);
}

// --------------------------------------------------------------------- RBAC

/**
 * Three roles, enforced in two places:
 *   - the database refuses any role outside CITIZEN / STAFF / ADMIN
 *     (CHECK constraint chk_users_role)
 *   - every API route that changes something calls requireRole below
 */
export const ROLES = ['CITIZEN', 'STAFF', 'ADMIN'];

export function requireUser() {
  const session = getSession();
  if (!session) {
    const err = new Error('Not signed in');
    err.status = 401;
    throw err;
  }
  return session;
}

export function requireRole(allowed) {
  const session = requireUser();
  if (!allowed.includes(session.role)) {
    const err = new Error(`This action needs one of: ${allowed.join(', ')}`);
    err.status = 403;
    throw err;
  }
  return session;
}

/**
 * Staff are scoped to their own department: a Roads officer cannot touch a
 * Water complaint. Admins are not scoped.
 */
export async function assertCanActOnComplaint(session, complaintId) {
  if (session.role === 'ADMIN') return true;
  if (session.role !== 'STAFF') {
    const err = new Error('Only staff can act on complaints');
    err.status = 403;
    throw err;
  }
  const row = await queryOne(
    `SELECT c.routed_dept_id, s.dept_id AS staff_dept
       FROM complaints c
       CROSS JOIN staff s
      WHERE c.complaint_id = $1 AND s.staff_id = $2`,
    [complaintId, session.staff_id]
  );
  if (!row) {
    const err = new Error('Complaint or staff profile not found');
    err.status = 404;
    throw err;
  }
  if (row.routed_dept_id !== null && row.routed_dept_id !== row.staff_dept) {
    const err = new Error('This complaint belongs to another department');
    err.status = 403;
    throw err;
  }
  return true;
}

/** Turn a thrown error into a JSON response with the right status code. */
export function errorResponse(err) {
  const status = err.status || 500;
  const message = status === 500 ? 'Something went wrong' : err.message;
  if (status === 500) console.error(err);
  return Response.json({ error: message }, { status });
}
