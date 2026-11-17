import { queryOne } from '../../../lib/db';
import { requireUser, errorResponse } from '../../../lib/auth';
import { embed, toVectorLiteral } from '../../../lib/embeddings';

/**
 * POST /api/complaints — file a new complaint.
 *
 * One INSERT. Everything else that happens to the new row is the database's
 * doing: the SLA deadline, the first audit-trail entry and the ward hotspot
 * check are all triggers.
 */
export async function POST(request) {
  try {
    const session = requireUser();
    const { title, description, ward_id, category_id } = await request.json();

    if (!title || !description || !ward_id || !category_id) {
      return Response.json({ error: 'Title, description, ward and category are all required' }, { status: 400 });
    }

    // the handling department comes from the category's default
    const category = await queryOne(
      `SELECT default_dept_id FROM complaint_categories WHERE category_id = $1`,
      [category_id]
    );
    if (!category) {
      return Response.json({ error: 'Unknown category' }, { status: 400 });
    }

    // turn the text into a vector now, so later complaints can be matched to it
    const vector = await embed(`${title}. ${description}`);

    try {
      const row = await queryOne(
        `INSERT INTO complaints
           (title, description, filed_by, ward_id, category_id, routed_dept_id, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
         RETURNING complaint_id`,
        [
          title.trim(), description.trim(), session.user_id,
          ward_id, category_id, category.default_dept_id,
          vector ? toVectorLiteral(vector) : null,
        ]
      );
      return Response.json({ ok: true, complaint_id: row.complaint_id, embedded: Boolean(vector) });
    } catch (dbErr) {
      if (dbErr.constraint === 'chk_cmp_desc') {
        return Response.json({ error: 'Description must be at least 15 characters' }, { status: 400 });
      }
      throw dbErr;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
