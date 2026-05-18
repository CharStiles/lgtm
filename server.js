const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;

// Azure App Service persists /home/site — use it if available
const isAzure = process.env.WEBSITE_SITE_NAME || false;
const DATA_DIR = process.env.DATA_DIR || (isAzure ? '/home/uploads' : path.join(__dirname, 'uploads'));
fs.mkdirSync(DATA_DIR, { recursive: true });

// JSON file to store image metadata (drawings, titles, etc.)
const META_FILE = path.join(DATA_DIR, 'meta.json');
function loadMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); }
  catch { return {}; }
}
function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// Multer config — limit to 10MB per image, accept common image types
const storage = multer.diskStorage({
  destination: DATA_DIR,
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|heic)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Separate multer for canvas saves (always PNG from toBlob)
const uploadCanvas = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));

// Serve uploaded images
app.use('/uploads', express.static(DATA_DIR));

// Upload endpoint
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const meta = loadMeta();
  const id = path.parse(req.file.filename).name;
  meta[id] = {
    filename: req.file.filename,
    originalName: req.file.originalname,
    uploadedAt: new Date().toISOString(),
    handle: null,
    drawings: null,
    creatorId: req.headers['x-client-id'] || null
  };
  saveMeta(meta);

  res.json({ id, filename: req.file.filename });
});

// Get all images
app.get('/api/images', (_req, res) => {
  const meta = loadMeta();
  const images = Object.entries(meta).map(([id, data]) => ({
    id,
    ...data,
    url: `/uploads/${data.filename}`
  }));
  // Sort newest first
  images.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json(images);
});

// Save drawing data for an image
app.post('/api/images/:id/drawing', (req, res) => {
  const meta = loadMeta();
  if (!meta[req.params.id]) return res.status(404).json({ error: 'Image not found' });

  meta[req.params.id].drawings = req.body.drawings;
  saveMeta(meta);
  res.json({ ok: true });
});

// Save edited canvas (flattened image with drawings/mirrors baked in)
app.post('/api/canvas/:id', uploadCanvas.single('image'), (req, res) => {
  console.log('save-canvas hit, id:', req.params.id);
  const meta = loadMeta();
  const data = meta[req.params.id];
  if (!data) return res.status(404).json({ error: 'Image not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Only the creator can edit
  const clientId = req.headers['x-client-id'];
  if (!data.creatorId || clientId !== data.creatorId) {
    return res.status(403).json({ error: 'You can only edit your own images' });
  }

  // Remove old file
  const oldPath = path.join(DATA_DIR, data.filename);
  try { fs.unlinkSync(oldPath); } catch {}

  // Update metadata to point to new file
  data.filename = req.file.filename;
  data.drawings = null; // drawings are baked in now
  if (req.body.handle) data.handle = req.body.handle;
  saveMeta(meta);

  res.json({ ok: true, filename: req.file.filename });
});

// Get single image info
app.get('/api/images/:id', (req, res) => {
  const meta = loadMeta();
  const data = meta[req.params.id];
  if (!data) return res.status(404).json({ error: 'Image not found' });
  res.json({ id: req.params.id, ...data, url: `/uploads/${data.filename}` });
});

// Delete an image
app.delete('/api/images/:id', (req, res) => {
  const meta = loadMeta();
  const data = meta[req.params.id];
  if (!data) return res.status(404).json({ error: 'Image not found' });

  // Only the creator can delete
  const clientId = req.headers['x-client-id'];
  if (!data.creatorId || clientId !== data.creatorId) {
    return res.status(403).json({ error: 'You can only delete your own images' });
  }

  // Remove file
  const filePath = path.join(DATA_DIR, data.filename);
  try { fs.unlinkSync(filePath); } catch {}

  delete meta[req.params.id];
  saveMeta(meta);
  res.json({ ok: true });
});

// Error handling for multer
app.use((err, _req, res, _next) => {
  console.error('Server error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Unknown server error' });
  }
});

app.listen(PORT, () => {
  console.log(`LGTM running at http://localhost:${PORT}`);
  console.log(`Uploads stored in: ${DATA_DIR}`);
});
