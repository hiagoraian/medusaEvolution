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
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`INSERT INTO warmup_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  console.log('[WARMUP] Schema warmup_settings pronto.');
}

// ── Leitura ───────────────────────────────────────────────────────────────────

export async function getWarmupSettings() {
  const { rows } = await query(`SELECT * FROM warmup_settings WHERE id = 1`);
  if (!rows[0]) return { isActive: false, intensity: 1, allowedDays: [1, 2, 3, 4, 5], selectedZaps: [] };
  const r = rows[0];
  return {
    isActive:     r.is_active,
    intensity:    r.intensity,
    allowedDays:  r.allowed_days,
    selectedZaps: r.selected_zaps,
  };
}

// ── Escrita ───────────────────────────────────────────────────────────────────

export async function saveWarmupSettings({ isActive, intensity, allowedDays, selectedZaps }) {
  await query(
    `UPDATE warmup_settings
     SET is_active = $1, intensity = $2, allowed_days = $3::jsonb, selected_zaps = $4::jsonb, updated_at = NOW()
     WHERE id = 1`,
    [isActive, intensity, JSON.stringify(allowedDays), JSON.stringify(selectedZaps)]
  );
}
