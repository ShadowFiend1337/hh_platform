import test from 'node:test';
import assert from 'node:assert/strict';
import { positiveProfessionalContent, queryEvidenceRequirements, assessTaskEvidence } from '../search-evidence.mjs';

const evidence = (query, ...sections) => assessTaskEvidence(queryEvidenceRequirements(query), sections);

test('specific NFC evidence differs from a badge interface, including a denial that repeats its terms', () => {
  const query = 'Сотрудник подносит карту к смартфону. Нужно прочитать бесконтактную метку приложением.';
  assert.deepEqual(queryEvidenceRequirements(query), [{ anyOf: ['nfc'] }]);
  assert.equal(evidence(query, 'Разрабатываю мобильный экран с данными сотрудника и штрихкодом.').eligible, false);
  const denial = evidence(query, 'Делаю экран пропуска. Чтение NFC-меток не реализовывал.');
  assert.equal(denial.eligible, false); assert.equal(denial.requirements[0].status, 'negative');
  assert.equal(evidence(query, 'Разрабатываю NFC считывание данных и восстановление прерванного сеанса.').eligible, true);
});

test('contactless reading paraphrase can provide positive evidence without the acronym', () => {
  assert.equal(evidence('Нужно читать NFC метки.', 'Приложение телефона считывает бесконтактные карты. Обрабатываю прерванные сеансы.').eligible, true);
  assert.deepEqual(queryEvidenceRequirements('Настроить RFID считыватель бесконтактных карт на складе.'), [], 'Unspecified contactless hardware must not be silently equated to phone NFC');
});

test('physical authentication key is distinct from generic password or OTP login', () => {
  const query = 'Нужно защитить вход физическим ключом от поддельного сайта.';
  assert.deepEqual(queryEvidenceRequirements(query), [{ anyOf: ['hardware-authenticator'] }]);
  assert.equal(evidence(query, 'Проверяю вход по паролю и одноразовому коду.').eligible, false);
  assert.equal(evidence(query, 'Интегрирую аппаратные аутентификаторы для входа.').eligible, true);
  assert.equal(evidence(query, 'Проверяю вход с USB-ключом и его криптографическое подтверждение.').eligible, true);
  assert.deepEqual(queryEvidenceRequirements('Нужен вход без пароля с аппаратным ключом.'), [{ anyOf: ['hardware-authenticator'] }]);
});

test('WebAuthn name does not establish external hardware experience, and the reverse does not establish WebAuthn', () => {
  assert.equal(evidence('Нужен вход с аппаратным ключом.', 'Интегрирую WebAuthn с платформенным аутентификатором.').eligible, false);
  assert.equal(evidence('Нужен аудит WebAuthn.', 'Проверяю аппаратные аутентификаторы для входа.').eligible, false);
  assert.equal(evidence('Нужен аудит FIDO2.', 'Проверяю challenge и привязку WebAuthn к origin.').eligible, true);
  assert.deepEqual(queryEvidenceRequirements('Нужно хранить ключи API и физический ключ от помещения.'), []);
  assert.equal(evidence('Вход с аппаратным ключом.', 'Интегрирую YubiKey для входа.').eligible, true);
  assert.equal(evidence('Вход с аппаратным ключом.', 'Проверяю Titan Security Key.').eligible, true);
  assert.deepEqual(queryEvidenceRequirements('Нужен разработчик проекта Titan.'), []);
});

test('protocol evidence applies beyond the initial two tasks and preserves adjacent distinctions', () => {
  assert.equal(evidence('Проверить OpenID Connect.', 'Внедряю OIDC и проверяю id_token.').eligible, true);
  assert.equal(evidence('Проверить OIDC.', 'Подключаю OAuth 2.0 authorization code.').eligible, false);
  assert.equal(evidence('Перевести API на gRPC.', 'Делаю REST API и GraphQL запросы.').eligible, false);
  assert.equal(evidence('Подключить BLE датчики.', 'Настраиваю GATT уведомления и переподключение.').eligible, true);
  assert.equal(evidence('Настроить k8s.', 'Эксплуатирую Kubernetes кластер.').eligible, true);
});

test('explicit concept requirements are bounded and never infer every query word as a filter', () => {
  assert.deepEqual(queryEvidenceRequirements('Нужен инженер для надёжного входа и защиты сессии.'), []);
  assert.equal(evidence('Нужен инженер для надёжного входа и защиты сессии.', 'Проверяю аутентификацию пользователей.').eligible, true);
  assert.deepEqual(queryEvidenceRequirements('RESTaurant booking и NFCounter виджет.'), []);
});

test('optional and excluded protocols do not become mandatory methods', () => {
  for (const query of ['NFC не обязательно.', 'Желательно NFC.', 'NFC будет плюсом.', 'Без NFC нужен экран пропуска.', 'Не нужен NFC, нужен QR код.']) {
    assert.ok(!queryEvidenceRequirements(query).some(group => group.anyOf.includes('nfc')), query);
  }
  assert.deepEqual(queryEvidenceRequirements('Не нужен NFC, нужен QR код.'), [{ anyOf: ['qr'] }]);
  assert.deepEqual(queryEvidenceRequirements('NFC желательно, BLE обязательно.'), [{ anyOf: ['ble'] }]);
  assert.deepEqual(queryEvidenceRequirements('Желательно NFC и BLE.'), []);
});

