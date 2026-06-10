import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const SPINTAX_FILE = path.resolve(__dirname, '../../../uploads/textspintax.txt');

// Cache de módulo com TTL de 60s — evita leitura de disco em cada mensagem enviada.
let _varsCache = null;
let _varsCacheTs = 0;
const VARS_TTL_MS = 60_000;

function loadVariables() {
  if (_varsCache && Date.now() - _varsCacheTs < VARS_TTL_MS) return _varsCache;
  try {
    const content = fs.readFileSync(SPINTAX_FILE, 'utf-8');
    const vars = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key   = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key && value) vars[key] = value;
    }
    _varsCache   = vars;
    _varsCacheTs = Date.now();
    return vars;
  } catch {
    return _varsCache ?? {};
  }
}

// Processa spintax no texto: {opção1|opção2|opção3}
// Cada bloco {} sorteia uma opção aleatória.
// Se a opção sorteada for uma variável definida no arquivo, substitui pelo valor.
export function processSpintax(text) {
  if (!text || !text.includes('{')) return text;

  const vars = loadVariables();

  return text.replace(/\{([^}]+)\}/g, (_, inner) => {
    const options = inner.split('|').map((o) => o.trim()).filter(Boolean);
    if (!options.length) return '';
    const chosen = options[Math.floor(Math.random() * options.length)];
    return vars[chosen] ?? chosen;
  });
}
