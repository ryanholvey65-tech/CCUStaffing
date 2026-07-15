# CICU Staffing — Free Browser App

This version runs entirely in the browser and writes directly to the existing Google Sheets template. It has no server, paid hosting, Gemini key, or subscription.

## What it does

1. Opens as a normal website.
2. Reads a scanned weekly staffing PDF locally with PDF.js and Tesseract.js.
3. Shows a review/edit table.
4. Connects to Google Sheets through Google's browser OAuth flow.
5. Writes the selected date into the existing 1st Shift, 2nd Shift, and 3rd Shift tabs.

Template mapping included:

- 1st Shift RNs: `B4:B15`; CHUC: `L3`; date: `I34`
- 2nd Shift 1500–1900 RNs: `B5:B16`; CHUC: `O4`; date: `J35`
- 2nd Shift 1900–2300 RNs: `F5:F16`; date: `J35`
- 3rd Shift RNs: `B5:B16`; CHUC: `L4`; date: `I35`

## Free deployment option A: GitHub Pages

1. Create a free GitHub account and a new public or private repository.
2. Upload every file in this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder.
6. GitHub provides a website address such as `https://USERNAME.github.io/cicu-staffing/`.

## Free deployment option B: Cloudflare Pages

Upload this folder as a static site or connect the GitHub repository. No build command is required. The output directory is the repository root.

## Create the free Google OAuth Client ID

1. Open Google Cloud Console and create a project.
2. Go to **APIs & Services → Library** and enable **Google Sheets API**.
3. Configure the OAuth consent screen. For a personal test, use External and add your Google account as a test user.
4. Go to **Credentials → Create credentials → OAuth client ID**.
5. Choose **Web application**.
6. Under **Authorized JavaScript origins**, add the exact website origin, for example:
   - `https://USERNAME.github.io`
   - or your exact Cloudflare Pages origin.
7. Create it and copy the Client ID.
8. Open the staffing app, paste the Client ID and Google Sheet URL, then click **Save setup**.

A client secret is not used because this is a browser-only application.

## First use

1. Open the hosted website.
2. Enter the Client ID and the Google Sheets template URL.
3. Click **Connect Google Sheets** and approve spreadsheet access.
4. Choose the weekly PDF and click **Read schedule**.
5. Review the parsed rows carefully. Yellow rows have lower OCR confidence.
6. Select a date and click **Fill Google Sheet**.

## Important limitations

- Browser OCR is free but may take several minutes on a large scanned PDF.
- OCR is not perfect. Always review names, dates, roles, and spans before writing.
- Keep the app tab open while the PDF is processing.
- The PDF is processed locally, but Google account authorization and spreadsheet writes communicate directly with Google.
- Do not use staffing files containing patient identifiers.

## Local testing

Because browser module imports do not work reliably from `file://`, serve the folder locally:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Add `http://localhost:8080` as an authorized JavaScript origin in the Google OAuth client while testing.
