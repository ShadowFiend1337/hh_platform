import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { dateLabel, gradeLabels, specializationLabels, type Candidate } from './model.ts';

/** Generates selectable Unicode text locally; contact permission comes from the caller's authorized view. */
export async function createProfilePdf(person: Candidate, contacts: boolean, fontBytes: Uint8Array): Promise<Uint8Array> {
  const showContacts = contacts && !person.demoProfile;
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(fontBytes, { subset: true });
  document.setTitle('Профиль · ' + person.name); document.setAuthor('predel');
  document.setSubject('Профиль кандидата');
  const layout = new ProfileLayout(document, font);
  layout.text('predel', 13, rgb(0, .42, .91)); layout.space(12);
  layout.text(person.name || 'Профиль кандидата', 25); layout.space(8);
  layout.text(specializationLabels[person.confirmed?.specialization || person.specialization], 15);
  if (person.professionalRole || person.industry) layout.text([person.professionalRole, person.industry].filter(Boolean).join(' · '));
  if (person.synthetic) layout.text('Демонстрационный профиль. Данные и результаты вымышленные.', 10, rgb(.38, .41, .46));
  layout.space(12);
  layout.text('Грейд: ' + (person.confirmed ? gradeLabels[person.confirmed.grade] + ' · подтверждён тестом ' + dateLabel(person.confirmed.date) : 'не подтверждён'));
  if (person.confirmed) layout.text('Тест: ' + person.confirmed.score + ' из 100');
  layout.text('Опыт: ' + (person.experience || 'Не указан'));
  if (person.city || person.format) layout.text([person.city, person.format].filter(Boolean).join(' · '));
  layout.section('О себе', person.bio);
  layout.section('Стек', person.stack.join(', '));
  layout.section('Софт-скиллы · самооценка', person.softSkills.join(', '));
  layout.section('Места работы и проекты', person.workHistory);
  layout.section('Достижения', person.careerAchievements);
  layout.section('Образование', person.education);
  layout.section('Языки', person.languages);
  layout.section(person.synthetic ? 'ФСП · демонстрационные сведения' : 'Достижения ФСП',
    person.achievements.length ? person.achievements.map(item => [item.title, item.result, item.year].filter(Boolean).join(' · ')).join('\n') : 'Истории ФСП пока нет');
  layout.section('Контакты', person.demoProfile ? 'Недоступны для демопрофиля' : showContacts ? [person.email, person.phone].filter(Boolean).join('\n') : 'Контакты скрыты');
  if (showContacts) layout.section('Портфолио', person.portfolio);
  layout.finish();
  return document.save();
}

class ProfileLayout {
  private page: PDFPage;
  private y = 792;
  private readonly margin = 44;
  private readonly width = 507;
  private readonly supported: Set<number>;
  private readonly document: PDFDocument;
  private readonly font: PDFFont;
  constructor(document: PDFDocument, font: PDFFont) {
    this.document = document; this.font = font;
    this.page = document.addPage([595, 842]); this.supported = new Set(font.getCharacterSet());
  }
  space(size = 12) { this.y -= size; }
  private ensure(height: number) {
    if (this.y - height < 58) { this.page = this.document.addPage([595, 842]); this.y = 792; }
  }
  private clean(value: string) {
    return [...value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')]
      .map(char => char === '\n' || char === '\r' || char === '\t' || this.supported.has(char.codePointAt(0)!) ? char : '?').join('');
  }
  text(value: string, size = 11, color = rgb(.125, .129, .149)) {
    const lineHeight = size * 1.5;
    for (const paragraph of this.clean(value).replace(/\r\n?/g, '\n').split('\n')) {
      let line = '';
      for (const word of paragraph.trim().split(/\s+/u)) {
        const proposed = line ? line + ' ' + word : word;
        if (this.font.widthOfTextAtSize(proposed, size) <= this.width) { line = proposed; continue; }
        if (line) { this.draw(line, size, lineHeight, color); line = ''; }
        // Long URLs and other words must wrap too; text is never clipped off the page.
        for (const char of word) {
          if (this.font.widthOfTextAtSize(line + char, size) > this.width && line) { this.draw(line, size, lineHeight, color); line = ''; }
          line += char;
        }
      }
      this.draw(line, size, lineHeight, color);
    }
  }
  private draw(line: string, size: number, height: number, color: ReturnType<typeof rgb>) {
    this.ensure(height); this.page.drawText(line, { x: this.margin, y: this.y, size, font: this.font, color }); this.y -= height;
  }
  section(title: string, value?: string) {
    if (!value?.trim()) return;
    this.space(18); this.ensure(44); this.text(title, 13); this.space(4); this.text(value.trim());
  }
  finish() {
    const pages = this.document.getPages();
    pages.forEach((page, index) => {
      page.drawLine({ start: { x: 44, y: 43 }, end: { x: 551, y: 43 }, thickness: .5, color: rgb(.9, .91, .93) });
      page.drawText('predel · ' + (index + 1) + ' / ' + pages.length, { x: 44, y: 27, size: 9, font: this.font, color: rgb(.38, .41, .46) });
    });
  }
}
