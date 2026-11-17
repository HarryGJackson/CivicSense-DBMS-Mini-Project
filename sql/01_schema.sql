-- =====================================================================
-- CivicSense : Semantic Complaint Routing and Duplicate Detection System
-- DBMS Experiential Learning - Level 3 Project
-- File 01 : DDL - schema, constraints, indexes
-- Engine   : PostgreSQL 16 + pgvector
-- =====================================================================
-- Run with:  psql -U postgres -d civicsense -f 01_schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;     -- vector data type + HNSW index
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram support for text search

-- Clean rebuild (DROP demonstration - requirement 5)
DROP TABLE IF EXISTS endorsements            CASCADE;
DROP TABLE IF EXISTS complaint_status_history CASCADE;
DROP TABLE IF EXISTS resolutions             CASCADE;
DROP TABLE IF EXISTS complaints              CASCADE;
DROP TABLE IF EXISTS complaint_categories    CASCADE;
DROP TABLE IF EXISTS staff                   CASCADE;
DROP TABLE IF EXISTS departments             CASCADE;
DROP TABLE IF EXISTS wards                   CASCADE;
DROP TABLE IF EXISTS users                   CASCADE;


-- ---------------------------------------------------------------------
-- 1. USERS         (strong entity)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id        SERIAL        PRIMARY KEY,
    name           VARCHAR(100)  NOT NULL,
    email          VARCHAR(150)  NOT NULL,
    phone          CHAR(10),
    password_hash  VARCHAR(255)  NOT NULL,
    role           VARCHAR(20)   NOT NULL DEFAULT 'CITIZEN',
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_email   UNIQUE (email),
    CONSTRAINT chk_users_role   CHECK (role IN ('CITIZEN','STAFF','ADMIN')),
    CONSTRAINT chk_users_email  CHECK (email LIKE '%@%.%'),
    CONSTRAINT chk_users_phone  CHECK (phone IS NULL OR phone ~ '^[6-9][0-9]{9}$')
);

COMMENT ON TABLE  users IS 'All system actors. Citizens, staff and admins share one login table.';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash - plain text passwords are never stored (requirement 13).';


-- ---------------------------------------------------------------------
-- 2. WARDS         (strong entity)
-- ---------------------------------------------------------------------
CREATE TABLE wards (
    ward_id      SERIAL       PRIMARY KEY,
    ward_number  INTEGER      NOT NULL,
    ward_name    VARCHAR(100) NOT NULL,
    zone         VARCHAR(50)  NOT NULL,

    CONSTRAINT uq_wards_number CHECK (ward_number > 0),
    CONSTRAINT uq_wards_no     UNIQUE (ward_number),
    CONSTRAINT chk_wards_zone  CHECK (zone IN ('NORTH','SOUTH','EAST','WEST','CENTRAL'))
);


-- ---------------------------------------------------------------------
-- 3. DEPARTMENTS   (strong entity)
-- ---------------------------------------------------------------------
CREATE TABLE departments (
    dept_id        SERIAL       PRIMARY KEY,
    dept_name      VARCHAR(100) NOT NULL,
    contact_email  VARCHAR(150) NOT NULL,

    CONSTRAINT uq_dept_name  UNIQUE (dept_name),
    CONSTRAINT chk_dept_mail CHECK (contact_email LIKE '%@%.%')
);


-- ---------------------------------------------------------------------
-- 4. STAFF         (strong entity, 1:1 specialisation of USERS)
-- ---------------------------------------------------------------------
CREATE TABLE staff (
    staff_id     SERIAL       PRIMARY KEY,
    user_id      INTEGER      NOT NULL,
    dept_id      INTEGER      NOT NULL,
    designation  VARCHAR(80)  NOT NULL,
    joined_on    DATE         NOT NULL DEFAULT CURRENT_DATE,

    CONSTRAINT fk_staff_user  FOREIGN KEY (user_id) REFERENCES users(user_id)
                              ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT fk_staff_dept  FOREIGN KEY (dept_id) REFERENCES departments(dept_id)
                              ON DELETE RESTRICT ON UPDATE CASCADE,
    -- 1:1 with users : one user account maps to at most one staff profile
    CONSTRAINT uq_staff_user  UNIQUE (user_id),
    CONSTRAINT chk_staff_join CHECK (joined_on <= CURRENT_DATE)
);


