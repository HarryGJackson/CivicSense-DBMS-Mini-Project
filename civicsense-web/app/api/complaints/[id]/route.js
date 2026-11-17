import { queryOne, query } from '../../../../lib/db';
import { requireUser, errorResponse } from '../../../../lib/auth';
import { embed, toVectorLiteral } from '../../../../lib/embeddings';

/**
 * The person who filed a complaint may correct it or withdraw it, but only
 * while it is still OPEN — once staff have picked it up, the record stands.
 * An admin may do either at any time before it is closed.
 */
async function loadEditable(session, id) {
  const c = await queryOne(
    `SELECT complaint_id, filed_by, status,
            (SELECT COUNT(*) FROM complaints ch
              WHERE ch.parent_complaint_id = complaints.complaint_id) AS children
       FROM complaints WHERE complaint_id = $1`,
    [id]
  );
  if (!c) {
    const err = new Error('Complaint not found'); err.status = 404; throw err;
  }
  const isOwner = c.filed_by === session.user_id;
  if (!isOwner && session.role !== 'ADMIN') {
    const err = new Error('Only the person who filed this complaint can change it'); err.status = 403; throw err;
  }
  if (c.status !== 'OPEN') {
    const err = new Error(`This complaint is ${c.status.replace('_', ' ').toLowerCase()} and can no longer be changed`);
    err.status = 409; throw err;
  }
  return c;
}

/** PUT — correct the wording. The vector is recomputed from the new text. */
export async function PUT(request, { params }) {
  try {
    const session = requireUser();
    const id = Number(params.id);
    await loadEditable(session, id);

    const { title, description } = await request.json();
    if (!title?.trim() || !description?.trim()) {
      return Response.json({ error: 'Title and description are both required' }, { status: 400 });
    }

    // the old vector describes the old wording, so it must not survive the edit
    const vector = await embed(`${title}. ${description}`);

    try {
      await query(
        `UPDATE complaints
            SET title = $1, description = $2, embedding = $3::vector
          WHERE complaint_id = $4`,
        [title.trim(), description.trim(), vector ? toVectorLiteral(vector) : null, id]
      );
    } catch (dbErr) {
      if (dbErr.constraint === 'chk_cmp_desc') {
        return Response.json({ error: 'Description must be at least 15 characters' }, { status: 400 });
      }
      throw dbErr;
    }
    return Response.json({ ok: true, embedded: Boolean(vector) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE — withdraw it. Its history and endorsements go with it (ON DELETE CASCADE). */
export async function DELETE(request, { params }) {
  try {
    const session = requireUser();
    const id = Number(params.id);
    const c = await loadEditable(session, id);

    if (Number(c.children) > 0) {
      return Response.json(
        { error: 'Other complaints have been merged into this one, so it cannot be withdrawn' },
        { status: 409 }
      );
    }
    await query('DELETE FROM complaints WHERE complaint_id = $1', [id]);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
