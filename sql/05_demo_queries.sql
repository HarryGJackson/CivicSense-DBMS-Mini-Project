-- =====================================================================
-- CivicSense - File 05 : Demonstration queries
-- Run top to bottom during the viva. Each block is labelled with the
-- requirement it satisfies.
-- =====================================================================


-- =====================================================================
-- Q1. JOIN + aggregate : complaint load per ward
-- =====================================================================
SELECT w.ward_name,
       w.zone,
       COUNT(*)                                            AS total_complaints,
       COUNT(*) FILTER (WHERE c.parent_complaint_id IS NULL) AS distinct_issues,
       COUNT(*) FILTER (WHERE c.status = 'DUPLICATE')        AS merged_duplicates,
       ROUND(AVG(c.priority), 2)                             AS avg_priority
  FROM complaints c
  JOIN wards w ON w.ward_id = c.ward_id
 GROUP BY w.ward_name, w.zone
 ORDER BY total_complaints DESC, w.ward_name;


-- =====================================================================
-- Q2. GROUP BY + HAVING : categories that are genuinely problematic
-- =====================================================================
SELECT cc.category_name,
       d.dept_name,
       COUNT(*)                   AS open_issues,
       SUM(c.endorsement_count)   AS citizens_affected,
       MAX(c.priority)            AS peak_priority
  FROM complaints c
  JOIN complaint_categories cc ON cc.category_id = c.category_id
  JOIN departments d           ON d.dept_id      = cc.default_dept_id
 WHERE c.parent_complaint_id IS NULL
   AND c.status NOT IN ('RESOLVED','CLOSED')
 GROUP BY cc.category_name, d.dept_name
HAVING COUNT(*) >= 2
 ORDER BY citizens_affected DESC NULLS LAST;


-- =====================================================================
-- Q3. SUBQUERY : complaints endorsed more than the system-wide average
-- =====================================================================
SELECT c.complaint_id,
       c.title,
       c.endorsement_count,
       c.priority
  FROM complaints c
 WHERE c.parent_complaint_id IS NULL
   AND c.endorsement_count > (
        SELECT AVG(endorsement_count)
          FROM complaints
         WHERE parent_complaint_id IS NULL)
 ORDER BY c.endorsement_count DESC;


-- =====================================================================
-- Q3b. CORRELATED NOT EXISTS : open complaints nobody has endorsed yet
--      The inner query refers to c.complaint_id from the outer row, so it
--      is re-evaluated per complaint. NOT EXISTS stops at the first match.
-- =====================================================================
SELECT c.complaint_id,
       c.title,
       c.status
  FROM complaints c
 WHERE c.status = 'OPEN'
   AND NOT EXISTS (SELECT 1
                     FROM endorsements e
                    WHERE e.complaint_id = c.complaint_id)
 ORDER BY c.complaint_id;
-- Expected: #12, #14, #23


-- =====================================================================
-- Q4. RECURSIVE RELATIONSHIP : a parent complaint and everything
--     that got merged into it (self-join on complaints)
-- =====================================================================
SELECT p.complaint_id        AS parent_id,
       p.title               AS parent_title,
       ch.complaint_id       AS duplicate_id,
       ch.title              AS duplicate_title,
       ch.similarity_score,
       u.name                AS reported_by
  FROM complaints p
  JOIN complaints ch ON ch.parent_complaint_id = p.complaint_id
  JOIN users u       ON u.user_id = ch.filed_by
 ORDER BY p.complaint_id, ch.similarity_score DESC;


-- =====================================================================
-- Q4b. RECURSIVE CTE : walk a duplicate cluster to any depth
--      Complaint 3 was merged into 2, and 2 into 1, so the cluster is a
--      chain. A plain self-join only reaches one level; this reaches all.
-- =====================================================================
WITH RECURSIVE dup_chain AS (
        SELECT complaint_id, parent_complaint_id, title,
               0 AS depth, complaint_id::TEXT AS merge_path
          FROM complaints
         WHERE complaint_id = 1                -- the root of the cluster
    UNION ALL
        SELECT c.complaint_id, c.parent_complaint_id, c.title,
               d.depth + 1, d.merge_path || ' -> ' || c.complaint_id
          FROM dup_chain d
          JOIN complaints c ON c.parent_complaint_id = d.complaint_id
)
SELECT depth, complaint_id, LEFT(title, 40) AS title, merge_path
  FROM dup_chain
 ORDER BY depth, complaint_id;


-- =====================================================================
-- Q4c. CTE : two named sub-results, compared against each other
-- =====================================================================
WITH ward_load AS (
        SELECT ward_id,
               COUNT(*)               AS open_issues,
               SUM(endorsement_count) AS citizens_backing
          FROM complaints
         WHERE parent_complaint_id IS NULL
           AND status NOT IN ('RESOLVED','CLOSED')
         GROUP BY ward_id
),
city_average AS (
        SELECT ROUND(AVG(open_issues), 2) AS avg_open FROM ward_load
)
SELECT w.ward_name, w.zone, wl.open_issues, wl.citizens_backing,
       ca.avg_open AS city_average,
       CASE WHEN wl.open_issues > ca.avg_open THEN 'above city average'
            ELSE 'at or below' END AS standing
  FROM ward_load wl
  JOIN wards w ON w.ward_id = wl.ward_id
 CROSS JOIN city_average ca
 ORDER BY wl.open_issues DESC, w.ward_name;


