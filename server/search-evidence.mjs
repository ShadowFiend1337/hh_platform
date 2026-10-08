// Transparent evidence constraints supplement neural similarity; they do not
// certify a person's competence or turn arbitrary query words into filters.
// Only the named methods below have a literal, bounded requirement policy.
export const TASK_EVIDENCE_POLICY = 'explicit-professional-concepts-with-treatment-effects-v2';

const boundary = expression => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${expression})(?![\\p{L}\\p{N}_])`, 'giu');
const normalize = text => String(text || '').normalize('NFKC').replaceAll('ё', 'е');
const words = '[\\p{L}\\p{N}_-]+';

// NFC reading concerns a physical tag and a short-range radio interaction,
// rather than displaying/scanning a printed identifier or emulating a card.
// https://nfc-forum.org/learn/nfc-technology/
// WebAuthn can use platform or roaming authenticators. Its name alone does not
// establish experience with an external physical security key.
// https://www.w3.org/TR/webauthn/#authenticator-attachment-modality
// Hardware brands use their full key names, never a generic "Titan" token.
// https://www.yubico.com/products/how-the-yubikey-works/
// https://cloud.google.com/security/products/titan-security-key
const concepts = [
  // CATE/uplift estimates a treatment-induced difference in outcomes, rather
  // than baseline purchase/churn propensity. This requirement checks claimed
  // task evidence only; it does not validate the causal model or its accuracy.
  // https://www.pywhy.org/EconML/spec/estimation/dml.html
  ['individual-treatment-effect', 'Индивидуальный эффект воздействия', String.raw`uplift|cate|conditional\s+average\s+treatment\s+effects?|индивидуальн[а-я]*\s+(?:причинн[а-я]*\s+)?эффект[а-я]*\s+(?:воздействи[а-я]*|вмешательств[а-я]*)`],
  ['nfc', 'NFC', String.raw`nfc|near[ -]field communication|бесконтактн[а-я]*\s+(?:метк[а-я]*|карт[а-я]*)`],
  ['ble', 'Bluetooth / BLE', String.raw`bluetooth(?:\s+low\s+energy)?|ble|gatt|блюту[зс][а-я]*`],
  ['barcode', 'Штрихкод', String.raw`bar[ -]?codes?|штрих[ -]?код[а-я]*|баркод[а-я]*`],
  ['qr', 'QR', String.raw`qr(?:[ -]?code)?|qr[ -]?код[а-я]*|куар[ -]?код[а-я]*`],
  ['hardware-authenticator', 'Аппаратный аутентификатор', String.raw`hardware\s+(?:security\s+)?(?:keys?|authenticators?|tokens?)|security\s+keys?|yubikey|titan\s+security\s+keys?|usb[ -](?:keys?|tokens?|ключ[а-я]*|токен[а-я]*)|ключ[а-я]*\s+безопасност[а-я]*|аппаратн[а-я]*\s+(?:аутентификатор[а-я]*|ключ[а-я]*|токен[а-я]*)|физическ[а-я]*\s+ключ[а-я]*`],
  ['webauthn', 'WebAuthn / FIDO2', String.raw`webauthn|web authentication|fido2|фидо2`],
  ['totp', 'TOTP', String.raw`totp|time[ -]based one[ -]time password`],
  ['oauth', 'OAuth', String.raw`oauth(?:\s*2(?:\.0)?)?`],
  ['oidc', 'OpenID Connect', String.raw`oidc|openid\s+connect`],
  ['saml', 'SAML', String.raw`saml(?:\s*2(?:\.0)?)?`],
  ['graphql', 'GraphQL', String.raw`graphql`],
  ['grpc', 'gRPC', String.raw`grpc`],
  ['rest', 'REST', String.raw`rest(?:ful)?`],
  ['mqtt', 'MQTT', String.raw`mqtt`],
  ['amqp', 'AMQP', String.raw`amqp`],
  ['websocket', 'WebSocket', String.raw`web[ -]?sockets?|веб[ -]?сокет[а-я]*`],
  ['kubernetes', 'Kubernetes', String.raw`kubernetes|k8s|кубернетес[а-я]*`],
  ['terraform', 'Terraform', String.raw`terraform|терраформ[а-я]*`],
  ['uart', 'UART', String.raw`uart`],
  ['spi', 'SPI', String.raw`spi`],
  ['i2c', 'I2C', String.raw`i2c|i²c|iic`],
].map(([id, label, expression]) => ({ id, label, expression: boundary(expression) }));

export const professionalConcepts = Object.freeze(concepts.map(({ id, label }) => Object.freeze({ id, label })));

// Split adversative clauses, not lists: a trailing denial can govern all the
// technologies in "OAuth, OIDC и SAML не реализовывал". Decimal/API dots stay
// inside words, while sentence punctuation and newlines bound the claim.
function clauses(text) {
  return normalize(text).split(/(?:[.!?]+(?=\s|$)|[;\r\n]+|,?\s+(?:но|зато|однако|but|however)\s+|,\s+а\s+(?!также\b))/iu)
    .map(value => value.trim()).filter(Boolean);
}

// This is deliberately a denial of the author's experience/action, not a
// general "не" detector. "Не допускаю повторов", "не теряет данные" and
// "работает без пароля" describe useful technical behaviour.
const deniedExperience = new RegExp(String.raw`(?<![\p{L}\p{N}_])(?:не\s+(?:только\s+)?(?:делал[аи]?|создавал[аи]?|создал[аи]?|проектировал[аи]?|выполнял[аи]?|реализовывал[аи]?|реализовал[аи]?|разрабатывал[аи]?|разработал[аи]?|исследовал[аи]?|применял[аи]?|использовал[аи]?|обрабатывал[аи]?|поддерживал[аи]?|моделировал[аи]?|настраивал[аи]?|интегрировал[аи]?|занимал(?:ся|ась|ись)|работал[аи]?|изучал[аи]?|умею|умеем|владею|владеем|знаю|знаем|знаком[аы]?)|не\s+(?:доводилось|приходилось)\s+(?:${words}\s+){0,3}(?:работать|делать|разрабатывать|реализовывать|настраивать)|(?:нет|не\s+имею|не\s+имеем)\s+опыта|опыта\s+(?:${words}\s+){0,6}нет|не\s+входил[аои]?\s+(?:в\s+)?(?:мои\s+)?(?:задач[а-я]*|обязанност[а-я]*)|(?:в\s+)?(?:мои\s+)?(?:задач[а-я]*|обязанност[а-я]*)\s+не\s+входил[аои]?|(?:have\s+not|haven't|never|did\s+not|didn't)\s+(?:implemented|implement|developed|develop|worked|work|used|use)|no\s+experience)(?![\p{L}\p{N}_])`, 'iu');
const prospectiveExperience = /(?<![\p{L}\p{N}_])(?:хочу\s+(?:изучить|освоить|научиться)|планирую\s+(?:изучить|освоить|научиться)|только\s+планирую|want\s+to\s+(?:learn|study)|plan\s+to\s+(?:learn|study))(?![\p{L}\p{N}_])/iu;
const experienceDisclaimer = /(?<![\p{L}\p{N}_])(?:(?:без|нет|не\s+имею|не\s+имеем)\s+(?:(?:коммерческ[а-я]*|практическ[а-я]*|профессиональн[а-я]*|реальн[а-я]*)\s+)?опыта|(?:мне|нам)\s+незнаком(?:а|о|ы)?)(?![\p{L}\p{N}_])/iu;
const deniedEvaluation = /(?<![\p{L}\p{N}_])не\s+(?:оценивал[аи]?|оценил[аи]?)(?![\p{L}\p{N}_])/iu;

function claimPolarity(text) {
  // "Не только реализовывал X, но и Y" affirms experience. Remove only this
  // comparative wrapper before testing genuine denial predicates.
  const claim = text.replace(/\bне\s+только\b/giu, '').replace(/(?<![\p{L}\p{N}_])не\s+только(?![\p{L}\p{N}_])/giu, '');
  if (deniedExperience.test(claim) || deniedEvaluation.test(claim) || experienceDisclaimer.test(claim)) return 'negative';
  if (prospectiveExperience.test(claim)) return 'prospective';
  return 'positive';
}

export function positiveProfessionalContent(text) {
  const statements = clauses(text), positive = statements.filter(clause => claimPolarity(clause) === 'positive');
  // Keep existing index contents identical when no claim needs exclusion.
  if (statements.length === positive.length) return String(text || '');
  return positive.join('. ');
}

// Infer only this bounded task paraphrase: an individual causal increment, or
// a per-recipient outcome difference relative to withholding an intervention.
// Generic prediction, a total A/B effect and the word "клиент" are insufficient.
function treatmentEffectParaphrase(text) {
  const individual = /(?<![\p{L}\p{N}_])(?:индивидуальн[а-я]*|(?:для|у)\s+(?:кажд[а-я]*|отдельн[а-я]*)\s+(?:клиент[а-я]*|абонент[а-я]*|пользоват[а-я]*|покупател[а-я]*|получател[а-я]*|человек[а-я]*|человека))(?![\p{L}\p{N}_])/iu.exec(text);
  if (!individual) return null;
  const increment = /(?<![\p{L}\p{N}_])(?:добавочн[а-я]*|дополнительн[а-я]*|причинн[а-я]*|инкрементальн[а-я]*)\s+(?:эффект[а-я]*|прирост[а-я]*)(?![\p{L}\p{N}_])/iu.exec(text);
  const comparison = /(?:относительно|по\s+сравнению\s+с)\s+(?:отсутстви[а-я]*|(?:вариант[а-я]*\s+)?без)/iu.exec(text);
  const effect = /насколько|разниц[а-я]*|прирост[а-я]*|измен[а-я]*|сниз[а-я]*|повыс[а-я]*/iu.test(text);
  const outcome = /покуп[а-я]*|конверси[а-я]*|риск[а-я]*|отток[а-я]*|уход[а-я]*|решени[а-я]*|удержани[а-я]*/iu.test(text);
  const intervention = /воздействи[а-я]*|вмешательств[а-я]*|подар[а-я]*|купон[а-я]*|скидк[а-я]*|сообщени[а-я]*|предложени[а-я]*/iu.test(text);
  if (!increment && !(comparison && effect && outcome && intervention)) return null;
  const cause = increment || comparison;
  return { id: 'individual-treatment-effect', start: Math.min(individual.index, cause.index),
    end: Math.max(individual.index + individual[0].length, cause.index + cause[0].length) };
}

function conceptMatches(text, context = text) {
  const normalized = normalize(text), output = [];
  const normalizedContext = normalize(context);
  for (const { id, expression } of concepts) {
    // matchAll does not mutate the stored expression's lastIndex.
    for (const match of normalized.matchAll(expression)) {
      if (id === 'nfc' && /бесконтактн/iu.test(match[0])
        && (!/телефон[а-я]*|смартфон[а-я]*|smartphone|phone/iu.test(normalizedContext)
          || !/чит[а-я]*|чтен[а-я]*|считыв[а-я]*|прочита[а-я]*|read(?:s|ing)?|tag\s+session/iu.test(normalized))) continue;
      // A generic physical key is only an authentication method in a login
      // context, not in a locksmith, API-secret or hardware-encryption task.
      if (id === 'hardware-authenticator' && /(?:физическ|аппаратн)[а-я]*\s+(?:ключ|токен)|usb[ -](?:keys?|tokens?|ключ|токен)/iu.test(match[0])
        && !/вход[а-я]*|аутентификац[а-я]*|авторизац[а-я]*|парол[а-я]*|фишинг[а-я]*|sign[ -]?in|login|authenticat/iu.test(normalizedContext)) continue;
      output.push({ id, start: match.index, end: match.index + match[0].length });
    }
  }
  if (!output.some(match => match.id === 'individual-treatment-effect')) {
    const treatmentEffect = treatmentEffectParaphrase(normalized);
    if (treatmentEffect) output.push(treatmentEffect);
  }
  return output.sort((a, b) => a.start - b.start || b.end - a.end);
}

function queryPolarity(text, match) {
  const prefix = text.slice(0, match.start).split(/[,;]/u).at(-1).slice(-90);
  const suffix = text.slice(match.end).split(/[,;]/u)[0].slice(0, 90);
  if (/^\s*(?:желател[а-я]*|не\s*обязател[а-я]*|optional|preferably|preferred)(?:\s|:)/iu.test(prefix)
    || /(?:желател[а-я]*|не\s*обязательно|не\s*обязател[а-я]*|будет\s+плюсом|optional|preferably|preferred)\s*[:,-]?\s*$/iu.test(prefix)
    || /^\s*(?:не\s*обязател[а-я]*|желател[а-я]*|будет\s+плюсом|optional|preferred)/iu.test(suffix)) return 'optional';
  const notOnly = /(?:не\s+только|not\s+only)\s*$/iu.test(prefix);
  // Negation only scopes over the named method or a request/experience
  // wrapper. In "вход без пароля с аппаратным ключом", "без" scopes over
  // the password, not the key; arbitrary words cannot bridge that boundary.
  if (!notOnly && /(?:^|\s)(?:не|без|кроме|исключая|not|no|without|except)\s+(?:(?:нуж[а-я]*|требу[а-я]*|использовани[а-я]*|поддержк[а-я]*|опыт[а-я]*|применени[а-я]*|need(?:ed)?|using|experience\s+(?:of|with))\s+){0,2}$/iu.test(prefix)
    || /^\s*(?:не\s+(?:нуж[а-я]*|требу[а-я]*|подход[а-я]*)|исключ[а-я]*|not\s+(?:needed|required))/iu.test(suffix)) return 'negative';
  // "Раньше не использовали X" is context, not a demand for X experience.
  if (claimPolarity(text) !== 'positive') return 'context';
  return 'positive';
}

/** Explicit, supported method requirements; each anyOf group is conjunctive. */
export function queryEvidenceRequirements(query) {
  const groups = [];
  for (const clause of clauses(query)) {
    const matches = conceptMatches(clause, query).filter(match => queryPolarity(clause, match) === 'positive');
    let previous = null;
    for (const match of matches) {
      const between = previous ? clause.slice(previous.end, match.start) : '';
      if (previous && /(?:^|\s)(?:или|либо|or)(?:\s|$)/iu.test(between) && !/[;.!?]/u.test(between)) {
        if (!groups.at(-1).anyOf.includes(match.id)) groups.at(-1).anyOf.push(match.id);
      } else {
        groups.push({ anyOf: [match.id] });
      }
      previous = match;
    }
  }
  const seen = new Set();
  return groups.filter(group => {
    const key = [...group.anyOf].sort().join(':');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/**
 * Factual sections only: role/stack identity cannot override a narrative denial.
 * Absent means no stated evidence, never a judgment of professional ability.
 * An affirmative statement elsewhere can establish later/other actual work.
 */
export function assessTaskEvidence(requirements, factualSections, { competencySections = [] } = {}) {
  const positive = new Set(), negative = new Set();
  for (const section of factualSections || []) {
    for (const clause of clauses(section)) {
      const polarity = claimPolarity(clause);
      if (polarity === 'prospective') continue;
      for (const { id } of conceptMatches(clause, section)) (polarity === 'negative' ? negative : positive).add(id);
    }
  }
  // Sparse self-reported competencies can fill absent factual evidence, but
  // cannot contradict an explicit disclaimer in education/achievements.
  // Actual later/other factual work already takes priority over old denials.
  for (const section of competencySections) {
    for (const clause of clauses(section)) {
      if (claimPolarity(clause) !== 'positive') continue;
      for (const { id } of conceptMatches(clause, section)) if (!negative.has(id)) positive.add(id);
    }
  }
  const outcomes = requirements.map(({ anyOf }) => ({ anyOf: [...anyOf],
    status: anyOf.some(id => positive.has(id)) ? 'positive' : anyOf.some(id => negative.has(id)) ? 'negative' : 'absent' }));
  return { eligible: outcomes.every(value => value.status === 'positive'), requirements: outcomes };
}
