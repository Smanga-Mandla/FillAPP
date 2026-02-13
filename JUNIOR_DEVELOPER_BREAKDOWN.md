# Junior developer breakdown: how we built fillMeuP

This document explains **how the app is built** so you can follow the flow, find the right files, and make changes safely.

---

## 1. What the app does (in one sentence)

The user draws boxes on a PDF form, maps each box to one or more Excel columns, then the app generates one filled PDF per Excel row (e.g. one PDF per student).

---

## 2. High-level flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React, port 5173)                                             │
├─────────────────────────────────────────────────────────────────────────┤
│  1. Load PDF          → PdfViewer fetches /api/form/pdf, renders with   │
│                         PDF.js (one canvas per page)                      │
│  2. Define fields     → User click-drags on overlay; FieldOverlay        │
│                         prompts for label + type; fields stored in state │
│  3. Map to Excel     → MappingPanel: for each field, pick column(s)     │
│                         and optional separator (combine e.g. Name+Surname)│
│  4. Generate / Delete → Controls calls POST /generate or DELETE /output │
└─────────────────────────────────────────────────────────────────────────┘
                    │                              │
                    │  GET /api/form/pdf           │  POST /api/generate
                    │  GET /api/excel/preview      │  body: { fields, mappings }
                    │  GET /api/excel/headers      │  DELETE /api/output
                    ▼                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BACKEND (Node + Express, port 3001)                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  routes.js     → Handles /api/excel/preview, /api/excel/headers,         │
│                  /api/form/pdf, POST /api/generate, DELETE /api/output  │
│  excelService  → Reads students/students.xlsx, returns headers + rows   │
│                  (auto-detects header row: FIRST NAME, ID NUMBER, etc.)  │
│  pdfService    → Loads Forms/...pdf, clones per row, fills text/grid    │
│                  using field coordinates + mappings, writes to output/  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Folder and file responsibilities

