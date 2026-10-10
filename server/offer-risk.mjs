/**
 * Screening of vacancies and invitations for typical fraud patterns
 * (docs/employer_protection.md). `block` signals reject the offer, `warn`
 * signals are returned to the employer only. Rules are transparent and
 * deterministic; they flag patterns, not intent.
 */
export const OFFER_RISK_POLICY = { version: 'offer-risk-v1', invitationsPerDay: 30 };

const normalize = text => String(text || '').toLowerCase().replace(/ё/gu, 'е');
const rules = [
  { code: 'prepayment', severity: 'block', message: 'Требование оплаты от кандидата (предоплата, обучение, депозит, взнос).',
    pattern: /предоплат|(внесит|оплатит|переведит|заплатит|оплатить|внести|перевести|заплатить|оплачивает\s+кандидат)\p{L}*\s+(\p{L}+\s+){0,2}(обучени|стажировк|курс|доступ|депозит|залог|взнос|материал|регистрац|оформлени)|платн\p{L}+\s+обучени|обучени\p{L}*\s+(за\s+свой\s+счет|платно)|страховой\s+взнос|вступительн\p{L}*\s+взнос/gu,
    // Benefits paid by the employer are not a demand on the candidate.
    except: /за\s+сч[её]т\s+компани|компани\p{L}*\s+(оплачива|компенсир)|компенсац|компенсир|бесплатн/u },
  { code: 'sensitive-data', severity: 'block', message: 'Запрос данных карты, кодов из SMS или паспорта до найма.',
    pattern: /номер\p{L}*\s+(банковской\s+)?карт|данн\p{L}+\s+карт|cvv|cvc|код\p{L}*\s+из\s+(смс|sms)|(смс|sms)[-\s]код|паспортн\p{L}+\s+данн|(скан|фото)\p{L}*\s+паспорт/u },
  { code: 'off-platform', severity: 'warn', message: 'Просьба связаться вне платформы: контакты открываются после принятия приглашения.',
    pattern: /telegram|телеграм|whatsapp|ватсап|вотсап|t\.me\/|wa\.me\/|viber|вайбер/u },
  { code: 'contacts-in-text', severity: 'warn', message: 'Контакты в тексте: обмен контактами идёт через приглашение или отклик.',
    pattern: /[^\s@]+@[^\s@]+\.[a-z]{2,}|(\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/u },
  { code: 'easy-money', severity: 'warn', message: 'Формулировки «лёгкого заработка» характерны для фиктивных вакансий.',
    pattern: /пассивн\p{L}+\s+доход|без\s+вложений|легк\p{L}+\s+(заработ|деньг)|быстр\p{L}+\s+заработ|криптовалют\p{L}*\s+(доход|заработ)|доход\s+от\s+\d+\s*(000|тыс)\s+в\s+день/u },
];
// Monthly ceilings well above the market for each grade; higher offers are a fraud signal, not an error.
const salaryCeiling = { Intern: 250000, Junior: 450000, Middle: 800000, Senior: 1300000, Lead: 2000000 };

export function assessOfferRisk({ title = '', description = '', salaryFrom, salaryTo, grade } = {}) {
  const text = normalize(title + '\n' + description);
  const signals = rules.filter(rule => {
    rule.pattern.lastIndex = 0;
    if (!rule.except) return rule.pattern.test(text);
    // A match counts only when the nearby text does not describe an employer-paid benefit.
    return [...text.matchAll(rule.pattern)].some(match => !rule.except.test(text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40)));
  }).map(({ code, severity, message }) => ({ code, severity, message }));
  if (grade && Number.isFinite(salaryFrom) && salaryCeiling[grade] && salaryFrom > salaryCeiling[grade]) {
    signals.push({ code: 'salary-anomaly', severity: 'warn', message: `Нижняя граница зарплаты выше типичной для грейда ${grade}: проверьте сумму.` });
  }
  if (Number.isFinite(salaryFrom) && Number.isFinite(salaryTo) && salaryFrom > 0 && salaryTo > salaryFrom * 3) {
    signals.push({ code: 'salary-range', severity: 'warn', message: 'Вилка шире чем в три раза: кандидаты воспринимают её как непрозрачную.' });
  }
  const level = signals.some(signal => signal.severity === 'block') ? 'block' : signals.length ? 'warn' : 'ok';
  return { level, signals, policy: OFFER_RISK_POLICY.version };
}

/** Message for a rejected offer; the employer sees every blocking reason. */
export function blockedMessage(risk) {
  return 'Предложение не опубликовано: ' + risk.signals.filter(signal => signal.severity === 'block').map(signal => signal.message.replace(/\.$/u, '')).join('; ')
    + '. Платформа не допускает платы и личных данных от кандидата до найма.';
}
