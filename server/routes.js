import express from 'express';
import * as excelService from './excelService.js';
import * as pdfService from './pdfService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');

const router = express.Router();

// --- Excel ---
// GET /excel/preview -> { headers, rows } (first 3 rows)
router.get('/excel/preview', async (req, res) => {
  try {
    const data = await excelService.getPreview();
    res.json(data);
  } catch (err) {
    console.error('Excel preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /excel/headers -> { headers }
router.get('/excel/headers', async (req, res) => {
  try {
    const headers = await excelService.getHeaders();
    res.json({ headers });
  } catch (err) {
    console.error('Excel headers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- PDF form (serve file for frontend PDF.js) ---
// GET /api/form/pdf -> stream the form PDF
router.get('/form/pdf', (req, res) => {
  const formPath = pdfService.getFormPath();
  if (!fs.existsSync(formPath)) {
    return res.status(404).json({ error: 'Form PDF not found' });
  }
  res.type('application/pdf');
  res.sendFile(path.resolve(formPath));
});

// --- Generate ---
// POST /generate  body: { fields, mappings }
// Backend loads rows from Excel; mappings use column header names
router.post('/generate', async (req, res) => {
  try {
    const { fields = [], mappings = [] } = req.body;
    const { headers, rows } = await excelService.loadExcel();
    const dataRows = rows; // array of arrays, index matches headers

    await pdfService.generatePdfs(fields, mappings, dataRows, headers);
    res.json({ success: true, count: dataRows.length });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Delete generated PDFs ---
// DELETE /output  -> delete all files in /output only
router.delete('/output', (req, res) => {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      return res.json({ success: true });
    }
    const names = fs.readdirSync(OUTPUT_DIR);
    for (const name of names) {
      const full = path.join(OUTPUT_DIR, name);
      if (fs.statSync(full).isFile()) {
        fs.unlinkSync(full);
        console.log('Deleted:', full);
      }
    }
    console.log('Delete output: cleared', names.length, 'file(s).');
    res.json({ success: true });
  } catch (err) {
    console.error('Delete output error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