| Path | Purpose |
|------|--------|
| **client/** | React app (Vite). User never uploads files; PDF and Excel paths are fixed. |
| **client/src/App.jsx** | Top-level state: `fields`, `mappings`, `pageInfos`, `excelHeaders`. Loads Excel preview/headers on mount. Renders sidebar (field list, MappingPanel, Controls) + main (PdfViewer + FieldOverlay). |
| **client/src/PdfViewer.jsx** | Fetches PDF from `/api/form/pdf`, uses PDF.js to render each page to a `<canvas>`. Exports `SCALE` (2) and calls `onPagesLoaded(pageInfos)` so overlay knows page dimensions. |
| **client/src/FieldOverlay.jsx** | Transparent overlay on top of PDF. Handles click-drag to draw a rectangle → prompt for label + type (text, number, date, checkbox, radio, **grid**). For **grid**: optional direction (horizontal = one char per box, vertical = one line per row) and number of blocks/rows. Converts drawn pixels to PDF points (÷ scale) and calls `onAddField(field)`. Renders existing fields as boxes; supports select + delete. |
| **client/src/MappingPanel.jsx** | For each field: one or more column dropdowns (from `excelHeaders`) and optional separator. Builds mapping as `{ fieldId, excelColumns: string[], separator? }`. “Add column to combine” adds a second dropdown (e.g. First Name + Surname). |
| **client/src/Controls.jsx** | “Generate PDFs” (POST /api/generate with `fields` + `mappings`) and “Delete Generated PDFs” (DELETE /api/output). Shows success/error message. |
| **server/index.js** | Creates Express app, CORS, JSON body parser, mounts routes at `/api`, serves root message. Listens on 3001. |
| **server/routes.js** | `GET /excel/preview`, `GET /excel/headers`, `GET /form/pdf`, `POST /generate`, `DELETE /output`. No file uploads; all paths are fixed. |
| **server/excelService.js** | Reads `students/students.xlsx`. Auto-detects header row (row that contains “FIRST NAME”, “LEARNER TITLE”, “ID NUMBER”, etc.). Returns `{ headers, rows }` for that row and data below. |
| **server/pdfService.js** | Loads form PDF from `Forms/...`. For each row: clone PDF, for each mapping resolve value (single column or combined with separator, with trimmed header matching). Then by field type: **text** (single line or multi-line wrap from top), **grid** (horizontal = one char per cell + vertical lines, vertical = one line per row + horizontal lines), **checkbox/radio**. Converts top-left coords to PDF bottom-left in `toPdfCoords`. Writes to `output/student_1.pdf`, etc. |
| **Forms/** | Contains the blank PDF form (e.g. MICT agreement). |
| **students/** | Contains `students.xlsx` (one row per learner). |
| **output/** | Generated PDFs (one per data row). |

---

## 4. Key data structures

**Field (frontend + sent to backend)**  
`{ id, page, x, y, width, height, label, type, gridBlocks?, gridDirection? }`  
- `x, y, width, height` are in **PDF points**, top-left origin.  
- `type`: `'text' | 'number' | 'date' | 'checkbox' | 'radio' | 'grid'`.  
- For `grid`: `gridBlocks` = number of cells (horizontal) or rows (vertical); `gridDirection` = `'horizontal' | 'vertical'`.

**Mapping (frontend + backend)**  
- Legacy: `{ fieldId, excelColumn }` (one column).  
- Current: `{ fieldId, excelColumns: string[], separator? }`.  
- Backend accepts both; if `excelColumns` is set it joins row values with `separator` (default space).

**Excel**  
- `headers`: array of column names (from detected header row).  
- `rows`: array of rows; `row[i]` corresponds to `headers[i]`.

---

## 5. How coordinates work

- **Frontend (canvas/overlay):** Top-left origin; y increases downward. When the user draws a rectangle we get pixel coordinates. We convert to PDF points with `scaleX = 1/scale`, `scaleY = 1/scale` (scale = 2 from PdfViewer), so `field.x = px * scaleX`, etc.
- **Backend (pdf-lib):** PDF has **bottom-left** origin; y increases **upward**. We use `toPdfCoords(pageHeight, x, y, height)` so that `pdfY = pageHeight - y - height`. So we always pass **top-left** `x, y, height` from the frontend and convert only for drawing.

---

## 6. How each feature was built (step-by-step)

**6.1 Load PDF**  
- Backend: `GET /api/form/pdf` streams the file from `Forms/...` (see `routes.js`).  
- Frontend: `PdfViewer` calls `getDocument(pdfUrl).promise`, then for each page `getPage(i)`, `getViewport({ scale: 2 })`, render to canvas. PDF.js worker is from `pdfjs-dist/legacy/build/pdf.worker.mjs?url`.

**6.2 Define fields**  
- User mousedown/mousemove/mouseup on `FieldOverlay`; we store start and current point, then on mouseup compute rect (min/max of start and current). If rect is too small we ignore. We convert rect to PDF points and show a small modal (label + type; for grid: direction + number of blocks). On submit we add `{ id, page, x, y, width, height, label, type, ... }` to state. Fields are drawn as divs over the PDF with the same scale so positions match.

**6.3 Map to Excel**  
- On load we fetch `GET /api/excel/headers` and store in `excelHeaders`. MappingPanel renders one “row” per field: first dropdown = first column; “+ Add column to combine” adds another dropdown and shows “Separator”. We store `excelColumns` array and optional `separator` so backend can join values.

**6.4 Generate PDFs**  
- Frontend sends `POST /api/generate` with `{ fields, mappings }`.  
- Backend loads Excel (headers + all rows). For each row: load form PDF with pdf-lib, for each mapping find the field, resolve value (single or combined columns with separator, with trimmed header match). Then by type: **text** (single line or multi-line wrap from top of box), **grid** (horizontal: N columns, one char each + vertical lines; vertical: N rows, one line each + horizontal lines), **checkbox/radio**. Write to `output/student_1.pdf`, etc.

**6.5 Multi-line text (wrap from first row)**  
- When `field.type === 'text'` and the box is tall enough (`maxLinesThatFit >= 2`) and the value is longer than one line, we split the string into lines that fit in `field.width` (approx char width), with optional word-break at spaces. We draw from the **top** of the box: `topOfFieldPdfY = pdfY + field.height`, then first line at `topOfFieldPdfY - fontSize`, next at `topOfFieldPdfY - fontSize - lineHeight`, etc.

**6.6 Grid (horizontal vs vertical)**  
- **Horizontal:** N boxes in a row; value is split into one character per box; we draw vertical lines between cells and center each character.  
- **Vertical:** N rows; value is split by newlines; we draw horizontal lines between rows and one line of text per row.

**6.7 Delete outputs**  
- `DELETE /api/output` deletes all files inside the `output/` directory (see `routes.js`). Does not touch the form PDF, Excel, or in-memory fields/mappings.

---

## 7. Where to change things

| If you want to… | Look at |
|------------------|--------|
| Change the form PDF or Excel path | `server/excelService.js` (EXCEL_PATH), `server/pdfService.js` (FORM_PATH) |
| Add a new field type | `client/src/FieldOverlay.jsx` (FIELD_TYPES + prompt), `server/pdfService.js` (switch on `field.type`) |
| Change how multi-line text wraps | `server/pdfService.js` (text/default case: maxCharsPerLine, line splitting, linePdfY) |
| Change grid block count default or auto-calc | `client/src/FieldOverlay.jsx` (suggestedGridBlocks, gridBlocks state) |
| Add another API endpoint | `server/routes.js` + optional new method in excelService or pdfService |
| Change Excel header detection | `server/excelService.js` (detectHeaderRow) |
| Style the app | `client/src/index.css` |

---

## 8. Quick reference: run and test

```bash
npm run server   # backend on 3001
npm run client   # frontend on 5173 → open http://localhost:5173
# or
npm run dev      # both
```

- Use **http://localhost:5173** for the app (not 3001; 3001 is API only).  
- Restart the server after changing backend code; refresh the app after changing Excel or form paths so headers/form are re-loaded.

---

This breakdown should be enough for a junior developer to understand the flow and know where to look when changing or extending the app.
