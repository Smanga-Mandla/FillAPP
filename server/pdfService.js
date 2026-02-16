import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileP = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FORM_PATH = path.join(ROOT, 'Forms', '2026 MICT Internship Agreement.pdf');
const OUTPUT_DIR = path.join(ROOT, 'output');

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

export function getFormPath() {
  return FORM_PATH;
}

export function getFormBuffer() {
  return fs.readFileSync(FORM_PATH);
}

export function toPdfCoords(pageHeight, x, y, height) {
  const pdfY = pageHeight - y - height;
  return { x, y: pdfY };
}

export async function generatePdfs(fields, mappings, rows, headers) {
  ensureOutputDir();
  const formBytes = getFormBuffer();

  // --- sanitize input rows: remove fully-empty rows and exact duplicates ---
  const normalize = (r) => (r || []).map((c) => (c == null ? '' : String(c).trim()));
  const rowsNorm = (rows || []).map(normalize);
  const nonEmptyRows = rowsNorm.filter((r) => r.some((c) => c !== ''));
  const uniqueRows = nonEmptyRows.filter((r, idx, arr) => {
    return idx === arr.findIndex((p) => p.length === r.length && p.every((v, i) => v === r[i]));
  });

  if ((rows || []).length !== uniqueRows.length) {
    console.log(`Filtered rows: original=${(rows || []).length}, afterFilter=${uniqueRows.length}`);
  }

  const results = [];

  // iterate over filtered unique rows (preserves original ordering of first occurrences)
  for (let i = 0; i < uniqueRows.length; i++) {
    const row = uniqueRows[i];
    const pdfDoc = await PDFDocument.load(formBytes);
    const pages = pdfDoc.getPages();

    // ================================
    // AGE + GENDER AUTO LOGIC
    // ================================

    const ageIndex = headers.findIndex(
      (h) => String(h).trim().toUpperCase() === 'AGE'
    );

    const genderIndex = headers.findIndex(
      (h) => String(h).trim().toUpperCase() === 'GENDER'
    );

    const age =
      ageIndex >= 0 && row[ageIndex] != null
        ? Number(row[ageIndex])
        : null;

    const gender =
      genderIndex >= 0 && row[genderIndex] != null
        ? String(row[genderIndex]).trim()
        : '';

    // normalize common gender values into canonical 'MALE'|'FEMALE'
    const normalizedGender = (() => {
      const g = String(gender || '').trim().toUpperCase();
      if (!g) return '';
      if (/^(M|MALE|MAN|BOY)$/.test(g)) return 'MALE';
      if (/^(F|FEMALE|WOMAN|GIRL)$/.test(g)) return 'FEMALE';
      return g;
    })();

    const isBelow35 =
      age !== null && !isNaN(age) && age < 35;

    console.log('Age:', age);
    console.log('Gender(raw):', gender, 'normalized:', normalizedGender);
    console.log('Below35:', isBelow35);

    // ==========================================
    // 🔥 LOOP THROUGH ALL FIELDS (FIXED)
    // ==========================================

    for (const field of fields) {
      const page = pages[field.page - 1];
      if (!page) continue;

      const pageHeight = page.getHeight();
      const { x, y: pdfY } = toPdfCoords(
        pageHeight,
        field.x,
        field.y,
        field.height
      );

      const fieldId = field.id?.toLowerCase();
      const fieldLabel = String(field.label || '').toLowerCase();

      // =====================================
      // AUTO BELOW 35 (match by id OR label)
      // - allows user-drawn fields named `below35_yes`, `Below 35 - Yes`, etc.
      // =====================================

      const isBelow35YesField =
        fieldId === 'below35_yes' ||
        fieldLabel === 'below35_yes' ||
        /below\s*.*35.*yes/.test(fieldLabel);

      if (isBelow35YesField) {
        if (isBelow35) {
          page.drawText('X', {
            x: x + 2,
            y: pdfY + field.height / 2 - 6,
            size: 12,
          });
        }
        continue;
      }

      const isBelow35NoField =
        fieldId === 'below35_no' ||
        fieldLabel === 'below35_no' ||
        /below\s*.*35.*no/.test(fieldLabel);

      if (isBelow35NoField) {
        if (!isBelow35) {
          page.drawText('X', {
            x: x + 2,
            y: pdfY + field.height / 2 - 6,
            size: 12,
          });
        }
        continue;
      }

      // =====================================
      // AUTO GENDER
      // - supports explicit fields `gender_male` / `gender_female`
      // - supports a single region field named `gender` that contains the printed
      //   labels (uses PDF text-extraction when available; no OCR install needed
      //   for digital/selectable PDFs)
      // =====================================

      // REGION: single `gender` region field — read page text inside the rectangle
      if (fieldId === 'gender' || fieldLabel === 'gender') {
        try {
          const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(formBytes) });
          const pdfjsDoc = await loadingTask.promise;
          const pdfjsPage = await pdfjsDoc.getPage(field.page);
          const viewport = pdfjsPage.getViewport({ scale: 1 });
          const textContent = await pdfjsPage.getTextContent();

          const items = (textContent.items || []).map((it) => {
            const tx = (it.transform && it.transform[4]) || 0;
            const ty = (it.transform && it.transform[5]) || 0;
            return { str: String(it.str || ''), x: tx, y: ty };
          });

          // pdfjs y is bottom-based; convert stored field top-left y to bottom-based
          const pageHeightCss = viewport.height;
          const fieldBottomY = pageHeightCss - field.y - field.height;

          const hits = items.filter((it) =>
            it.x >= field.x - 1 &&
            it.x <= field.x + field.width + 1 &&
            it.y >= fieldBottomY - 1 &&
            it.y <= fieldBottomY + field.height + 1
          );

          const foundText = hits.map((h) => h.str).join(' ').toLowerCase();
          let hasMale = /\bmale\b/.test(foundText);
          let hasFemale = /\bfemale\b/.test(foundText);

          // If PDF has no selectable text in the region, fall back to OCR (native Tesseract)
          if (!foundText) {
            try {
              // render page -> PNG (72 DPI) using `pdftoppm` (Poppler) then run `tesseract` -> TSV
              const tmpDir = os.tmpdir();
              const outPrefix = path.join(tmpDir, `form_page_${field.page}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`);

              // pdftoppm -r 72 -png -f <page> -l <page> <input.pdf> <outPrefix>
              await execFileP('pdftoppm', ['-r', '72', '-png', '-f', String(field.page), '-l', String(field.page), FORM_PATH, outPrefix]);
              const pngPath = outPrefix + '.png';

              // tesseract <image> stdout -l eng tsv
              const { stdout } = await execFileP('tesseract', [pngPath, 'stdout', '-l', 'eng', 'tsv'], { maxBuffer: 10 * 1024 * 1024 });

              // parse TSV (columns: level, page_num, block_num, par_num, line_num, word_num, left, top, width, height, conf, text)
              const lines = (stdout || '').trim().split(/\r?\n/).slice(1);
              const words = lines.map((ln) => {
                const cols = ln.split('\t');
                return {
                  text: (cols[11] || '').trim(),
                  left: Number(cols[6]) || 0,
                  top: Number(cols[7]) || 0,
                  width: Number(cols[8]) || 0,
                  height: Number(cols[9]) || 0,
                };
              }).filter(w => w.text);

              // tesseract top/left coordinates use top-left origin; our field.x/field.y use points with top-left origin (72 DPI mapping)
              const wordsInField = words.filter(w =>
                w.left >= field.x - 2 &&
                w.left <= field.x + field.width + 2 &&
                w.top >= field.y - 2 &&
                w.top <= field.y + field.height + 2
              );

              const joined = wordsInField.map(w => w.text).join(' ').toLowerCase();
              hasMale = /\bmale\b/.test(joined);
              hasFemale = /\bfemale\b/.test(joined);

              // cleanup temp image
              try { fs.unlinkSync(pngPath); } catch (e) { /* ignore */ }
            } catch (ocrErr) {
              // binaries not available or failed — log and continue (explicit gender_{male,female} fields still work)
              console.log('OCR fallback failed (pdftoppm/tesseract):', ocrErr?.message || ocrErr);
            }
          }

          if (normalizedGender === 'MALE' && hasMale) {
            const maleItem = hits.find((h) => /\bmale\b/i.test(h.str));
            const drawAtX = (maleItem && maleItem.x) ? Math.max(field.x + 2, maleItem.x - 6) : field.x + 2;
            page.drawText('X', {
              x: drawAtX,
              y: pdfY + field.height / 2 - 6,
              size: 12,
            });
          }

          if (normalizedGender === 'FEMALE' && hasFemale) {
            const femaleItem = hits.find((h) => /\bfemale\b/i.test(h.str));
            const drawAtX = (femaleItem && femaleItem.x) ? Math.max(field.x + 2, femaleItem.x - 6) : field.x + 2;
            page.drawText('X', {
              x: drawAtX,
              y: pdfY + field.height / 2 - 6,
              size: 12,
            });
          }
        } catch (err) {
          console.log('gender region text-extract failed:', err?.message || err);
        }

        continue;
      }

      const isGenderMaleField =
        fieldId === 'gender_male' ||
        fieldLabel === 'gender_male' ||
        /\bmale\b/.test(fieldLabel);

      if (isGenderMaleField) {
        if (normalizedGender === 'MALE') {
          page.drawText('X', {
            x: x + 2,
            y: pdfY + field.height / 2 - 6,
            size: 12,
          });
        }
        continue;
      }

      const isGenderFemaleField =
        fieldId === 'gender_female' ||
        fieldLabel === 'gender_female' ||
        /\bfemale\b/.test(fieldLabel);

      if (isGenderFemaleField) {
        if (normalizedGender === 'FEMALE') {
          page.drawText('X', {
            x: x + 2,
            y: pdfY + field.height / 2 - 6,
            size: 12,
          });
        }
        continue;
      }

      // =====================================
      // NORMAL MAPPING FIELDS
      // =====================================

      const mapping = mappings.find(m => m.fieldId === field.id);
      if (!mapping) continue;

      const columns = mapping.excelColumns?.length
        ? mapping.excelColumns
        : mapping.excelColumn
        ? [mapping.excelColumn]
        : [];

      const separator =
        mapping.separator != null ? String(mapping.separator) : ' ';

      const findHeaderIndex = (col) => {
        const c = String(col).trim();
        if (!c) return -1;
        const i = headers.findIndex((h) => String(h).trim() === c);
        return i >= 0 ? i : headers.indexOf(col);
      };

      const parts = columns
        .map((col) => {
          const idx = findHeaderIndex(col);
          return idx >= 0 ? row[idx] : null;
        })
        .filter((v) => v != null && String(v).trim() !== '')
        .map((v) => String(v).trim());

      const str = parts.join(separator);

      // =====================================
      // ORIGINAL SWITCH LOGIC (UNCHANGED)
      // =====================================

      switch (field.type) {
        case 'checkbox':
          if (
            str &&
            str.toLowerCase() !== 'no' &&
            str.toLowerCase() !== '0'
          ) {
            page.drawText('X', {
              x: x + 2,
              y: pdfY + field.height / 2 - 6,
              size: 10,
            });
          }
          break;

        case 'radio':
          if (str) {
            page.drawText('•', {
              x: x + field.width / 2 - 3,
              y: pdfY + field.height / 2 - 6,
              size: 10,
            });
          }
          break;

        case 'grid': {
          const n = Math.max(1, Math.min(99, Number(field.gridBlocks) || 11));
          const lineThickness = 0.5;
          const gray = rgb(0.7, 0.7, 0.7);

          const topPdfY = pageHeight - field.y - field.height;
          const bottomPdfY = pageHeight - field.y;

          const cellWidth = field.width / n;
          const fontSize = Math.min(10, Math.max(6, field.height - 2));
          const halfChar = fontSize * 0.3;

          const chars = String(str)
            .replace(/\s/g, '')
            .slice(0, n)
            .padEnd(n, ' ')
            .split('');

          const cellPdfY =
            pdfY + (field.height - fontSize) / 2;

          for (let i = 1; i < n; i++) {
            const lineX = field.x + i * cellWidth;
            page.drawLine({
              start: { x: lineX, y: topPdfY },
              end: { x: lineX, y: bottomPdfY },
              thickness: lineThickness,
              color: gray,
            });
          }

          for (let i = 0; i < chars.length; i++) {
            const centerX = field.x + (i + 0.5) * cellWidth;
            const drawX = centerX - halfChar;

            if (chars[i] !== ' ') {
              page.drawText(chars[i], {
                x: drawX,
                y: cellPdfY,
                size: fontSize,
              });
            }
          }

          break;
        }

        default: {
          if (!str) break;

          const fontSize = Math.min(10, Math.max(6, field.height - 2));

          page.drawText(str, {
            x: x + 2,
            y: pdfY + (field.height - fontSize) / 2,
            size: fontSize,
          });

          break;
        }
      }
    }

    const outPath = path.join(
      OUTPUT_DIR,
      `student_${i + 1}.pdf`
    );

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outPath, pdfBytes);
    results.push(outPath);

    console.log(`Generated: ${outPath}`);
  }

  console.log(`Generated ${results.length} PDF(s).`);
  return results;
}
