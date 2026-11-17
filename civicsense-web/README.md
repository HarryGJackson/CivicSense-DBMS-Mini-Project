# CivicSense — web application

Next.js front end and API over the PostgreSQL + pgvector database.

UE24CS351A · DBMS Mini Project · PES University
Aadarsh Reddy Yedhala (PES1UG24CS706) and Satvik J (PES1UG24CS714), Section L

The plain-language walkthrough, demo script and viva answers are in
`CivicSense_Project_Guide.pdf`, one folder up.

---

## Running it

The folder layout matters: `sql/` and `civicsense-web/` sit side by side.

```bash
cd civicsense-web
npm install
cp .env.local.example .env.local
npm run reset      # rebuilds the database from ../sql and generates embeddings
npm run dev        # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run reset` | drops and recreates the `civicsense` database, loads schema, triggers, seed data and demo logins, then embeds every complaint. Run before each demo. |
| `npm run embed` | only (re)generates the vectors. First run downloads the model, about 90 MB. |
| `npm run dev` | starts the site |

### Signing in

Every seeded account uses the password `password123`. The login page has a
button for each.

| Role | Email | Sees |
|---|---|---|
| Citizen | `sanjay.k@example.com` | file, edit, withdraw, endorse, search |
| Staff | `ramesh.g@citycorp.gov.in` | Roads queue, status changes, merges |
| Staff | `sunitha.d@citycorp.gov.in` | Water Supply queue |
| Admin | `admin@citycorp.gov.in` | everything plus the dashboard |

Until embeddings exist, duplicate detection falls back to keyword search and
says so on screen.

---

## What is where

```
app/
  layout.js                   shell, reads the session once
  login/ register/            authentication screens
  complaints/
    page.js                   list, filterable              (server component)
    new/NewComplaintForm.js   filing + live duplicate check (client)
    [id]/page.js              detail, history, duplicates   (server component)
    [id]/ComplaintActions.js  edit, withdraw, endorse, staff actions (client)
  search/                     keyword search vs vector search, side by side
  staff/                      department queue, SLA breaches, merge panel
  admin/page.js               dashboard, one panel per database view
  api/
    auth/{login,register,logout}
    complaints/                       POST   create (INSERT + embedding)
    complaints/[id]/                  PUT    edit and re-embed, DELETE withdraw
    complaints/check-duplicates/      embed + vector search
    complaints/[id]/endorse/
    complaints/[id]/status/           staff only
    complaints/[id]/merge/            staff only, calls the stored procedure
    search/                           both searches, returns the SQL it ran
lib/
  db.js                       one connection pool, query(sql, params)
  auth.js                     bcrypt, signed session cookie, role checks
  embeddings.js               all-MiniLM-L6-v2, with a graceful fallback
components/
  Nav.js                      navigation, shows only what the role may use
  SqlPeek.js                  the "SQL behind this page" fold-out
scripts/
  embed.mjs                   npm run embed
  reset-db.sh                 npm run reset
```

**Reads** happen in server components, straight against PostgreSQL — no
round trip through an API route to fetch a page's own data.
**Writes** all go through API routes, because every one of them has to check
the caller's role first.

---

## Authentication and access control

Three layers, and the database has the last word.

**Passwords.** bcrypt, cost 12. The column stores a hash; the plain password
is never written anywhere.

**Session.** An httpOnly cookie holding the user id, name and role, signed
with HMAC-SHA256. Editing the payload in the browser breaks the signature and
the session is rejected. `httpOnly` means page JavaScript cannot read it, so
an injected script cannot steal it.

**Roles.** CITIZEN, STAFF, ADMIN.

| Guard | Where |
|---|---|
| `CHECK (role IN ('CITIZEN','STAFF','ADMIN'))` | database — nothing else is storable |
| `requireRole([...])` | every API route that writes |
| department scoping | `assertCanActOnComplaint` — staff only touch their own department |
| hidden navigation | cosmetic only; the API refuses regardless |

Registration always creates a CITIZEN. There is no field a user could set to
make themselves staff — those accounts are created directly in the database.

Worth demonstrating: sign in as the Roads officer and try to change a Water
Supply complaint. The screen explains it and the API returns 403.

---

## Where the database does the work

The application deliberately does not recompute things the database already
maintains:

| Behaviour | Lives in |
|---|---|
| audit trail of status changes | trigger `trg_log_status` |
| SLA deadline | trigger `trg_sla_deadline` |
| endorsement count and priority | trigger `trg_endorse_count` |
| ward hotspot flag | trigger `trg_area_density` |
| resolution sanity checks | trigger `trg_validate_resolution` |
| merging a duplicate | procedure `merge_duplicate_complaint` |
| dashboard panels | views `v_department_workload`, `v_ward_hotspots`, `v_duplicate_clusters`, `v_sla_breaches` |

So `POST /api/complaints/[id]/endorse` inserts exactly one row. The count and
the priority change because of the trigger, not because the API updated them.

Constraint violations are turned into readable messages rather than swallowed —
a too-short description comes back as a 400 naming the problem, because the
route catches `chk_cmp_desc` by name.

---

## Duplicate detection

1. The citizen types. After a pause, the text goes to `/api/complaints/check-duplicates`.
2. It is embedded into 384 numbers by `all-MiniLM-L6-v2`, running locally.
3. Open complaints in the same ward are ranked by cosine distance (`<=>`),
   using the HNSW index.
4. Anything above 0.55 similarity is shown. The citizen can endorse one
   instead of filing a new complaint.

If the model cannot load, the same endpoint runs a PostgreSQL full-text query
instead and the response says `method: "fulltext"`, which the interface shows.
That contrast is the argument for the vector half: keyword search cannot match
"big hole near the bus stop" to "damaged road surface by bus stand".

Staff see a second route into the same mechanism: `/staff` lists pairs of open
complaints whose embeddings are close, and merging is one click — but always
a human click. Nothing merges on its own.

---

## Security notes

- Every query is parameterised; user input is never concatenated into SQL
- Passwords bcrypt-hashed, never logged
- Session cookie is httpOnly, SameSite=Lax, signed
- Database credentials come from `.env.local`, which is not committed
- The 500 handler returns a generic message and logs the detail server-side,
  so database internals are not leaked to the browser
