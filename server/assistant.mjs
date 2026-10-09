// Role-specific assistants: a career assistant for candidates and a hiring
// assistant for employers. The model (open-weight Qwen via OpenRouter) gets
// platform facts, the user's question, the current section and a small
// non-identifying context (readiness percent, counters). It never receives
// names, contacts, resume text or test questions. Without a key, or when the
// model fails, curated answers keep the assistant useful.
import { RequestError } from './assessment.mjs';
import { LlmError } from './llm.mjs';

export const ASSISTANT_VERSION = '2026.10.09-assistant-v1';

/** Sections the assistant may link to; the model writes [Label](#key). */
export const assistantPages = {
  candidate: {
    profile: { label: 'Профиль', about: 'анкета, стек, опыт, контакты, готовность профиля, публикация, согласие, привязка ФСП и внешние подтверждения, история тестов, PDF-профиль' },
    onboarding: { label: 'Анкета', about: 'отрасль, специализация, роль, стек, предполагаемый грейд; новая анкета нужна для теста на другой грейд' },
    assessment: { label: 'Тестирование', about: 'программа теста, правила, прохождение и результат' },
    invitations: { label: 'Предложения и компании', about: 'входящие приглашения работодателей с зарплатой (принять или отклонить), поиск компаний и вакансий, собственные отклики и их статусы' },
    privacy: { label: 'Конфиденциальность', about: 'политика обработки персональных данных, удаление аккаунта' },
  },
  employer: {
    candidates: { label: 'Кандидаты', about: 'поиск по смыслу, фильтры (специализация, грейд, стек, формат, ФСП и др.), рекомендованные категории, потребности команды, сохранённые подборки, обычный и «Предельный» режим, процент совпадения и объяснение' },
    invitations: { label: 'Приглашения и отклики', about: 'статусы отправленных приглашений, отклики кандидатов на вакансии' },
    company: { label: 'Компания', about: 'профиль компании, публикация и редактирование вакансий' },
    privacy: { label: 'Конфиденциальность', about: 'политика обработки персональных данных' },
  },
};

const platformFacts = `Факты о платформе predel (подбор ИТ-специалистов с обратной механикой: инициативу проявляет работодатель):
- Категория кандидата = специализация + грейд. 14 специализаций (Frontend, Backend, Fullstack, мобильная разработка, ML и Data Science, аналитика данных, инженерия данных, DevOps и SRE, тестирование, информационная безопасность, UX/UI, бизнес и системный анализ, управление продуктом, Embedded). Грейды: Стажёр, Junior, Middle, Senior, Lead.
- Грейд подтверждается только тестом: анкета → выбор предполагаемого грейда → тест. Самооценка в анкете и резюме грейд не подтверждает.
- Тест: 12 зачётных вопросов (3 темы, базовый и повышенный уровень) и иногда 1 незачётный пилотный; 2 минуты на вопрос; вопросы по одному, вернуться нельзя; порог 70 из 100.
- Во время теста: полноэкранный режим; уход со вкладки, из окна или из полноэкранного режима — нарушение; третье нарушение аннулирует попытку. Копирование, вставка, печать и снимки экрана заблокированы. Помощник во время теста недоступен.
- Пересдача: после провала или аннулирования этот грейд и выше — через 7 дней, тест на грейд ниже доступен сразу. Подтверждённую категорию можно сменить раз в 90 дней; результат от 90 баллов сразу открывает тест на следующий грейд. Неудачный тест не понижает уже подтверждённый грейд.
- Достижения ФСП (Федерация спортивного программирования) привязываются в профиле. Они поднимают кандидата внутри его категории, но не заменяют тест. Без истории ФСП всё работает.
- Работодатель ищет кандидатов по категориям, стеку и описанию задач, видит процент совпадения и объяснение, сам отправляет приглашение с описанием и обязательной вилкой зарплаты в рублях. Вакансия для приглашения не обязательна.
- Статусы приглашений и откликов: отправлено, просмотрено, принято, отклонено.
- Контакты кандидата закрыты, пока он не примет приглашение или не откликнется сам. Кандидат может отозвать согласие — доступ к контактам закроется.
- Кандидат может сам искать компании и откликаться на вакансии; работодатель может публиковать вакансии и отвечать на отклики.
- Готовность профиля — процент заполненности ключевых пунктов: анкета, подтверждённый грейд (самый весомый), стек, описание опыта, контакты, публикация, ФСП, условия работы.
- Процент совпадения у работодателя складывается из соответствия задачам, подтверждённой категории, стека, результата теста и ФСП; учитываются только условия запроса.`;

