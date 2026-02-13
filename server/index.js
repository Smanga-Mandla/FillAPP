import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import routes from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api', routes);

// Root: this is the API only; open the app at http://localhost:5173
app.get('/', (req, res) => {
  res.type('text/plain').send('fillMeuP API (port 3001). Open the app at http://localhost:5173');
});

// Optional: serve output list for debugging
app.get('/api/output/list', (req, res) => {
  const outputDir = path.join(ROOT, 'output');
  if (!fs.existsSync(outputDir)) return res.json({ files: [] });
  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith('.pdf'));
  res.json({ files });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
