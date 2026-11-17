#!/bin/bash
# Replay the whole setup and capture a real terminal transcript.
OUT=/tmp/claude-0/-home-claude/9eaecfec-4a76-540a-85b2-cc621f7ea0d7/scratchpad/term.log
SQL=/var/tmp/cs
: > "$OUT"

say()  { printf '%s\n' "$1" >> "$OUT"; }
cmd()  { printf '\n$ %s\n' "$1" >> "$OUT"; }
# run a psql -c and record it
pc()   { cmd "psql -d civicsense -c \"$1\""
         su postgres -c "psql -d civicsense -P pager=off -c \"${1//\"/\\\"}\"" >> "$OUT" 2>&1; }
# run a psql meta-command
pm()   { cmd "psql -d civicsense -c '$1'"
         su postgres -c "psql -d civicsense -P pager=off -c '$1'" >> "$OUT" 2>&1; }

say "STEP 1  -  create the database and switch on the vector extension"
cmd "dropdb --if-exists civicsense && createdb civicsense"
su postgres -c "dropdb --if-exists civicsense && createdb civicsense" >> "$OUT" 2>&1
cmd 'psql -d civicsense -c "CREATE EXTENSION vector;"'
su postgres -c 'psql -d civicsense -c "CREATE EXTENSION vector;"' >> "$OUT" 2>&1

say ""
say "STEP 2  -  build the tables, then the triggers, functions and views, then load the data"
cmd "psql -d civicsense -f sql/01_schema.sql"
su postgres -c "psql -d civicsense -f $SQL/01_schema.sql" 2>&1 \
  | grep -vi notice | sort | uniq -c | sed 's/^ */    /' >> "$OUT"
say "    (summarised: each line above is one object created)"
cmd "psql -d civicsense -f sql/02_advanced.sql"
su postgres -c "psql -d civicsense -f $SQL/02_advanced.sql" 2>&1 \
  | grep -vi notice | sort | uniq -c | sed 's/^ */    /' >> "$OUT"
cmd "psql -d civicsense -f sql/03_seed_data.sql"
su postgres -c "psql -d civicsense -f $SQL/03_seed_data.sql" 2>&1 \
  | grep -vi notice | sort | uniq -c | sed 's/^ */    /' >> "$OUT"

say ""
say "STEP 3  -  the nine tables exist"
pm '\dt'

say ""
say "STEP 4  -  every table holds at least eight rows"
pc "SELECT 'users' AS table_name, COUNT(*) FROM users UNION ALL SELECT 'wards', COUNT(*) FROM wards UNION ALL SELECT 'departments', COUNT(*) FROM departments UNION ALL SELECT 'staff', COUNT(*) FROM staff UNION ALL SELECT 'complaint_categories', COUNT(*) FROM complaint_categories UNION ALL SELECT 'complaints', COUNT(*) FROM complaints UNION ALL SELECT 'complaint_status_history', COUNT(*) FROM complaint_status_history UNION ALL SELECT 'endorsements', COUNT(*) FROM endorsements UNION ALL SELECT 'resolutions', COUNT(*) FROM resolutions ORDER BY 1;"

say ""
say "STEP 5  -  the constraints really are enforced (each of these must fail)"
pc "UPDATE complaints SET priority = 9 WHERE complaint_id = 1;"
pc "INSERT INTO endorsements (user_id, complaint_id) VALUES (4, 1);"
pc "INSERT INTO users (name, email, password_hash, role) VALUES ('X','x@y.com','h','MAYOR');"

say ""
say "STEP 6  -  a trigger fires on its own: endorsing a complaint raises its priority"
pc "SELECT complaint_id, endorsement_count, priority FROM complaints WHERE complaint_id = 19;"
cmd "psql -d civicsense -c \"INSERT INTO endorsements (user_id, complaint_id) VALUES (1, 19);\""
su postgres -c "psql -d civicsense -c \"INSERT INTO endorsements (user_id, complaint_id) VALUES (1, 19);\"" >> "$OUT" 2>&1
pc "SELECT complaint_id, endorsement_count, priority FROM complaints WHERE complaint_id = 19;"
say "    endorsement_count went up by one and priority jumped from 1 to 3 - nothing in the"
say "    INSERT mentioned either column."

say ""
say "STEP 7  -  a join across four tables"
pc "SELECT c.complaint_id AS id, LEFT(c.title,26) AS title, u.name AS filed_by, w.ward_name, c.status FROM complaints c JOIN users u ON u.user_id = c.filed_by JOIN wards w ON w.ward_id = c.ward_id JOIN complaint_categories cc ON cc.category_id = c.category_id WHERE c.parent_complaint_id IS NULL ORDER BY c.complaint_id LIMIT 6;"

say ""
say "STEP 8  -  a recursive query walking the duplicate chain"
pc "WITH RECURSIVE dup_chain AS (SELECT complaint_id, parent_complaint_id, title, 0 AS depth, complaint_id::TEXT AS merge_path FROM complaints WHERE complaint_id = 1 UNION ALL SELECT c.complaint_id, c.parent_complaint_id, c.title, d.depth + 1, d.merge_path || ' -> ' || c.complaint_id FROM dup_chain d JOIN complaints c ON c.parent_complaint_id = d.complaint_id) SELECT depth, complaint_id, LEFT(title,38) AS title, merge_path FROM dup_chain ORDER BY depth;"

echo "captured $(wc -l < "$OUT") lines"
