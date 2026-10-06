/* Local, isolated adapter around the public Mammoth and Tesseract.js APIs.
 * No resume data or recognition requests leave this worker or the browser. */
let ocr;
let stopped = false;
const nestedWorkers = new Set();
// Capture workers only inside this dedicated adapter, including initialization,
// so cancelling a model download also terminates its child worker immediately.
const NativeWorker = self.Worker;
self.Worker = class extends NativeWorker {
  constructor(...args) {
    super(...args);
    nestedWorkers.add(this);
  }
};
const local = relative => new URL(relative, self.location.href).href;
self.onmessage = async ({ data: message }) => {
  const { id, action } = message;
  if (action === 'stop') {
    stopped = true;
    for (const worker of nestedWorkers) worker.terminate();
    nestedWorkers.clear();
    self.postMessage({ id, ok: true });
    self.close();
    return;
  }
  try {
    let value;
    if (action === 'initOcr') {
      self.importScripts(local('tesseract/tesseract.min.js'));
      ocr = await self.Tesseract.createWorker(['rus', 'eng'], 1, {
        workerPath: local('tesseract/worker.min.js'),
        corePath: local('tesseract/core'),
        langPath: local('tesseract/lang'),
        workerBlobURL: false,
        gzip: true,
        cacheMethod: 'write',
        cachePath: 'predel-tessdata-best-4.1.0',
        logger: progress => {
          if (!stopped) self.postMessage({ id, progress: { status: progress.status, progress: progress.progress } });
        },
        errorHandler: () => {
          if (!stopped) self.postMessage({ id, ok: false, error: 'Не удалось запустить распознавание. Попробуйте другой файл.' });
        },
      });
      await ocr.setParameters({ tessedit_pageseg_mode: 3, preserve_interword_spaces: '1', user_defined_dpi: '300' });
      value = true;
    } else if (action === 'recognize') {
      if (!ocr) throw new Error('OCR is not initialized');
      const result = await ocr.recognize(new Uint8Array(message.buffer));
      value = result.data.text;
    } else if (action === 'docx') {
      self.importScripts(local('mammoth.browser.min.js'));
      const result = await self.mammoth.extractRawText({ arrayBuffer: message.buffer });
      value = result.value;
    } else {
      throw new Error('Unsupported document action');
    }
    if (!stopped) self.postMessage({ id, ok: true, value });
  } catch {
    if (!stopped) self.postMessage({ id, ok: false, error: 'Не удалось прочитать документ. Попробуйте PDF, DOCX или изображение.' });
  }
};
