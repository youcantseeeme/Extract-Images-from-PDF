# Contact Sheet

Pull every embedded photo out of a PDF, right in the browser. Drop a file in, get PNGs out — one at a time or as a ZIP. No backend, no build step, no server-side processing: the PDF never leaves the visitor's machine.

## How it works

The heavy lifting that used to be `fitz` (PyMuPDF) in the Python script is now [PDF.js](https://mozilla.github.io/pdf.js/) running in the browser: it walks each page's image objects, decodes them, and hands them back as PNG blobs. [JSZip](https://stuk.github.io/jszip/) bundles them into a ZIP on request. Both libraries load from a CDN — nothing to install.

**One real difference from the Python version:** `fitz.extract_image()` pulls the original encoded bytes straight out of the PDF, no re-encoding. A browser can't easily do that, so this decodes each image and re-saves it as PNG. Same picture, but file size and the original format (say, a JPEG) won't match exactly.

## Project structure

```
pdf-image-extractor/
├── index.html        the page markup
├── css/
│   └── style.css      all styling (dark/light aware)
├── js/
│   └── app.js          PDF parsing, extraction, and download logic
└── README.md
```

Everything is static — HTML, CSS, and vanilla JS. No `npm install`, no framework, no build tool.

## Running it locally

Opening `index.html` by double-clicking usually works, but some browsers restrict background workers on `file://` pages. Safer to serve it over a tiny local server:

```bash
cd pdf-image-extractor
python3 -m http.server 8000
# then open http://localhost:8000
```

No Python? Any static server works the same way, e.g. `npx serve .`.

## Putting it on the web

This is a plain static site, so any static host works. A few common ones:

### GitHub Pages (free, good for a public project)
```bash
cd pdf-image-extractor
git init
git add .
git commit -m "Contact Sheet"
git branch -M main
git remote add origin https://github.com/<you>/contact-sheet.git
git push -u origin main
```
Then in the repo: **Settings → Pages → Deploy from branch → main → / (root)**. Your site goes live at `https://<you>.github.io/contact-sheet/`.

### Netlify (fastest to try)
Go to [app.netlify.com/drop](https://app.netlify.com/drop) and drag the `pdf-image-extractor` folder straight into the browser window. It deploys immediately and gives you a URL. (Or `npx netlify-cli deploy` if you prefer the CLI.)

### Vercel
```bash
cd pdf-image-extractor
npx vercel
```
Follow the prompts — no config needed for a static folder.

### Your own server (Apache / Nginx / anything)
Copy the three files/folders (`index.html`, `css/`, `js/`) into the web root. That's the entire deployment — no server-side code runs.

## Optional: vendor the libraries yourself

Right now `index.html` loads PDF.js and JSZip from cdnjs. If you'd rather not depend on a CDN (offline use, stricter CSP, etc.), download these into a `vendor/` folder and point the `<script src="...">` tags in `index.html` at the local copies instead:

- `pdf.min.js` and `pdf.worker.min.js` from https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/
- `jszip.min.js` from https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/
