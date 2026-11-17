-- =====================================================================
-- CivicSense - viva run sheet
-- Ten queries, in order, each one covering a line of the mark scheme.
-- Run top to bottom:   psql -d civicsense -f 00_run_demo.sql
-- =====================================================================

\echo '=== 1. DDL with constraints : what the planner actually enforces ==='
SELECT conname AS constraint_name, contype AS kind,
       pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'complaints'::regclass
 ORDER BY contype, conname;

\echo '=== 2. DML : every table holds at least 8 rows ==='
SELECT 'users' AS table_name, COUNT(*) FROM users
UNION ALL SELECT 'wards', COUNT(*) FROM wards
UNION ALL SELECT 'departments', COUNT(*) FROM departments
UNION ALL SELECT 'staff', COUNT(*) FROM staff
UNION ALL SELECT 'complaint_categories', COUNT(*) FROM complaint_categories
UNION ALL SELECT 'complaints', COUNT(*) FROM complaints
UNION ALL SELECT 'complaint_status_history', COUNT(*) FROM complaint_status_history
UNION ALL SELECT 'endorsements', COUNT(*) FROM endorsements
UNION ALL SELECT 'resolutions', COUNT(*) FROM resolutions
ORDER BY 1;

\echo '=== 3. JOIN across four tables ==='
SELECT c.complaint_id, LEFT(c.title,26) AS title, u.name AS filed_by,
       w.ward_name, cc.category_name, d.dept_name, c.status
  FROM complaints c
  JOIN users u                 ON u.user_id      = c.filed_by
  JOIN wards w                 ON w.ward_id      = c.ward_id
  JOIN complaint_categories cc ON cc.category_id = c.category_id
  LEFT JOIN departments d      ON d.dept_id      = c.routed_dept_id
 WHERE c.parent_complaint_id IS NULL
 ORDER BY c.complaint_id LIMIT 8;

\echo '=== 4. NESTED subquery : endorsed above the system-wide average ==='
SELECT complaint_id, LEFT(title,36) AS title, endorsement_count, priority
  FROM complaints
 WHERE parent_complaint_id IS NULL
   AND endorsement_count > (SELECT AVG(endorsement_count)
                              FROM complaints WHERE parent_complaint_id IS NULL)
 ORDER BY endorsement_count DESC;

\echo '=== 5. CORRELATED subquery : newest complaint in each ward ==='
SELECT c.complaint_id, w.ward_name, LEFT(c.title,32) AS title, c.created_at
  FROM complaints c JOIN wards w ON w.ward_id = c.ward_id
 WHERE c.created_at = (SELECT MAX(c2.created_at) FROM complaints c2
                        WHERE c2.ward_id = c.ward_id)
 ORDER BY w.ward_name LIMIT 6;

\echo '=== 6. RECURSIVE CTE : walk a duplicate cluster to any depth ==='
WITH RECURSIVE dup_chain AS (
        SELECT complaint_id, parent_complaint_id, title,
               0 AS depth, complaint_id::TEXT AS merge_path
          FROM complaints WHERE complaint_id = 1
    UNION ALL
        SELECT c.complaint_id, c.parent_complaint_id, c.title,
               d.depth + 1, d.merge_path || ' -> ' || c.complaint_id
          FROM dup_chain d
          JOIN complaints c ON c.parent_complaint_id = d.complaint_id
)
SELECT depth, complaint_id, LEFT(title,40) AS title, merge_path
  FROM dup_chain ORDER BY depth, complaint_id;

\echo '=== 7. CTE : two named sub-results compared against each other ==='
WITH ward_load AS (
        SELECT ward_id, COUNT(*) AS open_issues,
               SUM(endorsement_count) AS citizens_backing
          FROM complaints
         WHERE parent_complaint_id IS NULL
           AND status NOT IN ('RESOLVED','CLOSED')
         GROUP BY ward_id
),
city_average AS (
        SELECT ROUND(AVG(open_issues),2) AS avg_open FROM ward_load
)
SELECT w.ward_name, w.zone, wl.open_issues, wl.citizens_backing,
       ca.avg_open AS city_average,
       CASE WHEN wl.open_issues > ca.avg_open THEN 'above city average'
            ELSE 'at or below' END AS standing
  FROM ward_load wl
  JOIN wards w ON w.ward_id = wl.ward_id
 CROSS JOIN city_average ca
 ORDER BY wl.open_issues DESC, w.ward_name;

\echo '=== 8. TRIGGER : audit rows nobody inserted by hand ==='
SELECT seq_no, COALESCE(old_status,'(new)') AS from_status, new_status,
       LEFT(remarks,38) AS remarks
  FROM complaint_status_history WHERE complaint_id = 1 ORDER BY seq_no;

\echo '=== 9. PROCEDURE inside a TRANSACTION, then rolled back ==='
BEGIN;
  SELECT complaint_id, status, parent_complaint_id FROM complaints WHERE complaint_id = 24;
  CALL merge_duplicate_complaint(24, 11, 0.7100, 24);
  SELECT complaint_id, status, parent_complaint_id, 'inside txn' AS stage
    FROM complaints WHERE complaint_id = 24;
ROLLBACK;
SELECT complaint_id, status, parent_complaint_id, 'after rollback' AS stage
  FROM complaints WHERE complaint_id = 24;

\echo '=== 10. VIEWS : the three dashboard views ==='
SELECT * FROM v_duplicate_clusters;
SELECT * FROM v_ward_hotspots;
SELECT dept_name, total_assigned, pending, in_progress, completed,
       avg_resolution_hours FROM v_department_workload ORDER BY total_assigned DESC;

-- =====================================================================
-- 11. VECTOR SEARCH - needs embeddings. Run this first, from civicsense-web/:
--       npm install
--       npm run embed      (npm run reset also does this)
--     Until then complaints.embedding is NULL and these return nothing.
-- =====================================================================
\echo '=== 11. Vector : how many complaints currently carry an embedding ==='
SELECT COUNT(embedding) AS embedded, COUNT(*) AS total FROM complaints;

\echo '=== 11a. KEYWORD search - the baseline that fails ==='
SELECT complaint_id, LEFT(title,40) AS title
  FROM complaints
 WHERE to_tsvector('english', title || ' ' || description)
       @@ plainto_tsquery('english', 'crater beside the bus stand autos tipping');

\echo '=== 11b. VECTOR search - same intent, found anyway ==='
SELECT c.complaint_id, LEFT(c.title,40) AS title,
       ROUND((1 - (c.embedding <=> (SELECT embedding FROM complaints
                                     WHERE complaint_id = 2)))::NUMERIC, 4) AS similarity
  FROM complaints c
 WHERE c.complaint_id <> 2 AND c.embedding IS NOT NULL
 ORDER BY c.embedding <=> (SELECT embedding FROM complaints WHERE complaint_id = 2)
 LIMIT 5;

\echo '=== 11c. Stored function wrapping the vector query ==='
SELECT * FROM find_duplicate_candidates(3, 0.60, 5);
