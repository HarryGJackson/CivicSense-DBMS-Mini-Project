import { tidy } from '../lib/sql';

/**
 * "SQL behind this page" — a fold-out that shows the exact statements the
 * page just ran against PostgreSQL. Nothing here is a copy kept for display:
 * the strings passed in are the same ones handed to the database.
 */
export default function SqlPeek({ title = 'SQL behind this page', queries }) {
  return (
    <details className="sqlpeek">
      <summary>{title}</summary>
      {queries.map((q) => (
        <div key={q.label}>
          <div className="sqlpeek-label">{q.label}</div>
          <pre>{tidy(q.sql)}</pre>
        </div>
      ))}
    </details>
  );
}
