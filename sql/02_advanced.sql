-- =====================================================================
-- CivicSense - File 02 : Advanced database features
-- Triggers, stored functions, views
-- =====================================================================

-- =====================================================================
-- A. TRIGGER 1 - audit trail into the weak entity
--    Every status change writes a row into complaint_status_history.
--    seq_no is the partial key, generated per complaint.
--
--    Who made the change: a trigger cannot see the logged-in user, so
--    the caller states it with
--        SELECT set_config('civicsense.actor_id', '<user_id>', true);
--    inside the same transaction (the web app and the merge procedure
--    both do this). If nobody set it:
--      INSERT -> the citizen who filed the complaint
--      UPDATE -> the user behind the assigned officer (handled_by)
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_log_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_next_seq INTEGER;
    v_actor    INTEGER;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;                      -- nothing to log
    END IF;

    v_actor := NULLIF(current_setting('civicsense.actor_id', true), '')::INTEGER;
    IF v_actor IS NULL THEN
        IF TG_OP = 'INSERT' THEN
            v_actor := NEW.filed_by;
        ELSE
            SELECT user_id INTO v_actor FROM staff WHERE staff_id = NEW.handled_by;
        END IF;
    END IF;

    SELECT COALESCE(MAX(seq_no), 0) + 1
      INTO v_next_seq
      FROM complaint_status_history
     WHERE complaint_id = NEW.complaint_id;

    INSERT INTO complaint_status_history
           (complaint_id, seq_no, old_status, new_status, changed_by, remarks)
    VALUES (NEW.complaint_id,
            v_next_seq,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
            NEW.status,
            v_actor,
            CASE WHEN TG_OP = 'INSERT' THEN 'Complaint registered'
                 ELSE 'Status changed to ' || NEW.status END);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_status
    AFTER INSERT OR UPDATE OF status ON complaints
    FOR EACH ROW EXECUTE FUNCTION fn_log_status_change();


-- =====================================================================
-- B. TRIGGER 2 - SLA deadline is a derived attribute
--    sla_deadline = created_at + category.sla_hours
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_set_sla_deadline()
RETURNS TRIGGER AS $$
DECLARE
    v_hours INTEGER;
BEGIN
    SELECT sla_hours INTO v_hours
      FROM complaint_categories
     WHERE category_id = NEW.category_id;

    NEW.sla_deadline := NEW.created_at + (v_hours || ' hours')::INTERVAL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sla_deadline
    BEFORE INSERT ON complaints
    FOR EACH ROW EXECUTE FUNCTION fn_set_sla_deadline();


-- =====================================================================
-- C. TRIGGER 3 - SIGNAL 1 : endorsement-driven escalation
--    endorsement_count is a materialised derived attribute.
--    Priority rises as more citizens endorse the same complaint.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_sync_endorsement_count()
RETURNS TRIGGER AS $$
DECLARE
    v_cmp   INTEGER := COALESCE(NEW.complaint_id, OLD.complaint_id);
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
      FROM endorsements
     WHERE complaint_id = v_cmp;

    UPDATE complaints
       SET endorsement_count = v_count,
           priority = GREATEST(
                        priority,
                        CASE WHEN v_count >= 15 THEN 5
                             WHEN v_count >= 8  THEN 4
                             WHEN v_count >= 3  THEN 3
                             ELSE 1 END)
     WHERE complaint_id = v_cmp;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_endorse_count
    AFTER INSERT OR DELETE ON endorsements
    FOR EACH ROW EXECUTE FUNCTION fn_sync_endorsement_count();


-- =====================================================================
-- D. TRIGGER 4 - SIGNAL 2 : area-density escalation
--    Counts DISTINCT PARENT complaints of the same category in the same
--    ward inside the category's time window. Merged duplicates are
--    excluded on purpose: density means "many separate problems here",
--    not "one loud problem".
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_check_area_density()
RETURNS TRIGGER AS $$
DECLARE
    v_window   INTEGER;
    v_threshold INTEGER;
    v_count    INTEGER;
BEGIN
    SELECT density_window_days, density_threshold
      INTO v_window, v_threshold
      FROM complaint_categories
     WHERE category_id = NEW.category_id;

    SELECT COUNT(*) INTO v_count
      FROM complaints
     WHERE ward_id     = NEW.ward_id
       AND category_id = NEW.category_id
       AND parent_complaint_id IS NULL                 -- parents only
       AND status NOT IN ('RESOLVED','CLOSED','DUPLICATE')
       AND created_at >= NEW.created_at - (v_window || ' days')::INTERVAL;

    IF v_count >= v_threshold THEN
        UPDATE complaints
           SET is_hotspot = TRUE,
               priority   = GREATEST(priority, 3)      -- satisfies chk_cmp_hotspot_priority
         WHERE ward_id     = NEW.ward_id
           AND category_id = NEW.category_id
           AND parent_complaint_id IS NULL
           AND status NOT IN ('RESOLVED','CLOSED','DUPLICATE')
           AND created_at >= NEW.created_at - (v_window || ' days')::INTERVAL;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_area_density
    AFTER INSERT ON complaints
    FOR EACH ROW EXECUTE FUNCTION fn_check_area_density();


