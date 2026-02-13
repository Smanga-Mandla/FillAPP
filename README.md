# fillMeuP – PDF form automation MVP

Local web app: define fields on a PDF form, map them to Excel columns, generate one filled PDF per row.

## Fixed files (no uploads)

- **Form PDF:** `Forms/2026 MICT Internship Agreement.pdf`
- **Excel data:** `students/students.xlsx`
- **Output:** `output/student_1.pdf`, `student_2.pdf`, …

## Run

```bash
# Install (if not done)
npm install

# Terminal 1 – backend
npm run server

# Terminal 2 – frontend (then open http://localhost:5173)
npm run client
```

Or both: `npm run dev`

## Flow

1. **Load PDF** – Form loads automatically in the viewer.
2. **Define fields** – Click-drag on the PDF to draw a rectangle; enter label and type (text, number, date, checkbox, radio). Use the side panel to select or delete fields.
3. **Map to Excel** – For each field, choose which Excel column to use (manual only).
4. **Generate PDFs** – Click “Generate PDFs”; one PDF per Excel row is written to `output/`.
5. **Delete outputs** – Click “Delete Generated PDFs” to clear `output/` for another run.

## Tech

- **Frontend:** React, PDF.js (legacy build), minimal CSS
- **Backend:** Node, Express, pdf-lib, xlsx

No AI, OCR, auth, or file uploads.

## Junior developer breakdown

See **[JUNIOR_DEVELOPER_BREAKDOWN.md](./JUNIOR_DEVELOPER_BREAKDOWN.md)** for a step-by-step explanation of how the flow was built: folder/file roles, data structures, coordinates, and where to change things.
