import { generatePdfs } from './pdfService.js';

// Combined smoke test for Below 35 proximity logic and Gender auto-fill
(async () => {
  const fields = [
    // Below 35 label + yes/no checkboxes
    { id: 'f_below', page: 1, x: 100, y: 200, width: 120, height: 12, label: 'Below 35', type: 'text' },
    { id: 'f_yes', page: 1, x: 260, y: 200, width: 12, height: 12, label: 'Yes', type: 'checkbox' },
    { id: 'f_no', page: 1, x: 300, y: 200, width: 12, height: 12, label: 'No', type: 'checkbox' },

    // gender checkboxes (IDs required: gender_male, gender_female)
    { id: 'gender_male', page: 1, x: 100, y: 240, width: 12, height: 12, label: 'Male', type: 'checkbox' },
    { id: 'gender_female', page: 1, x: 140, y: 240, width: 12, height: 12, label: 'Female', type: 'checkbox' },

    // single region named `gender` (new): covers printed labels 'Male'/'Female' so
    // the code can read the text in that rectangle and mark the matching option.
    { id: 'gender', page: 1, x: 90, y: 236, width: 120, height: 24, label: 'gender', type: 'text' },
  ];

  const mappings = [];

  const headers = ['AGE', 'GENDER'];
  const rows = [
    ['34', 'Male'],    // Below35 -> Yes, Gender -> Male
    ['35', 'Female'],  // Below35 -> No, Gender -> Female
    ['28', 'f'],       // Below35 -> Yes, Gender -> F (should map to Female)
  ];

  try {
    const out = await generatePdfs(fields, mappings, rows, headers);
    console.log('Test output files:', out);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();