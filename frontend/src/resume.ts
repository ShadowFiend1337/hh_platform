import { parseResumeText, type ResumeFields } from './resume-parser';

export type { ResumeFields } from './resume-parser';
export interface ResumeResult {
  fields: ResumeFields;
  text: string;
  method: 'text' | 'ocr' | 'mixed';
  pages: number;
  truncatedFields: (keyof ResumeFields)[];
}
export interface ResumeOptions {
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 10;
const MAX_TEXT_LENGTH = 100_000;
const MAX_INPUT_PIXELS = 25_000_000;
const MAX_CANVAS_PIXELS = 6_000_000;
const MAX_CANVAS_SIDE = 4000;
const localAsset = (relative: string) => new URL(`${import.meta.env.BASE_URL}resume-assets/${relative}`, window.location.origin).href;
const aborted = () => new DOMException('Распознавание отменено', 'AbortError');
const checkAbort = (signal?: AbortSignal) => { if (signal?.aborted) throw aborted(); };

function guarded<T>(promise: Promise<T>, options: ResumeOptions, timeout: number, cancel?: () => void): Promise<T> {
  checkAbort(options.signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      action();
    };
    const abort = () => finish(() => { cancel?.(); reject(aborted()); });
    const timer = setTimeout(() => finish(() => {
      cancel?.();
      reject(new Error('Распознавание заняло слишком много времени. Попробуйте меньший файл.'));
    }), timeout);
    options.signal?.addEventListener('abort', abort, { once: true });
    promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    if (options.signal?.aborted) abort();
  });
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; progress?: (value: number) => void };
class DocumentWorker {
  private worker: Worker;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private stopPromise?: Promise<void>;
  private stopFinished?: () => void;

  constructor() {
    this.worker = new Worker(localAsset('resume-document-worker.js'));
    this.worker.onmessage = ({ data }) => {
      if (data.id === -1) { this.stopFinished?.(); return; }
      const pending = this.pending.get(data.id);
      if (!pending) return;
      if (data.progress) { pending.progress?.(Number(data.progress.progress) || 0); return; }
      this.pending.delete(data.id);
      if (data.ok) pending.resolve(data.value);
      else pending.reject(new Error(data.error || 'Не удалось распознать текст.'));
    };
    this.worker.onerror = () => this.rejectAll(new Error('Не удалось прочитать документ. Попробуйте другой файл.'));
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  async request<T>(action: string, options: ResumeOptions, buffer?: ArrayBuffer, progress?: (value: number) => void): Promise<T> {
    checkAbort(options.signal);
    const promise = new Promise<T>((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve: value => resolve(value as T), reject, progress });
      this.worker.postMessage({ id, action, buffer }, buffer ? [buffer] : []);
    });
    return guarded(promise, options, action === 'recognize' ? 120_000 : 60_000, () => { void this.stop(); });
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer);
        this.worker.terminate();
        this.rejectAll(aborted());
        resolve();
      };
      const timer = setTimeout(finish, 250);
      this.stopFinished = finish;
      this.worker.postMessage({ id: -1, action: 'stop' });
    });
    return this.stopPromise;
  }
}

/** Validate the ZIP directory before letting a DOCX decoder allocate expanded data. */
export function validateDocx(buffer: ArrayBuffer): void {
  const data = new DataView(buffer);
  let end = -1;
  for (let offset = data.byteLength - 22; offset >= Math.max(0, data.byteLength - 65_557); offset--) {
    if (data.getUint32(offset, true) === 0x06054b50 && offset + 22 + data.getUint16(offset + 20, true) === data.byteLength) { end = offset; break; }
  }
  const invalid = () => new Error('Не удалось прочитать DOCX. Сохраните резюме в PDF или DOCX без пароля.');
  if (end < 0) throw invalid();
  const count = data.getUint16(end + 10, true);
  const directoryBytes = data.getUint32(end + 12, true);
  const directoryStart = data.getUint32(end + 16, true);
  if (data.getUint16(end + 4, true) || data.getUint16(end + 6, true)
    || data.getUint16(end + 8, true) !== count || count === 0 || count > 1000
    || directoryBytes === 0xffffffff || directoryStart === 0xffffffff
    || directoryStart + directoryBytes > end) throw invalid();
  const decoder = new TextDecoder();
  let offset = directoryStart;
  let expanded = 0;
  let hasDocument = false;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || data.getUint32(offset, true) !== 0x02014b50) throw invalid();
    const flags = data.getUint16(offset + 8, true);
    const compression = data.getUint16(offset + 10, true);
    const size = data.getUint32(offset + 24, true);
    const nameLength = data.getUint16(offset + 28, true);
    const extraLength = data.getUint16(offset + 30, true);
    const commentLength = data.getUint16(offset + 32, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) || ![0, 8].includes(compression) || size === 0xffffffff || next > end) throw invalid();
    expanded += size;
    if (size > 20 * 1024 * 1024 || expanded > 40 * 1024 * 1024) throw new Error('DOCX слишком большой после распаковки. Сохраните резюме в PDF.');
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
    if (name === 'word/document.xml') hasDocument = true;
    offset = next;
  }
  if (!hasDocument || offset !== directoryStart + directoryBytes) throw invalid();
}

