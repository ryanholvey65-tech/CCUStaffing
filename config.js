export const TEMPLATE = {
  spans: {
    '0700-1500': { sheet: '1st Shift', rnRange: 'B4:B15', chucCell: 'L3', dateCell: 'I34' },
    '1500-1900': { sheet: '2nd Shift', rnRange: 'B5:B16', chucCell: 'O4', dateCell: 'J35' },
    '1900-2300': { sheet: '2nd Shift', rnRange: 'F5:F16', chucCell: null, dateCell: 'J35' },
    '2300-0700': { sheet: '3rd Shift', rnRange: 'B5:B16', chucCell: 'L4', dateCell: 'I35' }
  },
  aliases: {
    'CORIASSO VANSICKLE SHEILA': 'HPMS CORIASSO',
    'VANSICKLE SHEILA': 'HPMS CORIASSO',
    'WEBSTER JASON': 'WEBSTER J',
    'WEBSTER RYAN': 'WEBSTER R',
    'HEDDY JACOB P': 'HPMS HEDDY',
    'JURGESS RYAN': 'AGENCY JURGESS',
    'CREEDON EMILY J': 'EXT CREEDON'
  }
};
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
