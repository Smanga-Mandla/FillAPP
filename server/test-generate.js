import { generatePdfs } from './pdfService.js';

// Small smoke test for the "Below 35" yes/no proximity logic
(async () => {
  const fields = [
    // label that indicates "Below 35" (text field)
    { id: 'f_below', page: 1, x: 100, y: 200, width: 120, height: 12, label: 'Below 35', type: 'text' },
    // a "Yes" checkbox drawn to the right of the label (should be detected as below35_yes)
    { id: 'f_yes', page: 1, x: 260, y: 200, width: 12, height: 12, label: 'Yes', type: 'checkbox' },
    // a "No" checkbox drawn to the right of the label as well
    { id: 'f_no', page: 1, x: 300, y: 200, width: 12, height: 12, label: 'No', type: 'checkbox' },
  ];

  const mappings = [];

  const headers = ['AGE'];
  const rows = [
    // age < 35 -> should mark the Yes box
    ['34'],
    // age >= 35 -> should mark the No box
    ['35'],
  ];

  try {
    const out = await generatePdfs(fields, mappings, rows, headers);
    console.log('Test output files:', out);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();