function boundedText(text: string): string {
  if (text.length > MAX_TEXT_LENGTH) throw new Error('В документе слишком много текста. Прикрепите только резюме.');
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\u00a0/g, ' ').trim();
}

function dimensions(buffer: ArrayBuffer): { width: number; height: number } | undefined {
  const data = new DataView(buffer);
  if (data.byteLength >= 24 && data.getUint32(0) === 0x89504e47 && data.getUint32(4) === 0x0d0a1a0a) {
    return { width: data.getUint32(16), height: data.getUint32(20) };
  }
  if (data.byteLength >= 16 && data.getUint32(0) === 0x52494646 && data.getUint32(8) === 0x57454250) {
    const chunk = data.getUint32(12);
    if (chunk === 0x56503858 && data.byteLength >= 30) return { width: 1 + (data.getUint32(24, true) & 0xffffff), height: 1 + (data.getUint32(26, true) >>> 8) };
    if (chunk === 0x5650384c && data.byteLength >= 25 && data.getUint8(20) === 0x2f) {
      const bits = data.getUint32(21, true);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
    if (chunk === 0x56503820 && data.byteLength >= 30 && data.getUint8(23) === 0x9d && data.getUint8(24) === 0x01 && data.getUint8(25) === 0x2a) {
      return { width: data.getUint16(26, true) & 0x3fff, height: data.getUint16(28, true) & 0x3fff };
    }
  }
  if (data.byteLength >= 4 && data.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 4 < data.byteLength) {
      if (data.getUint8(offset) !== 0xff) break;
      const marker = data.getUint8(offset + 1);
      if (marker === 0xff) { offset++; continue; }
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const length = data.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > data.byteLength) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        return { width: data.getUint16(offset + 7), height: data.getUint16(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return undefined;
}

function checkDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
    || width * height > MAX_INPUT_PIXELS || Math.max(width, height) > 12_000) {
    throw new Error('Изображение слишком большое. Уменьшите его до 25 мегапикселей.');
  }
}

function canvasScale(width: number, height: number, preferred = 1) {
  return Math.min(preferred, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)), MAX_CANVAS_SIDE / Math.max(width, height));
}

function canvasBuffer(canvas: HTMLCanvasElement, options: ResumeOptions): Promise<ArrayBuffer> {
  return guarded(new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob); else reject(new Error('Не удалось подготовить изображение.'));
  }, 'image/png')).then(blob => blob.arrayBuffer()), options, 15_000);
}

function nativePdfText(items: Array<unknown>): string {
  const lines: string[] = [];
  let line = '';
  let baseline: number | undefined;
  for (const raw of items) {
    const item = raw as { str?: string; transform?: number[]; height?: number; hasEOL?: boolean };
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5];
    if (baseline !== undefined && y !== undefined && Math.abs(y - baseline) > Math.max(3, (item.height || 10) * .5)) {
      if (line.trim()) lines.push(line.trim());
      line = '';
    }
    line += (line && !/\s$/.test(line) ? ' ' : '') + item.str;
    baseline = y;
    if (item.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; baseline = undefined; }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join('\n');
}

function readableText(text: string): boolean {
  const letters = text.match(/[\p{L}\p{N}]/gu)?.length || 0;
  const replacements = text.match(/\ufffd/g)?.length || 0;
  return letters >= 100 && replacements < Math.max(2, text.length * .015);
}