const roles = {
  candidate: {
    title: 'Карьерный помощник',
    prompt: `Ты — карьерный помощник кандидата на платформе predel. Помогаешь заполнить профиль, подготовиться к тесту и понять его правила, разобраться с приглашениями и откликами, привязать ФСП.
Особые правила для кандидата:
- Никогда не решай и не подсказывай вопросы теста, даже если их прислали как пример. Вместо этого предложи, какие темы повторить.
- Подсказывай следующий шаг по данным контекста (готовность профиля, чего не хватает).
- Советы по резюме и описанию опыта — конкретные: глаголы действий, задачи, стек, измеримый результат.`,
  },
  employer: {
    title: 'Помощник по подбору',
    prompt: `Ты — помощник работодателя на платформе predel. Помогаешь сформулировать потребность, составить поисковый запрос и фильтры, понять категории, процент совпадения и объяснение выдачи, написать приглашение кандидату.
Особые правила для работодателя:
- Поисковый запрос предлагай одной строкой в кавычках «…» без вложенных кавычек: задачи команды, нужный опыт, формат и бюджет, если он назван.
- Текст приглашения пиши кратко: должность, задачи, стек, формат, вилка зарплаты в рублях (диапазон «от–до» обязателен), следующий шаг.
- Не называй рыночные зарплаты как точный факт; предлагай ориентироваться на бюджет и ожидания кандидатов в выдаче.
- Не обещай доступ к контактам до принятия приглашения кандидатом.`,
  },
};

const commonRules = `Общие правила:
1. Отвечай по-русски, строго на «вы» (пиши «укажите», «ищите», а не «укажи», «ищи»), дружелюбно и коротко: 2–6 предложений или короткий список. Без вступлений и повторения вопроса.
2. Опирайся только на факты о платформе. Если ответа в фактах нет — честно скажи и предложи подходящий раздел.
3. Ссылки на разделы — только в формате [Название](#ключ) и только из списка разделов ниже. Другие ссылки и адреса не пиши.
4. Не придумывай функций, которых нет. На темы, не связанные с работой, наймом и платформой, вежливо откажи одной фразой.
5. Не проси пароли, коды и персональные данные.
6. Не придумывай бюджет, грейд, формат и другие условия, которых пользователь не назвал: оставь место для них или спроси.`;

function systemPrompt(role, page, context) {
  const pages = Object.entries(assistantPages[role]).map(([key, item]) => `- [${item.label}](#${key}) — ${item.about}`).join('\n');
  const lines = describeContext(role, context);
  return `${roles[role].prompt}\n${commonRules}\n\nРазделы пользователя:\n${pages}\n\nСейчас пользователь в разделе: ${assistantPages[role][page]?.label || 'главная'}.${lines ? `\nКонтекст (без персональных данных):\n${lines}` : ''}\n\n${platformFacts}`;
}

const readinessLabels = { survey: 'анкета', confirmed: 'подтверждённый грейд', stack: 'стек из 3+ технологий', story: 'описание опыта', contacts: 'контакты',
  published: 'публикация профиля', fsp: 'привязка ФСП', terms: 'условия работы' };

