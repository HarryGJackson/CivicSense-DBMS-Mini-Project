/**
 * Small helper so the SQL shown on screen looks the way it was written:
 * strips the common leading indentation from a template string.
 */
export function tidy(sql) {
  const lines = sql.replace(/\t/g, '  ').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length)
  );
  return lines.map((l) => l.slice(indent)).join('\n');
}