test('explicit alternatives need one supported method, conjunctions need each one', () => {
  assert.deepEqual(queryEvidenceRequirements('Подключить NFC или BLE.'), [{ anyOf: ['nfc', 'ble'] }]);
  assert.equal(evidence('Подключить NFC или BLE.', 'Подключаю Bluetooth устройства.').eligible, true);
  assert.equal(evidence('Подключить NFC и BLE.', 'Подключаю Bluetooth устройства.').eligible, false);
  assert.deepEqual(queryEvidenceRequirements('NFC или BLE и MQTT.'), [{ anyOf: ['nfc', 'ble'] }, { anyOf: ['mqtt'] }]);
  assert.deepEqual(queryEvidenceRequirements('Обязательно NFC. Затем NFC или BLE.'), [{ anyOf: ['nfc'] }, { anyOf: ['nfc', 'ble'] }]);
  assert.equal(evidence('Обязательно NFC. Затем NFC или BLE.', 'Подключаю Bluetooth устройства.').eligible, false);
});

test('denial of experience is not a positive assertion even if it contains exact technology names', () => {
  for (const section of ['NFC не выполнял.', 'Я не работал с NFC.', 'Я не делала NFC.', 'Не знаком с NFC.', 'Без опыта NFC.', 'Нет коммерческого опыта NFC.', 'Нет практического опыта NFC.', 'Настройка NFC мне незнакома.', 'Нет опыта NFC.', 'Опыта NFC у меня нет.', 'Чтение NFC в мои задачи не входило.', 'NFC не входил в мои обязанности.', 'I have not implemented NFC.']) {
    assert.equal(positiveProfessionalContent(section), '', section);
    assert.equal(evidence('Нужен NFC.', section).requirements[0].status, 'negative', section);
  }
});

test('a trailing denial governs a list, while later actual work establishes positive evidence', () => {
  assert.equal(evidence('Нужно OIDC.', 'OAuth, OIDC и SAML не реализовывал.').eligible, false);
  assert.equal(evidence('Нужно OIDC.', 'Раньше OIDC не реализовывал. В последнем проекте внедрил OpenID Connect.').eligible, true);
  assert.equal(evidence('Нужно BLE.', 'NFC не разрабатывал, а Bluetooth подключал.').eligible, true);
  assert.equal(evidence('Нужно NFC.', 'NFC не разрабатывал, а Bluetooth подключал.').eligible, false);
});

test('technical negations describe positive work and must retain their original index text', () => {
  for (const section of ['Настраиваю NFC, чтобы приложение не теряло данные.', 'Проверяю WebAuthn без пароля и не допускаю повторного assertion.', 'Не только реализовывал NFC, но и проверял потерю карты.', 'Проектирую BLE соединения, исключаю обрыв и повторные показания.']) {
    assert.equal(positiveProfessionalContent(section), section, section);
  }
  assert.equal(evidence('Нужно NFC.', 'Не только реализовывал NFC, но и проверял потерю карты.').eligible, true);
});

test('future study is absent evidence, while completed technical study remains available to neural ranking', () => {
  assert.equal(evidence('Нужен MQTT.', 'Хочу изучить MQTT.').requirements[0].status, 'absent');
  assert.equal(positiveProfessionalContent('Хочу изучить MQTT.'), '');
  assert.equal(evidence('Нужен MQTT.', 'Изучал MQTT и сделал учебный брокер.').eligible, true);
});

test('positive extraction preserves affirmative work and never mutates supplied factual sections', () => {
  const sections = ['Пишу серверные API. WebAuthn не исследовал.', 'Настраиваю OAuth 2.0.'];
  const original = [...sections];
  assert.equal(positiveProfessionalContent(sections[0]), 'Пишу серверные API');
  assert.equal(evidence('Аудит WebAuthn.', ...sections).eligible, false);
  assert.deepEqual(sections, original);
});

test('sparse competency fallback fills absent methods but cannot override denied factual experience', () => {
  const required = queryEvidenceRequirements('Нужно NFC.'), competencySections = ['Мобильный разработчик\nNFC'];
  assert.equal(assessTaskEvidence(required, [], { competencySections }).eligible, true);
  assert.equal(assessTaskEvidence(required, ['Работал с экранными формами.'], { competencySections }).eligible, true);
  const denied = assessTaskEvidence(required, ['Чтение NFC не исследовал.'], { competencySections });
  assert.equal(denied.eligible, false); assert.equal(denied.requirements[0].status, 'negative');
  const later = assessTaskEvidence(required, ['Раньше NFC не исследовал.', 'Внедрил NFC чтение карты.'], { competencySections });
  assert.equal(later.eligible, true, 'Factual positive work takes precedence over older factual denial');
});

test('a denied method does not prevent another declared competency satisfying an explicit alternative', () => {
  const facts = ['NFC не разрабатывал.'], competencySections = ['NFC, BLE'];
  assert.equal(assessTaskEvidence(queryEvidenceRequirements('Нужно NFC или BLE.'), facts, { competencySections }).eligible, true);
  assert.equal(assessTaskEvidence(queryEvidenceRequirements('Нужно NFC.'), facts, { competencySections }).eligible, false);
  assert.equal(assessTaskEvidence(queryEvidenceRequirements('Нужно NFC и BLE.'), facts, { competencySections }).eligible, false);
});
