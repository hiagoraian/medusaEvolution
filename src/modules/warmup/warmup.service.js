import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, 'assets');

// ── Assets ────────────────────────────────────────────────────────────────────

export function getRandomPhrase() {
  const filePath = path.join(ASSETS_DIR, 'frases.txt');
  const lines    = fs.readFileSync(filePath, 'utf-8')
    .split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[Math.floor(Math.random() * lines.length)] : 'Oi!';
}

export function getRandomMedia(type) {
  const dir = path.join(ASSETS_DIR, type === 'audio' ? 'audios' : 'images');
  let files;
  try { files = fs.readdirSync(dir).filter((f) => !f.startsWith('.')); }
  catch { return null; }
  if (!files.length) return null;
  const fileName = files[Math.floor(Math.random() * files.length)];
  const buffer   = fs.readFileSync(path.join(dir, fileName));
  return { base64: buffer.toString('base64'), fileName };
}

// ── Sorteio de tipo por nível ─────────────────────────────────────────────────
// Nível 1-2 : 100% texto
// Nível 3   : 80% texto · 20% imagem
// Nível 4-5 : 60% texto · 20% imagem · 20% áudio

function rollType(level) {
  if (level <= 2) return 'text';
  const r = Math.random();
  if (level === 3) return r < 0.80 ? 'text' : 'image';
  if (r < 0.60) return 'text';
  if (r < 0.80) return 'image';
  return 'audio';
}

// ── Gerador de tarefa ping-pong ───────────────────────────────────────────────
// accountId : remetente (ex: "WA-01")
// targetJid : destinatário em formato JID (ex: "5511999@s.whatsapp.net")

export function generateWarmupTask(accountId, targetJid, level) {
  const type = rollType(level);
  const base = { accountId, target: targetJid };

  if (type === 'image') {
    const media = getRandomMedia('image');
    if (media) return { ...base, type: 'image', base64: media.base64, caption: getRandomPhrase() };
  }

  if (type === 'audio') {
    const media = getRandomMedia('audio');
    if (media) return { ...base, type: 'audio', base64: media.base64 };
  }

  return { ...base, type: 'text', text: getRandomPhrase() };
}
