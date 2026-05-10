import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

function getSQL(): NeonQueryFunction<false, false> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

export async function ensureSchema() {
  const sql = getSQL();
  await sql`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id           TEXT    PRIMARY KEY,
      subject      TEXT    NOT NULL,
      category     TEXT    NOT NULL,
      message      TEXT    NOT NULL,
      submitted_at BIGINT  NOT NULL
    )
  `;
}

export { getSQL as sql };
