# Примеры предлагаемого ATS API

Это вымышленные сообщения для [концепции интеграции](../../ats_integration.md), не записи реального обмена. Маршруты из [OpenAPI](../../contracts/ats.openapi.json) пока не реализованы; примерный адрес `.invalid` не является стендом. UUID, внешние ID, курсоры и deliveryToken — иллюстрации, не рабочие секреты.

## Последовательность

| Файл | Схема OpenAPI | Смысл |
| --- | --- | --- |
| [job-upsert.request.json](job-upsert.request.json) | `InboundEvent` | ATS публикует вакансию с внешним ID, sequence и базовой версией |
| [job-upsert.receipt.json](job-upsert.receipt.json) | `EventReceipt` | Платформа возвращает внутренний ID и принятую версию |
| [application-created.page.json](application-created.page.json) | `DeliveryPage` | Настоящий отклик кандидата попадает в будущую очередь без контактов/резюме |
| [application-created.ack.json](application-created.ack.json) | `Acknowledgement` | ATS подтверждает запись и сообщает ID созданного у себя отклика |
| [application-created.ack.receipt.json](application-created.ack.receipt.json) | `AckReceipt` | Устойчивая квитанция и привязка; повтор не создаёт другую запись |
| [delivery.status.json](delivery.status.json) | `DeliveryStatus` | Получение сохранённого состояния после потери ответа ACK |
| [delivery-cancelled.status.json](delivery-cancelled.status.json) | `DeliveryStatus` | Терминальная отмена выдачи недопустимого события после отзыва разрешения |
| [application-decision.request.json](application-decision.request.json) | `InboundEvent` | ATS принимает отклик работодателем, передаёт оба ID и ожидаемую версию |
| [application-decision.receipt.json](application-decision.receipt.json) | `EventReceipt` | Принятое решение и следующая версия |
| [job-close.request.json](job-close.request.json) | `InboundEvent` | Окончательное закрытие связанной вакансии |
| [stale-revision.error.json](stale-revision.error.json) | `Error` | Пример конфликта версии; требуется сверка, а не слепой повтор |
| [contacts-revoked.page.json](contacts-revoked.page.json) | `DeliveryPage` | Новое уведомление об отзыве доступа к ранее экспортированной ссылке кандидата |
| [application-decision-before-ack.page.json](application-decision-before-ack.page.json) | `DeliveryPage` | Альтернативный сценарий: решение работодателя на сайте до привязки внешнего отклика; исходящий статус не требует externalId |

Исходящий `sequence` — общий порядок очереди подключения; промежуточные события здесь не все показаны. Входящий `sequence` считается отдельно для каждой внешней сущности, поэтому решение по отклику начинается с `1`, а закрытие уже созданной вакансии имеет `2`. `syncRevision` считается по конкретной внутренней сущности. После потери ответа повторяется исходный `eventId` и то же содержимое, а не следующий sequence.

Пример решения до ACK — отдельная альтернатива основному обмену: событие создано раньше подтверждения, но его страницу адаптер читает после ACK предыдущего `application.created`. В этом варианте платформа уже имеет версию отклика `2`, поэтому основной пример входящего решения ATS с `baseRevision = 1` получил бы конфликт. Внешний ID не добавляется задним числом в неизменяемое исходящее событие. Поздний ACK только связывает идентификаторы.

Для повтора ACK используется тот же `ackId` и неизменный `externalId`. `deliveryToken` может быть перевыпущен при чтении страницы; сохранённая семантически та же квитанция возвращается после проверки действующего интеграционного токена. ACK не подтверждает правомерность выгрузки контактов. Передача даже минимальных кандидатских данных в настоящую ATS зависит от согласованных процедур персональных данных.

## Что проверено

Структура документа прошла `openapi-spec-validator 0.9.0`; JSON-примеры прошли `jsonschema` Draft 2020-12 с проверкой UUID/дат и локальных ссылок. Негативные изменения формата, лишних полей, валюты, специализации и статусов отклоняются схемами. Проверки не обращались к внешней ATS и не создавали пользователей.

JSON Schema не проверяет межполевое условие `salaryFrom ≤ salaryTo`, владение, текущую версию, допустимость перехода из состояния базы, привязку ACK к типу реального события, транзакционность и фактическое удаление внешней копии. Эти правила описаны в концепции и должны проверяться будущим обработчиком. Валидация примеров не заменяет его интеграционные испытания.

Воспроизведение из корня репозитория в PowerShell, без добавления зависимостей приложения:

```powershell
.\.venv\Scripts\python.exe -m pip install --target server/data/ats-contract-tools openapi-spec-validator==0.9.0
@'
import json, pathlib, sys
sys.path.insert(0, 'server/data/ats-contract-tools')
from openapi_spec_validator import validate
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

spec = json.loads(pathlib.Path('docs/contracts/ats.openapi.json').read_text(encoding='utf-8'))
validate(spec)
root = {'$schema': 'https://json-schema.org/draft/2020-12/schema', **spec}
registry = Registry().with_resource('urn:predel:ats:v1', Resource.from_contents(root))
groups = {
    'InboundEvent': ['job-upsert.request', 'job-close.request', 'application-decision.request'],
    'EventReceipt': ['job-upsert.receipt', 'application-decision.receipt'],
    'DeliveryPage': ['application-created.page', 'contacts-revoked.page', 'application-decision-before-ack.page'],
    'Acknowledgement': ['application-created.ack'],
    'AckReceipt': ['application-created.ack.receipt'],
    'DeliveryStatus': ['delivery.status', 'delivery-cancelled.status'],
    'Error': ['stale-revision.error'],
}
for schema, files in groups.items():
    validator = Draft202012Validator(
        {'$ref': 'urn:predel:ats:v1#/components/schemas/' + schema},
        registry=registry, format_checker=FormatChecker())
    for name in files:
        value = json.loads(pathlib.Path('docs/examples/ats', name + '.json').read_text(encoding='utf-8'))
        validator.validate(value)
print('Contract and examples are valid')
'@ | .\.venv\Scripts\python.exe -
```

В `.venv` требуется установленный Python; каталог валидатора находится в игнорируемом `server/data`. Команда подтверждает только контракт и положительные примеры. Для будущего адаптера нужны дополнительные сценарии повтора, конфликтов, чужих компаний, отзыва разрешения, сбоев и сверки из [плана приёмки](../../ats_integration.md#7-проверка-концепции-и-переход-к-реализации).