/** Accepts only known, non-identifying fields. */
export function sanitizeContext(role, input) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const count = key => Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 10000 ? value[key] : undefined;
  if (role === 'candidate') {
    return {
      readiness: Number.isInteger(value.readiness) && value.readiness >= 0 && value.readiness <= 100 ? value.readiness : undefined,
      missing: Array.isArray(value.missing) ? value.missing.filter(key => Object.hasOwn(readinessLabels, key)).slice(0, 8) : [],
      confirmed: typeof value.confirmed === 'boolean' ? value.confirmed : undefined,
      specialization: typeof value.specialization === 'string' && /^[A-Za-z]{2,20}$/u.test(value.specialization) ? value.specialization : undefined,
      grade: ['Intern', 'Junior', 'Middle', 'Senior', 'Lead'].includes(value.grade) ? value.grade : undefined,
      newInvitations: count('newInvitations'),
    };
  }
  return { needs: count('needs'), pendingInvitations: count('pendingInvitations'), acceptedInvitations: count('acceptedInvitations') };
}

function describeContext(role, context) {
  const lines = [];
  if (role === 'candidate') {
    if (context.readiness !== undefined) lines.push(`- Готовность профиля: ${context.readiness}%.`);
    if (context.missing.length) lines.push(`- Не хватает: ${context.missing.map(key => readinessLabels[key]).join(', ')}.`);
    if (context.confirmed !== undefined) lines.push(`- Грейд ${context.confirmed ? 'подтверждён' : 'ещё не подтверждён'}${context.specialization ? ` (${context.specialization}${context.grade ? ' ' + context.grade : ''})` : ''}.`);
    if (context.newInvitations !== undefined) lines.push(`- Новых приглашений: ${context.newInvitations}.`);
  } else {
    if (context.needs !== undefined) lines.push(`- Сохранённых потребностей: ${context.needs}.`);
    if (context.pendingInvitations !== undefined) lines.push(`- Приглашений ждут ответа: ${context.pendingInvitations}.`);
    if (context.acceptedInvitations !== undefined) lines.push(`- Принятых приглашений: ${context.acceptedInvitations}.`);
  }
  return lines.join('\n');
}

/** Replaces [Label](#key) with plain labels and collects allowed links. */
export function extractLinks(role, text) {
  const links = [];
  const reply = String(text).replace(/\[([^\]\n]{1,60})\]\(([^)\s]{1,80})\)/gu, (_match, label, target) => {
    const key = target.replace(/^#/u, '').replace(/^\/?app\?role=\w+&tab=/u, '').replace(/^\//u, '');
    if (Object.hasOwn(assistantPages[role], key)) {
      if (!links.some(link => link.page === key)) links.push({ label: assistantPages[role][key].label, page: key });
      return `«${label}»`;
    }
    return label;
  }).replace(/https?:\/\/\S+/gu, '')
    // A line holding only section names duplicates the link buttons under the reply.
    .split('\n').filter(line => !/^\s*(?:«[^»\n]{1,60}»\s*(?:→|,|и|или)?\s*)+[.!]?\s*$/u.test(line)).join('\n')
    .replace(/\n{3,}/gu, '\n\n').trim();
  return { reply, links: links.slice(0, 3) };
}

