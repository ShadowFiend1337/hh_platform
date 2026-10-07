import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RequestError } from '../assessment.mjs';
const defaultPath = fileURLToPath(new URL('./data/fsp-public.json',import.meta.url));
const normalize = value => value.toLocaleLowerCase('ru-RU').replace(/ё/gu,'е').split(/\s+/u);
export class PublicFspCatalog {
  constructor({ path = defaultPath, data } = {}) { this.path = path; this.data = data; }
  read() {
    // The importer writes a review report; only a reviewed snapshot is served here.
    let data;
    try { data = this.data || JSON.parse(readFileSync(this.path,'utf8')); }
    catch { throw new RequestError(503,'Каталог публичных протоколов временно недоступен.'); }
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.items) || !Array.isArray(data.sources)
      || data.items.some(item => item.extractionStatus !== 'reviewed' || item.identityVerified !== false
        || !data.sources.some(source => source.id === item.sourceId && source.reviewedAt))) {
      throw new RequestError(503,'Публичные протоколы ожидают проверки распознавания.');
    }
    return data;
  }
  get(id) {
    const data = this.read(), item = data.items.find(item => item.id === id);
    if (!item) throw new RequestError(404,'Запись протокола не найдена.');
    const source = data.sources.find(source => source.id === item.sourceId);
    return { ...item, title: source.title, discipline: source.discipline, occurredOn: source.occurredOn,
      sourceUrl: source.sourceUrl, documentHash: source.documentHash, sourceReviewedAt: source.reviewedAt };
  }
  search(name, limit = '20', offset = '0') {
    if (typeof name !== 'string' || name.length > 100 || !/^[А-ЯЁа-яё-]+(?:\s+[А-ЯЁа-яё-]+){1,3}$/u.test(name.trim())
      || normalize(name.trim()).some(token => token.length < 2)) throw new RequestError(400,'Укажите фамилию и имя целиком; можно добавить отчество.');
    if (!/^\d{1,2}$/u.test(String(limit)) || Number(limit)<1 || Number(limit)>50
      || !/^\d{1,6}$/u.test(String(offset))) throw new RequestError(400,'Недопустимые параметры страницы.');
    const data = this.read(), tokens = normalize(name.trim());
    const matched = data.items.filter(item => tokens.every(token => normalize(item.participantName).includes(token)));
    return { provider: 'fsp-public', status: 'unverified', identityVerified: false, checkedAt: data.checkedAt,
      coverage: { sources: data.sources.length, records: data.items.length, complete: false },
      total: matched.length, limit: Number(limit), offset: Number(offset),
      items: matched.slice(Number(offset),Number(offset)+Number(limit)).map(item => {
        const source = data.sources.find(source => source.id === item.sourceId);
        return { ...item, status: 'unverified', title: source.title, discipline: source.discipline, occurredOn: source.occurredOn,
          sourceUrl: source.sourceUrl, documentHash: source.documentHash, sourceReviewedAt: source.reviewedAt };
      }) };
  }
}
