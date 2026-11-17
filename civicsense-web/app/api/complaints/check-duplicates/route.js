import { query } from '../../../../lib/db';
import { requireUser, errorResponse } from '../../../../lib/auth';
import { embed, toVectorLiteral } from '../../../../lib/embeddings';

// How alike two complaints must be before one is offered as a possible
// duplicate. 1.0 = identical meaning. A tunable choice, not a law.
const DUPLICATE_THRESHOLD = 0.55;

/**
 * Before a complaint is created, look for one already open that describes the
 * same problem.
 *
 * Vector path:    embed the text, rank open complaints in the same ward by
 *                 cosine similarity. Finds matches that share no words.
 * Fallback path:  PostgreSQL full-text search, used only when the embedding
 *                 model is unavailable. Finds matches that share words.
 *
 * The response says which path ran, so the difference between the two is
 * visible in the interface rather than hidden.
 */
export async function POST(request) {
  try {
    requireUser();
    const { title = '', description = '', ward_id } = await request.json();

    const text = `${title}. ${description}`.trim();
    if (text.length < 20 || !ward_id) {
      return Response.json({ method: 'none', candidates: [] });
    }

    const vector = await embed(text);

    if (vector) {
      // <=> is pgvector's cosine distance, so similarity is 1 - distance.
      // ORDER BY on that operator is what lets the HNSW index be used.
      const rows = await query(
        `SELECT c.complaint_id,
                c.title,
                c.status,
                c.endorsement_count,
                c.created_at,
                u.name AS filed_by,
                ROUND((1 - (c.embedding <=> $1::vector))::NUMERIC, 4) AS similarity
           FROM complaints c
           JOIN users u ON u.user_id = c.filed_by
          WHERE c.ward_id = $2
            AND c.parent_complaint_id IS NULL
            AND c.status IN ('OPEN','ROUTED','IN_PROGRESS')
            AND c.embedding IS NOT NULL
            AND (1 - (c.embedding <=> $1::vector)) >= $3
          ORDER BY c.embedding <=> $1::vector
          LIMIT 5`,
        [toVectorLiteral(vector), ward_id, DUPLICATE_THRESHOLD]
      );
      return Response.json({ method: 'vector', candidates: rows });
    }

    // ---- fallback: keyword matching only
    const rows = await query(
      `SELECT c.complaint_id,
              c.title,
              c.status,
              c.endorsement_count,
              c.created_at,
              u.name AS filed_by,
              ROUND(ts_rank(to_tsvector('english', c.title || ' ' || c.description),
                            plainto_tsquery('english', $1))::NUMERIC, 4) AS similarity
         FROM complaints c
         JOIN users u ON u.user_id = c.filed_by
        WHERE c.ward_id = $2
          AND c.parent_complaint_id IS NULL
          AND c.status IN ('OPEN','ROUTED','IN_PROGRESS')
          AND to_tsvector('english', c.title || ' ' || c.description)
              @@ plainto_tsquery('english', $1)
        ORDER BY similarity DESC
        LIMIT 5`,
      [text, ward_id]
    );
    return Response.json({ method: 'fulltext', candidates: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
