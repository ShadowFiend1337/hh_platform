import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Static SVG charts for the README, built only from measured or simulated data files:
//   docs/charts/mode-focus.json            — npm run measure:modes (interface measurement)
//   docs/charts/assessment-validation.json — npm run validate:assessment-model (IRT simulation)
const dir = fileURLToPath(new URL('../docs/charts/', import.meta.url));
const read = name => JSON.parse(readFileSync(dir + name, 'utf8'));
const colors = { accent: '#006ce8', base: '#b9bec9', ink: '#1d2129', muted: '#626875', line: '#e6e8ee' };
const font = "Manrope, 'Segoe UI', Arial, sans-serif";
const escape = text => String(text).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

/**
 * Paired horizontal bars: each row has its own scale (the larger value fills the track),
 * so metrics with different units can share one figure; values are printed.
 */
function pairedBars({ title, subtitle, legend, rows, note, width = 720 }) {
  const left = 260, right = 60, top = 118, rowHeight = 64, bar = 16, track = width - left - right;
  const height = top + rows.length * rowHeight + 46;
  const parts = [
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="#fff" stroke="${colors.line}"/>`,
    `<text x="28" y="40" font-size="19" font-weight="700" fill="${colors.ink}">${escape(title)}</text>`,
    `<text x="28" y="64" font-size="13" fill="${colors.muted}">${escape(subtitle)}</text>`,
  ];
  legend.forEach((item, index) => {
    const x = 28 + index * 170;
    parts.push(`<rect x="${x}" y="80" width="12" height="12" rx="3" fill="${item.color}"/>`,
      `<text x="${x + 18}" y="90" font-size="12.5" fill="${colors.ink}">${escape(item.label)}</text>`);
  });
  rows.forEach((row, index) => {
    const y = top + index * rowHeight, scale = Math.max(...row.values.map(Math.abs), 1e-9);
    parts.push(`<text x="28" y="${y + 17}" font-size="13.5" font-weight="600" fill="${colors.ink}">${escape(row.label)}</text>`);
    if (row.hint) parts.push(`<text x="28" y="${y + 35}" font-size="11.5" fill="${colors.muted}">${escape(row.hint)}</text>`);
    row.values.forEach((value, series) => {
      const by = y + series * (bar + 6), length = Math.max(2, Math.round(track * value / scale));
      parts.push(`<rect x="${left}" y="${by}" width="${track}" height="${bar}" rx="4" fill="#f4f5f8"/>`,
        `<rect x="${left}" y="${by}" width="${length}" height="${bar}" rx="4" fill="${legend[series].color}"/>`,
        `<text x="${left + length + 8}" y="${by + 12.5}" font-size="12.5" font-weight="600" fill="${colors.ink}">${escape(row.format ? row.format(value) : value)}</text>`);
    });
  });
  parts.push(`<text x="28" y="${height - 20}" font-size="11.5" fill="${colors.muted}">${escape(note)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font}" role="img" aria-label="${escape(title)}">\n${parts.join('\n')}\n</svg>\n`;
}

/** Vertical grouped bars with a shared 0–100% axis. */
function groupedColumns({ title, subtitle, legend, groups, note, width = 720 }) {
  const left = 56, right = 24, top = 122, plot = 210, height = top + plot + 74;
  const groupWidth = (width - left - right) / groups.length, column = Math.min(28, groupWidth / (legend.length + 1.5));
  const parts = [
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="#fff" stroke="${colors.line}"/>`,
    `<text x="28" y="40" font-size="19" font-weight="700" fill="${colors.ink}">${escape(title)}</text>`,
    `<text x="28" y="64" font-size="13" fill="${colors.muted}">${escape(subtitle)}</text>`,
  ];
  legend.forEach((item, index) => {
    const x = 28 + index * 190;
    parts.push(`<rect x="${x}" y="80" width="12" height="12" rx="3" fill="${item.color}"/>`,
      `<text x="${x + 18}" y="90" font-size="12.5" fill="${colors.ink}">${escape(item.label)}</text>`);
  });
  for (const tick of [0, 25, 50, 75, 100]) {
    const y = top + plot - plot * tick / 100;
    parts.push(`<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" stroke="${colors.line}"/>`,
      `<text x="${left - 8}" y="${y + 4}" font-size="11" text-anchor="end" fill="${colors.muted}">${tick}%</text>`);
  }
  groups.forEach((group, index) => {
    const center = left + groupWidth * (index + 0.5), start = center - column * legend.length / 2 - (legend.length - 1) * 2;
    group.values.forEach((value, series) => {
      const h = Math.max(1, plot * value / 100), x = start + series * (column + 4), y = top + plot - h;
      parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${column}" height="${h.toFixed(1)}" rx="4" fill="${legend[series].color}"/>`,
        `<text x="${(x + column / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="11.5" font-weight="600" text-anchor="middle" fill="${colors.ink}">${Math.round(value)}</text>`);
    });
    parts.push(`<text x="${center.toFixed(1)}" y="${top + plot + 22}" font-size="12.5" text-anchor="middle" fill="${colors.ink}">${escape(group.label)}</text>`);
  });
  parts.push(`<text x="28" y="${height - 18}" font-size="11.5" fill="${colors.muted}">${escape(note)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${font}" role="img" aria-label="${escape(title)}">\n${parts.join('\n')}\n</svg>\n`;
}