-- ---------------------------------------------------------------------
-- 5. COMPLAINT_CATEGORIES   (strong entity)
-- ---------------------------------------------------------------------
CREATE TABLE complaint_categories (
    category_id      SERIAL       PRIMARY KEY,
    category_name    VARCHAR(80)  NOT NULL,
    sla_hours        INTEGER      NOT NULL,
    default_dept_id  INTEGER      NOT NULL,
    density_window_days  INTEGER  NOT NULL DEFAULT 14,
    density_threshold    INTEGER  NOT NULL DEFAULT 4,

    CONSTRAINT uq_cat_name   UNIQUE (category_name),
    CONSTRAINT fk_cat_dept   FOREIGN KEY (default_dept_id) REFERENCES departments(dept_id)
                             ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_cat_sla   CHECK (sla_hours BETWEEN 1 AND 720),
    CONSTRAINT chk_cat_dwin  CHECK (density_window_days BETWEEN 1 AND 90),
    CONSTRAINT chk_cat_dthr  CHECK (density_threshold >= 2)
);

COMMENT ON COLUMN complaint_categories.density_threshold IS
  'Distinct parent complaints of this category in one ward within density_window_days that trigger hotspot escalation.';


-- ---------------------------------------------------------------------
-- 6. COMPLAINTS    (strong entity, with recursive FK)
-- ---------------------------------------------------------------------
CREATE TABLE complaints (
    complaint_id         SERIAL        PRIMARY KEY,
    title                VARCHAR(150)  NOT NULL,
    description          TEXT          NOT NULL,
    filed_by             INTEGER       NOT NULL,
    ward_id              INTEGER       NOT NULL,
    category_id          INTEGER       NOT NULL,
    routed_dept_id       INTEGER,
    handled_by           INTEGER,
    parent_complaint_id  INTEGER,                    -- recursive: duplicate of
    similarity_score     NUMERIC(5,4),               -- score at merge time
    route_confidence     NUMERIC(5,4),
    status               VARCHAR(20)   NOT NULL DEFAULT 'OPEN',
    priority             SMALLINT      NOT NULL DEFAULT 1,
    endorsement_count    INTEGER       NOT NULL DEFAULT 0,
    embedding            vector(384),                -- all-MiniLM-L6-v2
    created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sla_deadline         TIMESTAMP,

    CONSTRAINT fk_cmp_user  FOREIGN KEY (filed_by)    REFERENCES users(user_id)
                            ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_cmp_ward  FOREIGN KEY (ward_id)     REFERENCES wards(ward_id)
                            ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_cmp_cat   FOREIGN KEY (category_id) REFERENCES complaint_categories(category_id)
                            ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_cmp_dept  FOREIGN KEY (routed_dept_id) REFERENCES departments(dept_id)
                            ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_cmp_staff FOREIGN KEY (handled_by)  REFERENCES staff(staff_id)
                            ON DELETE SET NULL ON UPDATE CASCADE,
    -- recursive relationship DUPLICATE_OF
    CONSTRAINT fk_cmp_parent FOREIGN KEY (parent_complaint_id) REFERENCES complaints(complaint_id)
                            ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT chk_cmp_status   CHECK (status IN ('OPEN','ROUTED','IN_PROGRESS','RESOLVED','CLOSED','DUPLICATE')),
    CONSTRAINT chk_cmp_priority CHECK (priority BETWEEN 1 AND 5),
    CONSTRAINT chk_cmp_endorse  CHECK (endorsement_count >= 0),
    CONSTRAINT chk_cmp_sim      CHECK (similarity_score IS NULL OR similarity_score BETWEEN 0 AND 1),
    CONSTRAINT chk_cmp_conf     CHECK (route_confidence IS NULL OR route_confidence BETWEEN 0 AND 1),
    CONSTRAINT chk_cmp_desc     CHECK (char_length(description) >= 15),
    -- a complaint cannot be its own duplicate
    CONSTRAINT chk_cmp_noself   CHECK (parent_complaint_id IS NULL OR parent_complaint_id <> complaint_id),
    -- status DUPLICATE and a parent pointer must agree
    CONSTRAINT chk_cmp_dupflag  CHECK (
        (status = 'DUPLICATE' AND parent_complaint_id IS NOT NULL) OR
        (status <> 'DUPLICATE' AND parent_complaint_id IS NULL)
    )
);

COMMENT ON COLUMN complaints.endorsement_count IS
  'Derived attribute, materialised and kept correct by trigger trg_endorse_count. Denormalised deliberately so the hotspot query stays a single scan.';
COMMENT ON COLUMN complaints.embedding IS
  '384-dimension sentence embedding of title || description, produced by all-MiniLM-L6-v2.';


