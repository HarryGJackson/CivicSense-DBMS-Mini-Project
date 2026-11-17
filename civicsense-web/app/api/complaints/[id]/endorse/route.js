import { query, queryOne } from '../../../../../lib/db';
import { requireUser, errorResponse } from '../../../../../lib/auth';

/**
 * "I have this problem too."
 *
 * Only one row is inserted. The endorsement count and the complaint's
 * priority are both updated by trigger trg_endorse_count, not by this code —
 * so the numbers stay right no matter what inserts the endorsement.
 */
export async function POST(request, { params }) {
  try {
    const session = requireUser();
    const id = Number(params.id);
    const { comment } = await request.json().catch(() => ({}));

    const target = await queryOne('SELECT status FROM complaints WHERE complaint_id = $1', [id]);
    if (!target) {
      return Response.json({ error: 'Complaint not found' }, { status: 404 });
    }
    if (!['OPEN', 'ROUTED', 'IN_PROGRESS'].includes(target.status)) {
      return Response.json({ error: 'This complaint is no longer open, so it cannot be endorsed' }, { status: 409 });
    }

    try {
      await query(
        `INSERT INTO endorsements (user_id, complaint_id, comment) VALUES ($1, $2, $3)`,
        [session.user_id, id, comment?.trim() || null]
      );
    } catch (dbErr) {
      // composite primary key (user_id, complaint_id) stops double voting
      if (dbErr.constraint === 'pk_endorse') {
        return Response.json({ error: 'You have already endorsed this complaint' }, { status: 409 });
      }
      throw dbErr;
    }

    const [row] = await query(
      `SELECT endorsement_count, priority FROM complaints WHERE complaint_id = $1`,
      [id]
    );
    return Response.json({ ok: true, ...row });
  } catch (err) {
    return errorResponse(err);
  }
}
