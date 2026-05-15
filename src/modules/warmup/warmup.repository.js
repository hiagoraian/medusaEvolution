import { query } from '../../core/postgres.js';

// ── Schema ────────────────────────────────────────────────────────────────────

export async function createWarmupSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS warmup_settings (
      id            INTEGER     PRIMARY KEY DEFAULT 1,
      is_active     BOOLEAN     NOT NULL DEFAULT false,
      intensity     INTEGER     NOT NULL DEFAULT 1,
      allowed_days  JSONB       NOT NULL DEFAULT '[1,2,3,4,5]',
      selected_zaps JSONB       NOT NULL DEFAULT '[]',
      start_at      TIMESTAMPTZ,
      end_at        TIMESTAMPTZ,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Migração: adiciona colunas em instâncias já existentes
  await query(`ALTER TABLE warmup_settings ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ`);
  await query(`ALTER TABLE warmup_settings ADD COLUMN IF NOT EXISTS end_at   TIMESTAMPTZ`);
  await query(`INSERT INTO warmup_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  console.log('[WARMUP] Schema warmup_settings pronto.');
}

// ── Leitura ───────────────────────────────────────────────────────────────────

export async function getWarmupSettings() {
  const { rows } = await query(`SELECT * FROM warmup_settings WHERE id = 1`);
  if (!rows[0]) return { isActive: false, intensity: 1, allowedDays: [1, 2, 3, 4, 5], selectedZaps: [], startAt: null, endAt: null };
  const r = rows[0];
  return {
    isActive:     r.is_active,
    intensity:    r.intensity,
    allowedDays:  r.allowed_days,
    selectedZaps: r.selected_zaps,
    startAt:      r.start_at  ? new Date(r.start_at).toISOString()  : null,
    endAt:        r.end_at    ? new Date(r.end_at).toISOString()    : null,
  };
}

// ── Escrita ───────────────────────────────────────────────────────────────────

export async function saveWarmupSettings({ isActive, intensity, allowedDays, selectedZaps, startAt, endAt }) {
  await query(
    `UPDATE warmup_settings
     SET is_active = $1, intensity = $2, allowed_days = $3::jsonb, selected_zaps = $4::jsonb,
         start_at = $5, end_at = $6, updated_at = NOW()
     WHERE id = 1`,
    [isActive, intensity, JSON.stringify(allowedDays), JSON.stringify(selectedZaps),
     startAt ?? null, endAt ?? null]
  );
}