function hasLargeRasterContent(
  operations: { fnArray: number[]; argsArray: unknown[] },
  ops: Record<string, number>, pageWidth: number, pageHeight: number,
): boolean {
  // A scanned page may have a text layer for its header only. Inspect image
  // placement, rather than source pixel size, so small portraits keep native text.
  let matrix = [1, 0, 0, 1, 0, 0];
  const saved: number[][] = [];
  const multiply = (left: number[], right: number[]) => [
    left[0] * right[0] + left[2] * right[1], left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3], left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4], left[1] * right[4] + left[3] * right[5] + left[5],
  ];
  const area = (value: number[]) => Math.abs(value[0] * value[3] - value[1] * value[2]);
  let imageArea = 0;
  for (let index = 0; index < operations.fnArray.length; index++) {
    const op = operations.fnArray[index];
    const args = operations.argsArray[index] as unknown[] | null;
    if (op === ops.save) saved.push([...matrix]);
    else if (op === ops.restore) matrix = saved.pop() || [1, 0, 0, 1, 0, 0];
    else if (op === ops.transform && args) matrix = multiply(matrix, args as number[]);
    else if (op === ops.paintFormXObjectBegin) {
      saved.push([...matrix]);
      if (args?.[0]) matrix = multiply(matrix, args[0] as number[]);
    } else if (op === ops.paintFormXObjectEnd) matrix = saved.pop() || [1, 0, 0, 1, 0, 0];
    else if ([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject].includes(op)) imageArea += area(matrix);
    else if (op === ops.paintImageXObjectRepeat && args) {
      imageArea += area(matrix) * Math.abs(Number(args[1]) * Number(args[2])) * ((args[3] as number[]).length / 2);
    } else if (op === ops.paintImageMaskXObjectRepeat && args) {
      imageArea += area(multiply(matrix, [Number(args[1]), Number(args[2]), Number(args[3]), Number(args[4]), 0, 0])) * ((args[5] as number[]).length / 2);
    } else if (op === ops.paintInlineImageXObjectGroup && args) {
      for (const entry of args[1] as { transform: number[] }[]) imageArea += area(multiply(matrix, entry.transform));
    } else if (op === ops.paintImageMaskXObjectGroup && args) {
      for (const entry of args[0] as { transform: number[] }[]) imageArea += area(multiply(matrix, entry.transform));
    }
    if (imageArea >= pageWidth * pageHeight * .25) return true;
  }
  return false;
}

