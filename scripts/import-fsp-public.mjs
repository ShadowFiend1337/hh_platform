import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PILOT_SOURCE, gridRows, recordFromCells, discoverProtocols, sha256 } from './fsp/parse.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const cache = resolve(root, 'server/data/fsp-public');
const reportPath = resolve(root, 'server/data/fsp-public/report.json');
async function download(url, maxBytes = 10_000_000) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Predel-FSP-Public-Pilot/1.0', Accept: 'application/pdf,text/html' } });
  if (!response.ok) throw new Error(`Source unavailable: HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Source too large');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > maxBytes) throw new Error('Source too large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function main() {
  if (args.some(arg => !['--cached','--discover'].includes(arg)) || args.length > 1) throw new Error('Usage: npm run import:fsp-public [-- --discover|--cached]');
  if (args.includes('--discover')) {
    const protocols = discoverProtocols((await download(PILOT_SOURCE.discoveryUrl, 2_000_000)).toString('utf8'));
    console.log(JSON.stringify({ discoveryUrl: PILOT_SOURCE.discoveryUrl, checkedAt: new Date().toISOString(), protocols },null,2)); return;
  }
  await mkdir(cache, { recursive: true });
  const pdfPath = resolve(cache, 'algorithms-2025-final.pdf');
  const bytes = args.includes('--cached') ? await readFile(pdfPath) : await download(PILOT_SOURCE.sourceUrl);
  if (!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('Source is not a PDF');
  if (!args.includes('--cached')) await writeFile(pdfPath, bytes);
  const { getDocument } = await import('../frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('../frontend/node_modules/@napi-rs/canvas/index.js');
  const { createWorker } = await import('../frontend/node_modules/tesseract.js/src/index.js');
  const loading = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
  const pdf = await loading.promise;
  if (pdf.numPages !== PILOT_SOURCE.expectedPages) { await loading.destroy(); throw new Error('Protocol page count changed; review required'); }
  const worker = await createWorker('rus+eng', 1, { langPath: resolve(root,'frontend/public/resume-assets/tesseract/lang'), cachePath: cache, logger: () => {} });
  const items = [];
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    for (let i=0;i<pdf.numPages;i++) {
      const page = await pdf.getPage(i+1), viewport = page.getViewport({ scale: 3 });
      if (viewport.width * viewport.height > 10_000_000) throw new Error('Page dimensions changed; review required');
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height)), context = canvas.getContext('2d');
      await page.render({canvasContext: context, viewport}).promise;
      const profile = PILOT_SOURCE.pages[i];
      const rows = gridRows(context.getImageData(0,0,canvas.width,canvas.height), profile);
      await writeFile(resolve(cache,`page-${i+1}.png`),canvas.toBuffer('image/png'));
      for(let j=0;j<rows.length;j++) {
        const row = rows[j], cells = [];
        for(let k=0;k<profile.columns.length-1;k++) {
          const margin = [0,2,3].includes(k) ? 25 : 12;
          const left = Math.round(canvas.width*profile.columns[k])+margin, right = Math.round(canvas.width*profile.columns[k+1])-margin;
          const crop = createCanvas(right-left+20,row.bottom-row.top+20), c = crop.getContext('2d');
          c.fillStyle = '#fff'; c.fillRect(0,0,crop.width,crop.height);
          c.drawImage(canvas,left,row.top,right-left,row.bottom-row.top,10,10,right-left,row.bottom-row.top);
          await worker.setParameters({ tessedit_char_whitelist: [0,2,3].includes(k) ? '0123456789' : '', tessedit_pageseg_mode: '6' });
          let {data} = await worker.recognize(crop.toBuffer('image/png'));
          if ([0,2,3].includes(k) && !data.text.trim()) {
            await worker.setParameters({ tessedit_pageseg_mode: '8' });
            ({data} = await worker.recognize(crop.toBuffer('image/png')));
          }
          cells.push({text:data.text,confidence:data.confidence});
        }
        items.push(recordFromCells(cells,PILOT_SOURCE,i+1,profile.first+j));
      }
      console.log(`Page ${i+1}: ${rows.length} rows extracted; visual review required.`);
    }
    const report = { schemaVersion: 1, checkedAt: new Date().toISOString(), source: { ...PILOT_SOURCE, pages: undefined,
      documentHash: sha256(bytes) }, items };
    const tempPath = reportPath+'.tmp'; await writeFile(tempPath,JSON.stringify(report,null,2)+'\n'); await rename(tempPath,reportPath);
    console.log(`Extracted ${items.length} records: ${reportPath}. No candidate verification or catalog publication performed.`);
  } finally { await worker.terminate(); await loading.destroy(); }
}
main().catch(error => { console.error(error.message + (error.cause?.code ? ' (' + error.cause.code + ')' : '')); process.exitCode=1; });
