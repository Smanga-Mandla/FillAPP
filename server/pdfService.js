import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
      // =====================================

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
