import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER ?? 'medusa'}:${process.env.POSTGRES_PASSWORD ?? 'medusa_secret_change_me'}@localhost:5432/${process.env.POSTGRES_DB ?? 'medusaEvolution'}`;

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[POSTGRES] Erro inesperado no pool:', err.message);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('[POSTGRES] Erro na query:', err.message);
    throw err;
  }
}

// Verifica se o pool consegue obter um cliente (usado no bootstrap)
export async function connectPostgres() {
  const client = await pool.connect();
  client.release();
  console.log('[POSTGRES] Conectado com sucesso.');
}

// ── Schema Base ───────────────────────────────────────────────────────────────

export async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id         BIGSERIAL    PRIMARY KEY,
      level      VARCHAR(20)  NOT NULL DEFAULT 'info',
      message    TEXT         NOT NULL,
      metadata   JSONB,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);
  console.log('[POSTGRES] Schema inicializado com sucesso.');
}