const modes = read('mode-focus.json');
const legendModes = [{ label: 'Обычный режим', color: colors.base }, { label: 'Предельный режим', color: colors.accent }];
const e = modes.employer, c = modes.candidate;
writeFileSync(dir + 'modes.svg', pairedBars({
  title: 'Фокус: обычный и «Предельный» режим',
  subtitle: `Экран ${modes.viewport.width}×${modes.viewport.height}, демокаталог работодателя и компании для кандидата`,
  legend: legendModes,
  rows: [
    { label: 'Кандидатов на экране', hint: 'меньше — меньше переключений', values: [e.list.cards, e.deck.cards] },
    { label: 'Сведений о кандидате', hint: 'символов в карточке', values: [e.list.textPerCard, e.deck.textPerCard] },
    { label: `Действий на ${modes.reviews} решений`, hint: 'клики, клавиши и прокрутки', values: [e.list.actions, e.deck.actions] },
    { label: 'Вакансий на экране', hint: 'кабинет кандидата', values: [c.list.cards, c.deck.cards] },
    { label: 'Сведений о вакансии', hint: 'символов в карточке', values: [c.list.textPerCard, c.deck.textPerCard] },
  ],
  note: `Замер интерфейса Playwright ${modes.measuredAt} (npm run measure:modes), не эксперимент на людях.`,
}));

const validation = read('assessment-validation.json');
const pct = value => Math.round(value * 100);
const grades = validation.grades;
writeFileSync(dir + 'assessment-grades.svg', groupedColumns({
  title: 'Тест разделяет соседние грейды',
  subtitle: 'Доля подтвердивших: свой грейд и грейд на ступень выше',
  legend: [{ label: 'Свой грейд', color: colors.accent }, { label: 'На ступень выше', color: colors.base }],
  groups: grades.map((grade, index) => ({ label: grade, values: [pct(validation.matrix[grade][grade]),
    index < grades.length - 1 ? pct(validation.matrix[grade][grades[index + 1]]) : 0] })),
  note: `Симуляция IRT 3PL: ${validation.perCell} синтетических кандидатов на ячейку, настоящая сборка попыток (npm run validate:assessment-model).`,
}));
const single = validation.retest.single, clarified = validation.retest.clarified;
writeFileSync(dir + 'assessment-retest.svg', groupedColumns({
  title: 'Уточняющий блок точнее решает пограничные случаи',
  subtitle: `Решение «подтверждён / нет» против истинного уровня; блок из 6 вопросов получают ${pct(clarified.clarifiedShare)}% попыток с баллом 55–74`,
  legend: [{ label: '12 вопросов', color: colors.base }, { label: 'С уточняющим блоком', color: colors.accent }],
  groups: [
    { label: 'Точность решения', values: [pct(single.accuracy), pct(clarified.accuracy)] },
    { label: 'Ошибочно не подтверждены', values: [pct(single.falseFail), pct(clarified.falseFail)] },
    { label: 'Ошибочно подтверждены', values: [pct(single.falsePass), pct(clarified.falsePass)] },
    { label: 'Совпадение при пересдаче', values: [pct(single.agreement), pct(clarified.agreement)] },
  ],
  note: 'Симуляция на синтетических кандидатах; реальные параметры заданий даёт пилот в динамическом банке.',
}));
console.log('docs/charts: modes.svg, assessment-grades.svg, assessment-retest.svg');