export async function readResume(file: File, options: ResumeOptions = {}): Promise<ResumeResult> {
  checkAbort(options.signal);
  if (file.size > MAX_FILE_BYTES) throw new Error('Файл должен быть не больше 15 МБ.');
  if (!file.size) throw new Error('Файл пуст. Выберите другое резюме.');
  const extension = file.name.split('.').at(-1)?.toLowerCase() || '';
  if (!['pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'txt'].includes(extension)) {
    throw new Error('Поддерживаются PDF, DOCX, PNG, JPG, WebP и TXT.');
  }
  options.onProgress?.('Читаем резюме…');
  const buffer = await guarded(file.arrayBuffer(), options, 15_000);
  checkAbort(options.signal);
  let text = '';
  let pages = 1;
  let method: ResumeResult['method'] = 'text';
  let documentWorker: DocumentWorker | undefined;
  const getOcr = async () => {
    if (!documentWorker) {
      documentWorker = new DocumentWorker();
      options.onProgress?.('Готовим распознавание…');
      await documentWorker.request('initOcr', options);
    }
    return documentWorker;
  };
  try {
    if (extension === 'txt') {
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { throw new Error('Сохраните текстовое резюме в кодировке UTF-8.'); }
    } else if (extension === 'docx') {
      validateDocx(buffer);
      documentWorker = new DocumentWorker();
      text = await documentWorker.request<string>('docx', options, buffer);
    } else if (extension === 'pdf') {
      if (!new TextDecoder().decode(buffer.slice(0, 1024)).includes('%PDF-')) throw new Error('Это не PDF. Выберите файл резюме.');
      const pdfjs = await import('pdfjs-dist');
      checkAbort(options.signal);
      pdfjs.GlobalWorkerOptions.workerSrc = localAsset('pdf/pdf.worker.min.mjs');
      const task = pdfjs.getDocument({
        // PDF.js 6 removed the old eval path and its isEvalSupported switch.
        data: new Uint8Array(buffer), disableFontFace: true,
        cMapUrl: localAsset('pdf/cmaps/'), cMapPacked: true,
        standardFontDataUrl: localAsset('pdf/standard_fonts/'), wasmUrl: localAsset('pdf/wasm/'),
        maxImageSize: MAX_INPUT_PIXELS, canvasMaxAreaInBytes: MAX_CANVAS_PIXELS * 4,
        disableAutoFetch: true,
      });
      const destroy = () => { void task.destroy().catch(() => {}); };
      let nativePages = 0;
      let ocrPages = 0;
      try {
        const pdf = await guarded(task.promise, options, 30_000, destroy);
        pages = pdf.numPages;
        if (pages > MAX_PAGES) throw new Error('В резюме должно быть не больше 10 страниц.');
        const texts: string[] = [];
        for (let number = 1; number <= pages; number++) {
          checkAbort(options.signal);
          options.onProgress?.(`Читаем резюме · ${number}/${pages}`);
          const page = await guarded(pdf.getPage(number), options, 20_000, destroy);
          try {
            const content = await guarded(page.getTextContent(), options, 20_000, destroy);
            let pageText = nativePdfText(content.items);
            let useNative = readableText(pageText);
            if (useNative) {
              const operations = await guarded(page.getOperatorList(), options, 20_000, destroy);
              const [left, bottom, right, top] = page.view;
              useNative = !hasLargeRasterContent(operations, pdfjs.OPS, right - left, top - bottom);
            }
            if (useNative) {
              nativePages++;
            } else {
              const worker = await getOcr();
              options.onProgress?.(`Распознаём текст · ${number}/${pages}`);
              const viewport = page.getViewport({ scale: 1 });
              checkDimensions(viewport.width, viewport.height);
              const scale = canvasScale(viewport.width, viewport.height, 3);
              const renderViewport = page.getViewport({ scale });
              const canvas = document.createElement('canvas');
              canvas.width = Math.ceil(renderViewport.width);
              canvas.height = Math.ceil(renderViewport.height);
              const context = canvas.getContext('2d');
              if (!context) throw new Error('Браузер не поддерживает распознавание изображений.');
              try {
                const render = page.render({ canvas, canvasContext: context, viewport: renderViewport, background: '#ffffff' });
                await guarded(render.promise, options, 30_000, () => { render.cancel(); destroy(); });
                const image = await canvasBuffer(canvas, options);
                pageText = await worker.request<string>('recognize', options, image);
                ocrPages++;
              } finally { canvas.width = 1; canvas.height = 1; }
            }
            texts.push(boundedText(pageText));
            boundedText(texts.join('\n\n'));
          } finally { page.cleanup(); }
        }
        text = texts.join('\n\n');
        method = nativePages && ocrPages ? 'mixed' : ocrPages ? 'ocr' : 'text';
      } catch (error) {
        if (error instanceof Error && (error.name === 'PasswordException' || error.name === 'InvalidPDFException')) {
          throw new Error('PDF защищён паролем или повреждён. Сохраните открытое резюме заново.');
        }
        throw error;
      } finally { await task.destroy().catch(() => {}); }
    } else {
      const size = dimensions(buffer);
      if (!size) throw new Error('Изображение повреждено. Выберите PNG, JPG или WebP.');
      checkDimensions(size.width, size.height);
      const bitmap = await guarded(createImageBitmap(new Blob([buffer], { type: extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg' })), options, 20_000);
      const canvas = document.createElement('canvas');
      try {
        checkDimensions(bitmap.width, bitmap.height);
        const scale = canvasScale(bitmap.width, bitmap.height);
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Браузер не поддерживает распознавание изображений.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const worker = await getOcr();
        options.onProgress?.('Распознаём текст…');
        text = await worker.request<string>('recognize', options, await canvasBuffer(canvas, options));
        method = 'ocr';
      } finally { bitmap.close(); canvas.width = 1; canvas.height = 1; }
    }
    checkAbort(options.signal);
    text = boundedText(text);
    if ((text.match(/\p{L}/gu)?.length || 0) < 10) throw new Error('Текст не найден. Прикрепите более чёткое резюме.');
    const truncatedFields = new Set<keyof ResumeFields>();
    const fields = parseResumeText(text, { onTruncate: field => truncatedFields.add(field) });
    if (!Object.keys(fields).length) throw new Error('Не удалось найти данные анкеты. Попробуйте другой файл.');
    return { fields, text, method, pages, truncatedFields: [...truncatedFields] };
  } finally { await documentWorker?.stop(); }
}
