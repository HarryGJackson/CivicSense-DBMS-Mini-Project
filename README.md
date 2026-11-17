# CivicSense

DBMS Mini Project, UE24CS351A, PES University

- Aadarsh Reddy Yedhala (PES1UG24CS706)
- Satvik J (PES1UG24CS714)

## About

CivicSense is a civic complaint portal where citizens report local problems
(roads, water supply, and so on) and city staff track and resolve them. The
database is PostgreSQL with 9 tables, plus triggers, a stored procedure and
views. It uses the pgvector extension to store an embedding for each complaint
and runs a cosine-similarity search to flag likely duplicates before a new
complaint is filed. The web app is built with Next.js 14 and has three roles:
Citizen, Staff and Admin.

## Contributions

- Aadarsh Reddy Yedhala: database design, SQL DDL/DML, triggers, stored
  procedure and views (`sql/`, `diagrams/`)
- Satvik J: Next.js frontend, API routes and vector search (`civicsense-web/`)

## Folder layout

```
sql/             PostgreSQL + pgvector scripts (schema, triggers, seed data, demo queries)
civicsense-web/  Next.js 14 web app
diagrams/        ER diagrams and relational schema
*.pdf            Project report, project guide and viva Q&A
```

## Running it

Prerequisites: PostgreSQL 17 with the pgvector extension, and Node.js.
The first `npm run reset` downloads the embedding model (about 90 MB);
after that it runs offline.

```bash
cd civicsense-web
npm install
cp .env.local.example .env.local
npm run reset    # builds the database from ../sql and creates embeddings
npm run dev      # http://localhost:3000
```

All demo accounts use the password `password123`.
