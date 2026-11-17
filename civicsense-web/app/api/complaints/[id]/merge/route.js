import { query } from '../../../../../lib/db';
import { requireRole, assertCanActOnComplaint, errorResponse } from '../../../../../lib/auth';

/**
 * Confirm that this complaint is a duplicate of another and merge it.
 *
 * All the work is done by the stored procedure merge_duplicate_complaint,
 * which in one transaction: points the child at its parent, records the
 * citizen as endorsing the parent instead, and writes the merge into the
 * parent's audit trail. Keeping it in the database means the same rules apply
 * however the merge is triggered, not only through this screen.
 *
 * A human confirms every merge. The system only ever proposes.
 */
export async function POST(request, { params }) {
  try {
    const session = requireRole(['STAFF', 'ADMIN']);
    const childId = Number(params.id);
    const { parent_id, similarity } = await request.json();

    if (!parent_id) {
      return Response.json({ error: 'Which complaint is it a duplicate of?' }, { status: 400 });
    }
    if (Number(parent_id) === childId) {
      return Response.json({ error: 'A complaint cannot be a duplicate of itself' }, { status: 400 });
    }
    await assertCanActOnComplaint(session, childId);

    await query('CALL merge_duplicate_complaint($1, $2, $3, $4)', [
      childId,
      Number(parent_id),
      similarity != null ? Number(similarity) : null,
      session.user_id,
    ]);

    return Response.json({ ok: true, merged_into: Number(parent_id) });
  } catch (err) {
    if (err.code === 'P0001') {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err);
  }
}
