import { query } from '../../../lib/db';
import { requireUser, errorResponse } from '../../../lib/auth';
import { embed, toVectorLiteral } from '../../../lib/embeddings';

// Relational paradigm: full-text search. Matches complaints that share WORDS
// with the search, using the GIN index idx_cmp_fts.
const KEYWORD_SQL = `
  SELECT c.complaint_id, c.title, w.ward_name, c.status,
         ROUND(ts_rank(to_tsvector('english', c.title || ' ' || c.description),
                       plainto_tsquery('english', $1))::NUMERIC, 4) AS score
    FROM complaints c
    JOIN wards w ON w.ward_id = c.ward_id
   WHERE to_tsvector('english', c.title || ' ' || c.description)
         @@ plainto_tsquery('english', $1)
   ORDER BY score DESC
   LIMIT 5`;

// Vector paradigm: nearest neighbours. Matches complaints that share MEANING
// with the search. <=> is cosine distance; the HNSW index answers the ORDER BY.
// Nearest-neighbour search always returns something, so results below 0.25
// similarity are dropped as unrelated. That cut-off is a tunable choice.
const VECTOR_SQL = `
  SELECT c.complaint_id, c.title, w.ward_name, c.status,
         ROUND((1 - (c.embedding <=> $1::vector))::NUMERIC, 4) AS score
    FROM complaints c
    JOIN wards w ON w.ward_id = c.ward_id
   WHERE c.embedding IS NOT NULL
     AND (1 - (c.embedding <=> $1::vector)) >= 0.25
   ORDER BY c.embedding <=> $1::vector
   LIMIT 5`;

/**
 * The same search text, answered twice: once by keywords, once by meaning.
 * This is the side-by-side that justifies having a vector database at all.
 */
export async function POST(request) {
  try {
    requireUser();
    const { q = '' } = await request.json();
    if (q.trim().length < 3) {
      return Response.json({ error: 'Type at least a few words' }, { status: 400 });
    }

    const keyword = await query(KEYWORD_SQL, [q]);

    const vector = await embed(q);
    const semantic = vector ? await query(VECTOR_SQL, [toVectorLiteral(vector)]) : null;

    return Response.json({
      keyword,
      semantic,                       // null when the model is not available
      sql: { keyword: KEYWORD_SQL, vector: VECTOR_SQL },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
