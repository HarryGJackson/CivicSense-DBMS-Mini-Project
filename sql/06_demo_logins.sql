-- =====================================================================
-- CivicSense - File 06 : demo logins for the web application
--
-- The hashes in 03_seed_data.sql are illustrative strings, so none of the
-- seeded accounts can actually sign in. This file replaces every one of them
-- with a real bcrypt hash of the password below, so the demo accounts work.
--
--     password for every seeded account:  password123
--
-- Run it after 03_seed_data.sql:
--     psql -d civicsense -f sql/06_demo_logins.sql
--
-- This is demo data. A real deployment would never share one password across
-- accounts, and would not keep it in a file in the repository.
-- =====================================================================

UPDATE users
   SET password_hash = '$2a$12$P1EetRetCfBiD.7nuSLWueWwWnw.m9SHYB4dDsaKKLvoNIad2sVkq';

-- who you can sign in as
--
--   CITIZEN  aadarsh.r@example.com        Aadarsh Reddy
--   CITIZEN  priya.nair@example.com       Priya Nair
--   STAFF    ramesh.g@citycorp.gov.in     Roads and Infrastructure
--   STAFF    sunitha.d@citycorp.gov.in    Water Supply
--   STAFF    prakash.s@citycorp.gov.in    Sanitation and Waste
--   ADMIN    admin@citycorp.gov.in        Corporation Admin

SELECT u.role, u.email, u.name, d.dept_name
  FROM users u
  LEFT JOIN staff s       ON s.user_id = u.user_id
  LEFT JOIN departments d ON d.dept_id = s.dept_id
 WHERE u.email IN ('aadarsh.r@example.com',
                   'ramesh.g@citycorp.gov.in',
                   'admin@citycorp.gov.in')
 ORDER BY u.role;
