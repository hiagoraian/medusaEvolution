import multer from 'multer';
import path   from 'path';
import fs     from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.resolve(__dirname, '../../../uploads/media');

// Garante que a pasta existe
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const ALLOWED_MIME = {
  'image/jpeg':  'image',
  'image/png':   'image',
  'image/webp':  'image',
  'video/mp4':   'video',
  'video/3gpp':  'video',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

export const mediaUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
    cb(new Error(`Tipo não permitido: ${file.mimetype}. Use JPG, PNG, WEBP ou MP4.`));
  },
});

// POST /api/media/upload
export async function uploadMedia(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

  const mediaType = ALLOWED_MIME[req.file.mimetype];
  const filePath  = req.file.path;

  console.log(`[MEDIA] Upload: ${req.file.filename} (${mediaType}) — ${(req.file.size / 1024).toFixed(0)} KB`);

  return res.json({
    filePath,
    fileName: req.file.filename,
    mediaType,
    sizeKb: Math.round(req.file.size / 1024),
  });
}
