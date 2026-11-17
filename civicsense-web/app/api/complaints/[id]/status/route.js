import { transaction } from '../../../../../lib/db';
import { requireRole, assertCanActOnComplaint, errorResponse } from '../../../../../lib/auth';

const ALLOWED = ['OPEN', 'ROUTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

/**
 * Move a complaint along its lifecycle. Staff only, and only for complaints
 * routed to their own department — checked in assertCanActOnComplaint.
 *
 * Closing with a resolution writes two tables at once, so it runs in a
 * transaction: either both land or neither does.
 */
export async function POST(request, { params }) {
  try {
    const session = requireRole(['STAFF', 'ADMIN']);
    const id = Number(params.id);
    await assertCanActOnComplaint(session, id);

    const { status, resolution_text } = await request.json();
    if (!ALLOWED.includes(status)) {
      return Response.json({ error: `Status must be one of ${ALLOWED.join(', ')}` }, { status: 400 });
    }
    if (['RESOLVED', 'CLOSED'].includes(status) && !resolution_text?.trim()) {
      return Response.json({ error: 'Say how it was resolved before closing it' }, { status: 400 });
    }

    await transaction(async (client) => {
      // the status change itself; trigger trg_log_status writes the audit row
      await client.query(
        `UPDATE complaints
            SET status = $1,
                handled_by = COALESCE(handled_by, $2)
          WHERE complaint_id = $3`,
        [status, session.staff_id, id]
      );

      if (['RESOLVED', 'CLOSED'].includes(status)) {
        await client.query(
          `INSERT INTO resolutions (complaint_id, closed_by, resolution_text)
           VALUES ($1, $2, $3)
           ON CONFLICT (complaint_id) DO UPDATE
             SET resolution_text = EXCLUDED.resolution_text,
                 resolved_at     = CURRENT_TIMESTAMP`,
          [id, session.staff_id, resolution_text.trim()]
        );
      }
    });

    return Response.json({ ok: true, status });
  } catch (err) {
    // trigger trg_validate_resolution raises this if the officer is in the
    // wrong department or the dates do not line up
    if (err.code === 'P0001') {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err);
  }
}
