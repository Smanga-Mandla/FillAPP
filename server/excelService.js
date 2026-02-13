import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// Fixed path: Excel file lives in students/ folder (per project structure)
const EXCEL_PATH = path.join(ROOT, 'students', 'Mcari.xlsx');

// Auto-detect header row: section row has "Learner Details", "Learner Address";
// real column headers have "LEARNER TITLE", "FIRST NAME OF LEARNER", "ID NUMBER", etc.
function detectHeaderRow(data) {
  if (!data.length) return 0;
  const upper = (s) => String(s || '').toUpperCase();
  for (let r = 0; r < Math.min(5, data.length); r++) {
    const row = data[r] || [];
    const joined = row.map(upper).join(' ');
    // Real Excel columns contain these phrases; section row does not
    const isRealHeaderRow =
      joined.includes('FIRST NAME') ||
      joined.includes('LEARNER TITLE') ||
      joined.includes('ID NUMBER') ||
      joined.includes('SURNAME OF');
    if (isRealHeaderRow) return r;
  }
  return 0;
}

/**
 * Load students.xlsx and return sheet data.
 * @returns {Promise<{ headers: string[], rows: any[][] }>}
 */
export async function loadExcel() {
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!data.length) return { headers: [], rows: [] };
  const headerRowIndex = detectHeaderRow(data);
  const headers = data[headerRowIndex];
  const rows = data.slice(headerRowIndex + 1);
  return { headers, rows };
}

/**
 * Preview: column headers + first 3 rows.
 */
export async function getPreview() {
  const { headers, rows } = await loadExcel();
  const previewRows = rows.slice(0, 3);
  return { headers, rows: previewRows };
}

/**
 * All rows for PDF generation (each row = one PDF).
 */
export async function getAllRows() {
  const { rows } = await loadExcel();
  return rows;
}

/**
 * Column headers only (for mapping dropdowns).
 */
export async function getHeaders() {
  const { headers } = await loadExcel();
  return headers;
}