-- ---------------------------------------------------------------------
-- 7. COMPLAINT_STATUS_HISTORY  (WEAK ENTITY - composite PK)
-- ---------------------------------------------------------------------
CREATE TABLE complaint_status_history (
    complaint_id  INTEGER      NOT NULL,
    seq_no        INTEGER      NOT NULL,          -- partial key
    old_status    VARCHAR(20),
    new_status    VARCHAR(20)  NOT NULL,
    changed_by    INTEGER,
    changed_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    remarks       VARCHAR(255),

    -- weak entity : identified by its owner + partial key
    CONSTRAINT pk_hist PRIMARY KEY (complaint_id, seq_no),
    CONSTRAINT fk_hist_cmp  FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
                            ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_hist_user FOREIGN KEY (changed_by)   REFERENCES users(user_id)
                            ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_hist_seq    CHECK (seq_no > 0),
    CONSTRAINT chk_hist_change CHECK (old_status IS NULL OR old_status <> new_status)
);

COMMENT ON TABLE complaint_status_history IS
  'Weak entity. Existence-dependent on complaints (ON DELETE CASCADE); seq_no is a partial key unique only within one complaint.';


-- ---------------------------------------------------------------------
-- 8. ENDORSEMENTS  (M:N relationship USERS <-> COMPLAINTS, with attributes)
-- ---------------------------------------------------------------------
CREATE TABLE endorsements (
    user_id       INTEGER      NOT NULL,
    complaint_id  INTEGER      NOT NULL,
    endorsed_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    comment       VARCHAR(255),

    CONSTRAINT pk_endorse PRIMARY KEY (user_id, complaint_id),   -- one vote per citizen
    CONSTRAINT fk_end_user FOREIGN KEY (user_id)      REFERENCES users(user_id)
                           ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_end_cmp  FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
                           ON DELETE CASCADE ON UPDATE CASCADE
);


-- ---------------------------------------------------------------------
-- 9. RESOLUTIONS   (strong entity, 1:1 with complaints)
-- ---------------------------------------------------------------------
CREATE TABLE resolutions (
    resolution_id    SERIAL       PRIMARY KEY,
    complaint_id     INTEGER      NOT NULL,
    closed_by        INTEGER      NOT NULL,
    resolution_text  TEXT         NOT NULL,
    resolved_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_res_cmp   UNIQUE (complaint_id),               -- enforces 1:1
    CONSTRAINT fk_res_cmp   FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
                            ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_res_staff FOREIGN KEY (closed_by)    REFERENCES staff(staff_id)
                            ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_res_text CHECK (char_length(resolution_text) >= 10)
);


-- =====================================================================
-- ALTER demonstration (requirement 5)
-- =====================================================================
ALTER TABLE complaints
    ADD COLUMN is_hotspot BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE complaints
    ADD CONSTRAINT chk_cmp_hotspot_priority
    CHECK (is_hotspot = FALSE OR priority >= 3);

COMMENT ON COLUMN complaints.is_hotspot IS
  'Set by trigger trg_area_density when the ward crosses the category density threshold.';


-- =====================================================================
-- INDEXES
-- =====================================================================

-- B-tree : the dashboard filters on these three together
CREATE INDEX idx_cmp_ward_status_date
    ON complaints (ward_id, status, created_at DESC);

-- B-tree : staff queue per department
CREATE INDEX idx_cmp_dept_status
    ON complaints (routed_dept_id, status);

-- Partial index : only open complaints are ever checked for duplicates
CREATE INDEX idx_cmp_open_category
    ON complaints (category_id, ward_id)
    WHERE status IN ('OPEN','ROUTED','IN_PROGRESS');

-- B-tree : SLA breach scan
CREATE INDEX idx_cmp_sla
    ON complaints (sla_deadline)
    WHERE status NOT IN ('RESOLVED','CLOSED','DUPLICATE');

-- Recursive lookup : fetch all children of a parent complaint
CREATE INDEX idx_cmp_parent
    ON complaints (parent_complaint_id);

-- GIN full-text : the KEYWORD baseline we compare vector search against
CREATE INDEX idx_cmp_fts
    ON complaints
    USING GIN (to_tsvector('english', title || ' ' || description));

-- HNSW : approximate nearest-neighbour over the embedding column
CREATE INDEX idx_cmp_embedding
    ON complaints
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Supporting indexes on FK columns
CREATE INDEX idx_staff_dept     ON staff (dept_id);
CREATE INDEX idx_hist_changed   ON complaint_status_history (changed_at DESC);
CREATE INDEX idx_endorse_cmp    ON endorsements (complaint_id);
CREATE INDEX idx_res_staff      ON resolutions (closed_by);