-- =====================================================================
-- D2. TRIGGER 5 - cross-table validation (requirement 12)
--     A CHECK constraint cannot reference another table, so this rule
--     is enforced by a trigger: a complaint cannot be resolved before
--     it was filed, and the closing officer must belong to the
--     department the complaint was routed to.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_validate_resolution()
RETURNS TRIGGER AS $$
DECLARE
    v_created   TIMESTAMP;
    v_routed    INTEGER;
    v_staffdept INTEGER;
BEGIN
    SELECT created_at, routed_dept_id
      INTO v_created, v_routed
      FROM complaints
     WHERE complaint_id = NEW.complaint_id;

    IF NEW.resolved_at < v_created THEN
        RAISE EXCEPTION
          'Resolution time (%) precedes the complaint filing time (%) for complaint %',
          NEW.resolved_at, v_created, NEW.complaint_id;
    END IF;

    SELECT dept_id INTO v_staffdept FROM staff WHERE staff_id = NEW.closed_by;

    IF v_routed IS NOT NULL AND v_staffdept <> v_routed THEN
        RAISE EXCEPTION
          'Staff % belongs to department %, but complaint % is routed to department %',
          NEW.closed_by, v_staffdept, NEW.complaint_id, v_routed;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_resolution
    BEFORE INSERT OR UPDATE ON resolutions
    FOR EACH ROW EXECUTE FUNCTION fn_validate_resolution();


-- =====================================================================
-- E. STORED FUNCTION - duplicate candidate search (vector similarity)
--    Returns open complaints in the same ward ranked by cosine
--    similarity.  <=> is pgvector's cosine DISTANCE, so similarity
--    is 1 - distance.
-- =====================================================================
CREATE OR REPLACE FUNCTION find_duplicate_candidates(
    p_complaint_id INTEGER,
    p_threshold    NUMERIC DEFAULT 0.65,
    p_limit        INTEGER DEFAULT 5)
RETURNS TABLE (
    candidate_id    INTEGER,
    candidate_title VARCHAR(150),
    similarity      NUMERIC,
    filed_on        TIMESTAMP,
    endorsements    INTEGER)
AS $$
BEGIN
    RETURN QUERY
    SELECT c.complaint_id,
           c.title,
           ROUND((1 - (c.embedding <=> src.embedding))::NUMERIC, 4),
           c.created_at,
           c.endorsement_count
      FROM complaints c
      CROSS JOIN (SELECT embedding, ward_id
                    FROM complaints
                   WHERE complaint_id = p_complaint_id) src
     WHERE c.complaint_id <> p_complaint_id
       AND c.ward_id = src.ward_id
       AND c.parent_complaint_id IS NULL
       AND c.status IN ('OPEN','ROUTED','IN_PROGRESS')
       AND c.embedding IS NOT NULL
       AND (1 - (c.embedding <=> src.embedding)) >= p_threshold
     ORDER BY c.embedding <=> src.embedding
     LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- F. STORED PROCEDURE - merge a duplicate (TRANSACTION)
--    All four writes succeed together or none do.
-- =====================================================================
CREATE OR REPLACE PROCEDURE merge_duplicate_complaint(
    p_child_id  INTEGER,
    p_parent_id INTEGER,
    p_score     NUMERIC,
    p_actor_id  INTEGER)
AS $$
DECLARE
    v_filed_by INTEGER;
BEGIN
    IF p_child_id = p_parent_id THEN
        RAISE EXCEPTION 'A complaint cannot be a duplicate of itself (id %)', p_child_id;
    END IF;

    SELECT filed_by INTO v_filed_by FROM complaints WHERE complaint_id = p_child_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Child complaint % does not exist', p_child_id;
    END IF;

    -- tell trg_log_status who is merging (local to this transaction)
    PERFORM set_config('civicsense.actor_id', p_actor_id::TEXT, true);

    -- 1. point the child at its parent (trigger logs the status change)
    UPDATE complaints
       SET parent_complaint_id = p_parent_id,
           similarity_score    = p_score,
           status              = 'DUPLICATE'
     WHERE complaint_id = p_child_id;

    -- 2. the citizen who filed the duplicate now endorses the parent
    INSERT INTO endorsements (user_id, complaint_id, comment)
    VALUES (v_filed_by, p_parent_id, 'Merged from complaint #' || p_child_id)
    ON CONFLICT (user_id, complaint_id) DO NOTHING;

    -- 3. record the merge against the parent's audit trail
    INSERT INTO complaint_status_history
           (complaint_id, seq_no, old_status, new_status, changed_by, remarks)
    SELECT p_parent_id,
           COALESCE(MAX(seq_no), 0) + 1,
           NULL,
           (SELECT status FROM complaints WHERE complaint_id = p_parent_id),
           p_actor_id,
           'Absorbed duplicate #' || p_child_id || ' (sim ' || p_score || ')'
      FROM complaint_status_history
     WHERE complaint_id = p_parent_id;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- G. VIEWS