-- =====================================================================
-- Q5. WEAK ENTITY : full audit trail of one complaint
--     seq_no is the partial key - unique only within this complaint
-- =====================================================================
SELECT h.seq_no,
       COALESCE(h.old_status, '(new)') AS from_status,
       h.new_status                    AS to_status,
       u.name                          AS changed_by,
       h.changed_at,
       h.remarks
  FROM complaint_status_history h
  LEFT JOIN users u ON u.user_id = h.changed_by
 WHERE h.complaint_id = 1
 ORDER BY h.seq_no;


-- =====================================================================
-- Q6. VIEWS in action
-- =====================================================================
SELECT * FROM v_department_workload ORDER BY total_assigned DESC;
SELECT * FROM v_ward_hotspots;
SELECT * FROM v_duplicate_clusters;
SELECT * FROM v_sla_breaches ORDER BY hours_overdue DESC;


-- =====================================================================
-- Q7. THE JUSTIFICATION SLIDE
--     Same input, two retrieval strategies: complaint #2's title,
--     "Damaged road surface by bus stand", looked up against every
--     other complaint.
--     Requires embeddings - run `npm run reset` (or `npm run embed`) first.
-- =====================================================================

-- 7a : KEYWORD search (PostgreSQL full-text, GIN index)
--      Complaint #1 is the same pothole but uses different words.
SELECT c.complaint_id,
       c.title,
       ts_rank(to_tsvector('english', c.title || ' ' || c.description),
               plainto_tsquery('english', 'Damaged road surface by bus stand')) AS rank
  FROM complaints c
 WHERE c.complaint_id <> 2
   AND to_tsvector('english', c.title || ' ' || c.description)
       @@ plainto_tsquery('english', 'Damaged road surface by bus stand')
 ORDER BY rank DESC;
-- Expected: few or no rows - #1 is missed. No shared vocabulary.

-- 7b : VECTOR search (pgvector, HNSW index, cosine similarity)
--      Same intent, expressed differently - and it is found.
SELECT c.complaint_id,
       c.title,
       ROUND((1 - (c.embedding <=> (
            SELECT embedding FROM complaints WHERE complaint_id = 2
       )))::NUMERIC, 4) AS cosine_similarity
  FROM complaints c
 WHERE c.complaint_id <> 2
   AND c.embedding IS NOT NULL
 ORDER BY c.embedding <=> (SELECT embedding FROM complaints WHERE complaint_id = 2)
 LIMIT 5;
-- Expected: complaint 1 (same pothole, ~0.52) in the top 3, found even
-- though 7a missed it. #14 also ranks high: a different pothole, similar meaning.


-- =====================================================================
-- Q8. STORED FUNCTION : duplicate candidates for a new complaint
-- =====================================================================
SELECT * FROM find_duplicate_candidates(3, 0.60, 5);


-- =====================================================================
-- Q9. INDEX PROOF : show the planner actually uses them
-- =====================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT complaint_id, title
  FROM complaints
 WHERE ward_id = 6 AND status = 'OPEN'
 ORDER BY created_at DESC;

EXPLAIN (ANALYZE)
SELECT complaint_id
  FROM complaints
 WHERE embedding IS NOT NULL
 ORDER BY embedding <=> (SELECT embedding FROM complaints WHERE complaint_id = 1)
 LIMIT 5;


-- =====================================================================
-- Q10. TRANSACTION + ROLLBACK demonstration
--      Shows atomicity: the merge either fully happens or not at all.
-- =====================================================================
BEGIN;
    SELECT complaint_id, status, parent_complaint_id
      FROM complaints WHERE complaint_id = 24;

    CALL merge_duplicate_complaint(24, 11, 0.7100, 24);

    SELECT complaint_id, status, parent_complaint_id
      FROM complaints WHERE complaint_id = 24;   -- now DUPLICATE of 11
ROLLBACK;

    SELECT complaint_id, status, parent_complaint_id
      FROM complaints WHERE complaint_id = 24;   -- back to original


-- =====================================================================
-- Q11. CONSTRAINT demonstrations - each of these MUST fail
-- =====================================================================
-- a complaint cannot be its own duplicate
-- UPDATE complaints SET parent_complaint_id = 1 WHERE complaint_id = 1;

-- priority is bounded 1..5
-- UPDATE complaints SET priority = 9 WHERE complaint_id = 1;

-- a citizen cannot endorse the same complaint twice (composite PK)
-- INSERT INTO endorsements (user_id, complaint_id) VALUES (4, 1);

-- status DUPLICATE and a null parent cannot coexist
-- UPDATE complaints SET status = 'DUPLICATE' WHERE complaint_id = 11;

-- role must be one of three values
-- INSERT INTO users (name,email,password_hash,role)
--   VALUES ('X','x@y.com','hash','MAYOR');