// Curated answers: used without a key and when the model is unavailable.
const rules = {
  candidate: [
    { words: ['грейд', 'подтверд', 'тест', 'экзамен', 'пройти'], reply: 'Грейд подтверждается только тестом: заполните анкету, выберите предполагаемый грейд и пройдите тест — 12 вопросов, 2 минуты на каждый, порог 70 из 100. [Тестирование](#assessment)' },
    { words: ['вкладк', 'аннулир', 'наруш', 'полноэкран', 'списыв', 'уйти'], reply: 'Тест идёт в полноэкранном режиме. Переход на другую вкладку или окно и выход из полноэкранного режима — нарушение; после третьего попытка аннулируется, а повтор на этот грейд откроется через 7 дней. [Тестирование](#assessment)' },
    { words: ['пересда', 'повтор', 'не прош', 'провал', 'ниже', 'выше', 'сменить'], reply: 'После неудачи этот грейд и выше можно пересдать через 7 дней, тест на грейд ниже доступен сразу. Подтверждённую категорию меняют раз в 90 дней, а результат от 90 баллов сразу открывает следующий грейд. Новый грейд выбирается в анкете. [Анкета](#onboarding)' },
    { words: ['фсп', 'достижен', 'соревнован', 'олимпиад'], reply: 'Привяжите ФСП в профиле: достижения поднимут вас внутри вашей категории, но тест не заменят. Без истории ФСП всё работает. [Профиль](#profile)' },
    { words: ['контакт', 'телефон', 'почт', 'увидит'], reply: 'Работодатель увидит ваши контакты только после того, как вы примете его приглашение или откликнетесь сами. До этого он видит профиль без контактов. [Предложения и компании](#invitations)' },
    { words: ['приглаш', 'предложен', 'зарплат', 'оффер'], reply: 'Приглашения приходят в раздел предложений: в каждом есть описание, компания и вилка зарплаты. Их можно принять или отклонить. [Предложения и компании](#invitations)' },
    { words: ['ваканс', 'отклик', 'компани', 'найти работу'], reply: 'Пока приглашений нет, можно самому искать компании и откликаться на вакансии — статусы откликов видны там же. [Предложения и компании](#invitations)' },
    { words: ['готовн', 'процент', 'заполн', 'профил', 'резюме'], reply: 'Готовность профиля показывает, что осталось заполнить: больше всего весит подтверждённый грейд, затем анкета и публикация. Пункты с кнопкой «Заполнить» ведут прямо к нужному полю. [Профиль](#profile)' },
  ],
  employer: [
    { words: ['найти', 'поиск', 'подобр', 'запрос', 'кандидат'], reply: 'Опишите в поиске задачи команды, нужный опыт, формат и бюджет, например: «backend на Python для платёжного сервиса, PostgreSQL, удалённо, до 250 000 ₽». Затем уточните фильтрами — подборка сохранится. [Кандидаты](#candidates)' },
    { words: ['процент', 'совпаден', 'почему', 'объясн'], reply: 'Процент совпадения складывается из соответствия задачам, подтверждённой категории, стека, результата теста и ФСП — только по тем условиям, что вы задали. Разбивка и объяснение — по значку «i» в карточке. [Кандидаты](#candidates)' },
    { words: ['приглаш', 'написать', 'оффер', 'предлож'], reply: 'Приглашение отправляется из карточки кандидата: должность, описание задач, способ связи и обязательная вилка зарплаты в рублях. Вакансия не обязательна. Статусы видны в разделе приглашений. [Приглашения и отклики](#invitations)' },
    { words: ['контакт', 'телефон', 'почт'], reply: 'Контакты кандидата откроются после того, как он примет ваше приглашение или откликнется сам на вашу вакансию. [Приглашения и отклики](#invitations)' },
    { words: ['не подтвержд', 'грейд', 'категор'], reply: 'Категория = специализация и грейд, подтверждённый тестом. Кандидаты без подтверждения показываются ниже с пометкой «Грейд не подтверждён» — их желаемый грейд не проверен. [Кандидаты](#candidates)' },
    { words: ['ваканс', 'опубликов', 'отклик'], reply: 'Вакансии публикуются в разделе компании, отклики на них — в разделе приглашений и откликов. [Компания](#company)' },
    { words: ['потребност', 'команд'], reply: 'Сохраните потребность команды: задачи, стек, специализацию и грейд. Выбор потребности сразу строит подборку и рекомендованные категории. [Кандидаты](#candidates)' },
    { words: ['фсп', 'достижен'], reply: 'Фильтр «Есть достижения ФСП» оставит кандидатов с подтверждёнными результатами соревнований; внутри категории они стоят выше при близком соответствии. [Кандидаты](#candidates)' },
  ],
};

