#!/bin/bash
# npm run reset
#
# Rebuilds the civicsense database from the SQL files, so every demo starts
# from the same known state, then gives every complaint its vector.
# Everything in the database is replaced.
set -e
SQL="$(cd "$(dirname "$0")/../../sql" && pwd)"

echo "== rebuilding database 'civicsense' from $SQL"
dropdb --if-exists civicsense
createdb civicsense
psql -d civicsense -q -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -d civicsense -q -v ON_ERROR_STOP=1 -f "$SQL/01_schema.sql"      2>&1 | grep -v NOTICE || true
psql -d civicsense -q -v ON_ERROR_STOP=1 -f "$SQL/02_advanced.sql"
psql -d civicsense -q -v ON_ERROR_STOP=1 -f "$SQL/03_seed_data.sql"
psql -d civicsense -q -v ON_ERROR_STOP=1 -f "$SQL/06_demo_logins.sql"  > /dev/null
psql -d civicsense -c '\dt'

echo "== generating embeddings"
node "$(dirname "$0")/embed.mjs"
echo "== ready. Start the site with:  npm run dev"
