import { read, utils } from 'xlsx';

// ── Normalização de telefone ───────────────────────────────────────────────────

function normalizePhone(value) {
  if (value === null || value === undefined || value === '') return null;

  // Excel armazena números grandes como float (ex: 5.511999999999e12) — converte com segurança
  let str;
  if (typeof value === 'number') {
    str = Math.round(value).toString();
  } else {
    str = String(value);
  }

  // Remove tudo que não for dígito
  const digits = str.replace(/\D/g, '');

  // Valida faixa: 10 (DDD+8) a 13 (55+DDD+9) dígitos — cobre formatos brasileiros
  if (digits.length < 10 || digits.length > 13) return null;

  return digits;
}

// ── Processamento principal ───────────────────────────────────────────────────

export function processExcelBuffer(buffer) {
  const workbook  = read(buffer, { type: 'buffer', raw: true, cellDates: false });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('Planilha vazia ou sem abas.');
  }

  const sheet = workbook.Sheets[sheetName];

  // header:1 → array de arrays (mais rápido que object mode para 50k+ linhas)
  // raw:true  → valores sem coerção de tipo, preserva inteiros grandes
  const rows = utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });

  const seen  = new Set();
  let totalProcessed = 0; // linhas varridas (excluindo header detectado automaticamente)

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let rowHadPhone = false;

    for (let c = 0; c < row.length; c++) {
      const phone = normalizePhone(row[c]);
      if (!phone) continue;

      rowHadPhone = true;
      seen.add(phone);
    }

    // Conta linha como "processada" se pelo menos uma célula pareceu um telefone
    if (rowHadPhone) totalProcessed++;
  }

  const uniquePhones = Array.from(seen);

  console.log(
    `[PIPELINE] Processamento concluído — ` +
    `linhas com telefone: ${totalProcessed} | únicos válidos: ${uniquePhones.length}`
  );

  return {
    totalProcessed,
    totalValid: uniquePhones.length,
    uniquePhones,
  };
}