const testOptions = /(?:^|[\s(])[АБВГабвгABCDabcd][).]\s/gu;
const testWords = /правильн\w* ответ|какой (?:из )?(?:ответ|вариант)|верн\w* вариант|реши\w* (?:вопрос|задач)|ответ на вопрос теста/iu;
/** A candidate asking to solve a test item is answered without the model. */
export function looksLikeTestQuestion(message) {
  return (String(message).match(testOptions) || []).length >= 2 || testWords.test(String(message));
}
const testRefusal = 'С вопросами теста я не помогаю — иначе результат перестанет быть честным, а грейд подтверждается только самостоятельным прохождением. Могу подсказать, какие темы повторить по вашей специализации. [Тестирование](#assessment)';

export function ruleAnswer(role, message) {
  const text = String(message).toLocaleLowerCase('ru');
  const scored = rules[role].map(rule => ({ rule, hits: rule.words.filter(word => text.includes(word)).length })).sort((a, b) => b.hits - a.hits);
  if (scored[0]?.hits) return scored[0].rule.reply;
  return role === 'candidate'
    ? 'Я подскажу по профилю, тесту и правилам пересдачи, приглашениям и откликам, привязке ФСП. Спросите, например: «Что будет, если уйти со вкладки во время теста?» [Профиль](#profile)'
    : 'Я помогу сформулировать запрос и фильтры, понять процент совпадения и написать приглашение. Спросите, например: «Как найти backend-разработчика на Python?» [Кандидаты](#candidates)';
}

function validHistory(history) {
  if (history === undefined) return [];
  if (!Array.isArray(history) || history.length > 12) throw new RequestError(400, 'Некорректная история диалога.');
  return history.map(turn => {
    if (!turn || typeof turn !== 'object' || !['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string' || turn.content.length > 2000) {
      throw new RequestError(400, 'Некорректная история диалога.');
    }
    return { role: turn.role, content: turn.content };
  }).slice(-8);
}

export function createAssistant({ llm, logger = console } = {}) {
  return {
    info() {
      return { version: ASSISTANT_VERSION, llm: Boolean(llm?.configured), model: llm?.configured ? llm.models.chat : null,
        notice: llm?.configured ? 'Отвечает открытая модель Qwen. Персональные данные в неё не передаются — не пишите их в вопросах.' : 'Работают готовые подсказки.' };
    },
    async reply(role, input) {
      if (!Object.hasOwn(roles, role)) throw new RequestError(403, 'Помощник доступен кандидату и работодателю.');
      if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['message', 'page', 'history', 'context'].includes(key))) {
        throw new RequestError(400, 'Недопустимые поля запроса.');
      }
      const message = typeof input.message === 'string' ? input.message.trim() : '';
      if (!message || message.length > 800) throw new RequestError(400, 'Вопрос — от 1 до 800 символов.');
      const page = typeof input.page === 'string' && Object.hasOwn(assistantPages[role], input.page) ? input.page : null;
      const history = validHistory(input.history);
      const context = sanitizeContext(role, input.context);
      if (role === 'candidate' && looksLikeTestQuestion(message)) return { ...extractLinks(role, testRefusal), source: 'rules', model: null };
      if (llm?.configured) {
        try {
          const answer = await llm.chat({ temperature: 0.2, maxTokens: 450, timeoutMs: 30_000,
            messages: [{ role: 'system', content: systemPrompt(role, page, context) }, ...history, { role: 'user', content: message }] });
          return { ...extractLinks(role, answer.content), source: 'llm', model: answer.model };
        } catch (error) {
          if (!(error instanceof LlmError)) throw error;
          logger.log?.('Помощник: модель недоступна, ответ из готовых подсказок (' + error.code + ')');
        }
      }
      return { ...extractLinks(role, ruleAnswer(role, message)), source: 'rules', model: null };
    },
  };
}