-- =====================================================================

-- V1 : SLA breaches
CREATE OR REPLACE VIEW v_sla_breaches AS
SELECT c.complaint_id,
       c.title,
       w.ward_name,
       cc.category_name,
       d.dept_name,
       c.priority,
       c.sla_deadline,
       ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.sla_deadline)) / 3600, 1)
           AS hours_overdue
  FROM complaints c
  JOIN wards w                 ON w.ward_id  = c.ward_id
  JOIN complaint_categories cc ON cc.category_id = c.category_id
  LEFT JOIN departments d      ON d.dept_id  = c.routed_dept_id
 WHERE c.status NOT IN ('RESOLVED','CLOSED','DUPLICATE')
   AND c.sla_deadline < CURRENT_TIMESTAMP;

-- V2 : department workload
CREATE OR REPLACE VIEW v_department_workload AS
SELECT d.dept_id,
       d.dept_name,
       COUNT(c.complaint_id)                                        AS total_assigned,
       COUNT(*) FILTER (WHERE c.status IN ('OPEN','ROUTED'))         AS pending,
       COUNT(*) FILTER (WHERE c.status = 'IN_PROGRESS')              AS in_progress,
       COUNT(*) FILTER (WHERE c.status IN ('RESOLVED','CLOSED'))     AS completed,
       ROUND(AVG(c.priority), 2)                                     AS avg_priority,
       ROUND(AVG(EXTRACT(EPOCH FROM (r.resolved_at - c.created_at)) / 3600)
             FILTER (WHERE r.resolved_at IS NOT NULL), 1)            AS avg_resolution_hours
  FROM departments d
  LEFT JOIN complaints  c ON c.routed_dept_id = d.dept_id
                         AND c.parent_complaint_id IS NULL
  LEFT JOIN resolutions r ON r.complaint_id   = c.complaint_id
 GROUP BY d.dept_id, d.dept_name;

-- V3 : ward hotspots (GROUP BY + HAVING)
CREATE OR REPLACE VIEW v_ward_hotspots AS
SELECT w.ward_id,
       w.ward_name,
       w.zone,
       cc.category_name,
       COUNT(*)                        AS distinct_issues,
       SUM(c.endorsement_count)        AS total_endorsements,
       MAX(c.priority)                 AS peak_priority,
       BOOL_OR(c.is_hotspot)           AS flagged_hotspot
  FROM complaints c
  JOIN wards w                 ON w.ward_id     = c.ward_id
  JOIN complaint_categories cc ON cc.category_id = c.category_id
 WHERE c.parent_complaint_id IS NULL
   AND c.status NOT IN ('RESOLVED','CLOSED')
 GROUP BY w.ward_id, w.ward_name, w.zone, cc.category_name
HAVING COUNT(*) >= 2
 ORDER BY distinct_issues DESC, total_endorsements DESC;

-- V4 : duplicate clusters, resolved with a RECURSIVE CTE
--      A complaint can be merged into another complaint that was itself
--      merged, so a cluster is a tree rather than one flat level. The
--      recursive term walks the whole tree from each root.
CREATE OR REPLACE VIEW v_duplicate_clusters AS
WITH RECURSIVE cluster AS (
        -- anchor: every complaint that is not itself a duplicate
        SELECT complaint_id AS root_id,
               complaint_id,
               0            AS depth,
               similarity_score
          FROM complaints
         WHERE parent_complaint_id IS NULL
    UNION ALL
        -- recursive term: anything merged into a member of the cluster
        SELECT cl.root_id,
               ch.complaint_id,
               cl.depth + 1,
               ch.similarity_score
          FROM cluster cl
          JOIN complaints ch ON ch.parent_complaint_id = cl.complaint_id
)
SELECT p.complaint_id                                   AS parent_id,
       LEFT(p.title, 38)                                AS parent_title,
       w.ward_name,
       COUNT(*) FILTER (WHERE cl.depth > 0)             AS duplicate_count,
       MAX(cl.depth)                                    AS chain_depth,
       ROUND(AVG(cl.similarity_score)
             FILTER (WHERE cl.depth > 0), 4)            AS avg_similarity,
       p.endorsement_count,
       p.priority
  FROM cluster cl
  JOIN complaints p ON p.complaint_id = cl.root_id
  JOIN wards w      ON w.ward_id      = p.ward_id
 GROUP BY p.complaint_id, p.title, w.ward_name, p.endorsement_count, p.priority
HAVING COUNT(*) FILTER (WHERE cl.depth > 0) > 0
 ORDER BY duplicate_count DESC, parent_id;
