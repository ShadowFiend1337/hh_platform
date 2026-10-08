import { createHash } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const PILOT_SOURCE = {
  id: 'fsp-cup-2025-algorithms-final',
  sourceUrl: 'https://fsp-russia.ru/upload/iblock/2fd/go7v4ekr13s1wwepx7poocbxgxd2u92i.pdf',
  discoveryUrl: 'https://fsp-russia.ru/about/documents/',
  title: 'Кубок России 2025 — алгоритмическое программирование, финал',
  discipline: 'algorithms', occurredOn: '2025-05-25', participation: 'individual',
  expectedRows: 24, expectedPages: 2, parserVersion: 'fsp-algorithms-grid-v1',
  pages: [
    { columns: [.098,.188,.488,.602,.734,.905], top: .529, bottom: .917, first: 1, count: 11 },
    { columns: [.097,.189,.488,.603,.735,.908], top: .073, bottom: .535, first: 12, count: 13 },
  ],
};

// This layout is deliberately narrow. A new protocol needs its own reviewed profile.
export function gridRows(image, profile) {
  const { data, width, height } = image;
  const left = Math.ceil(width * profile.columns[0]) + 6;
  const right = Math.floor(width * profile.columns.at(-1)) - 6;
  const bands = [];
  for (let y = Math.floor(height * profile.top); y <= Math.ceil(height * profile.bottom); y++) {
    let dark = 0;
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4;
      if (Math.max(data[i], data[i+1], data[i+2]) < 160) dark++;
    }
    if (dark / (right - left) >= .7) {
      const last = bands.at(-1);
      if (last && y - last[1] <= 4) last[1] = y;
      else bands.push([y,y]);
    }
  }
  if (bands.length !== profile.count + 1) throw new Error(`Layout changed: expected ${profile.count + 1} row boundaries, got ${bands.length}`);
  return bands.slice(0,-1).map((band,i) => ({ top: band[1] + 4, bottom: bands[i+1][0] - 4 }));
}

export function recordFromCells(cells, source, page, expectedRank) {
  const clean = value => value.replace(/\s+/gu, ' ').trim();
  const [rank, name, solved, time, region] = cells.map(cell => clean(cell.text));
  if (!/^\d{1,3}$/u.test(rank) || Number(rank) !== expectedRank || !/^\d{1,2}$/u.test(solved)
    || !/^\d{1,4}$/u.test(time) || !/^[А-ЯЁ][а-яё-]+(?: [А-ЯЁ][а-яё-]+){2}$/u.test(name)
    || !region || region.length > 100) throw new Error(`Invalid OCR row on page ${page}, rank ${expectedRank}: ${JSON.stringify([rank,name,solved,time,region])}`);
  return { id: sha256(`${source.id}\0${expectedRank}`), sourceId: source.id, participantName: name,
    place: Number(rank), solvedTasks: Number(solved), completionTime: Number(time), region,
    participation: 'individual', role: 'athlete', sourcePage: page,
    extractionConfidence: Math.round(Math.min(...cells.map(cell => cell.confidence)) * 100) / 100,
    extractionStatus: 'needs_review', identityVerified: false };
}

export function discoverProtocols(html) {
  const text = value => value.replace(/<[^>]*>/gu,' ').replace(/&quot;/gu,'"').replace(/&amp;/gu,'&').replace(/\s+/gu,' ').trim();
  const links = new Map();
  for (const [,title,path] of html.matchAll(/<h5\b[^>]*>([\s\S]*?)<\/h5>[\s\S]*?<a\b[^>]*href="([^"]+)"/gu)) {
    const name = text(title);
    if (!/протокол|турнирная таблица/iu.test(name) || /судей|ЕРAИ|ЕРАИ|денежных|правления|№21/iu.test(name)
      || !/^\/upload\/iblock\/[a-z\d]+\/[a-z\d]+\.pdf$/iu.test(path)) continue;
    links.set(path,{ title: name, sourceUrl: 'https://fsp-russia.ru' + path });
  }
  return [...links.values()];
}
