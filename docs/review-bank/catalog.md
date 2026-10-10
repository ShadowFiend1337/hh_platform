# Каталог задач для предметного просмотра

Новый банк ожидает одобрения. Действующий экзамен не изменён. Ответы, критерии и контракты будущих вариантов находятся только в серверном модуле.

## Линейная алгебра и оптимизация

Источники тем: [18.06: Linear Algebra — assignments](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments/); [18.02SC: Multivariable Calculus](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/); [Математика для анализа данных](https://education.yandex.ru/handbook/math). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Калибровка датчика

ID: `research:mathematics:Intern` · Линейная алгебра и оптимизация · расчёт с объяснением · ориентир 12 мин.

Датчик выдаёт x=0, 1, 2; эталонные значения y=1, 2, 2. Подберите a и b для модели y≈a+bx методом наименьших квадратов. Покажите функцию ошибки, найдите минимум и остатки. Объясните, почему прямая не проходит через все три точки.

Материалы задачи: [mit-linear](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments/), [mit-calculus](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/), [yandex-math](https://education.yandex.ru/handbook/math).

Предварительное основание уровня: Нужно вывести и проверить двухпараметрическую модель, а не назвать термин.

**Junior**

### Шаг градиента с регуляризацией

ID: `research:mathematics:Junior` · Линейная алгебра и оптимизация · расчёт с объяснением · ориентир 15 мин.

Для X=[[1,0],[1,1]], y=[1,3] и w=[0,0] задано L(w)=||Xw-y||²/2+||w||²/2. Выведите градиент, сделайте шаг с η=0.1 и вычислите L до и после. Входной признак затем увеличили в 100 раз: почему прежний шаг может стать неустойчивым?

Материалы задачи: [mit-calculus](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/), [mit-linear](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments/), [yandex-math](https://education.yandex.ru/handbook/math).

Предварительное основание уровня: Требуется связать вычисление с устойчивостью алгоритма.

**Middle**

### Неидентифицируемые коэффициенты

ID: `research:mathematics:Middle` · Линейная алгебра и оптимизация · расчёт с объяснением · ориентир 20 мин.

В регрессии X=[[1,1,2],[1,2,4],[1,3,6]], y=[2,3,5]. Найдите ранг X, множество коэффициентов, минимизирующих квадрат ошибки, и прогноз при строке [1,4,8]. Объясните, что меняет ridge-регуляризация и какие параметры без неё нельзя интерпретировать отдельно.

Материалы задачи: [mit-linear](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments/), [mit-calculus](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/), [yandex-math](https://education.yandex.ru/handbook/math).

Предварительное основание уровня: Нужно вывести множество решений и корректно интерпретировать модель.

**Senior**

### Почти зависимые признаки

ID: `research:mathematics:Senior` · Линейная алгебра и оптимизация · развёрнутый кейс · ориентир 25 мин.

Для X=[[1,1],[1,1+ε],[1,1-ε]], ε=10⁻⁸, требуется решить least squares в float64. Оцените порядок числа обусловленности X и XᵀX, сравните normal equations, QR и SVD. Предложите эксперимент с возмущением y на 10⁻⁹ и критерий, когда коэффициенты нельзя надёжно публиковать.

Материалы задачи: [mit-linear](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments/), [mit-calculus](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/), [yandex-math](https://education.yandex.ru/handbook/math).

Предварительное основание уровня: Взаимодействуют машинная точность, спектр и значимость параметров.

**Lead**

### Сжатие матрицы с гарантией ошибки

ID: `research:mathematics:Lead` · Линейная алгебра и оптимизация · развёрнутый кейс · ориентир 30 мин.

Нужно хранить матрицу эмбеддингов 100000×256 в float32; допустимо 80 MiB. SVD показывает σᵢ²=C·0.8^(i-1), i=1…256. Сначала допускается только факторизация UᵣΣᵣVᵣᵀ без квантования. Найдите минимальный r для относительной ошибки Фробениуса ≤0.01, проверьте бюджет и сформулируйте проверку качества retrieval, которую эта гарантия не заменяет.

Материалы задачи: [mit-linear](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments/), [mit-calculus](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/), [yandex-math](https://education.yandex.ru/handbook/math).

Предварительное основание уровня: Нужно принять техническое решение по нескольким проверяемым ограничениям.

## Теория вероятностей

Источники тем: [18.05: Probability and Statistics — problem sets](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/); [Математика для анализа данных](https://education.yandex.ru/handbook/math). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Выборка без возвращения

ID: `research:probability:Intern` · Теория вероятностей · расчёт с объяснением · ориентир 10 мин.

В партии 8 исправных и 2 дефектных платы. Для проверки случайно берут 3 платы без возвращения. Найдите вероятность ровно одного дефекта и математическое ожидание числа дефектов. Объясните, почему биномиальная модель здесь неточна.

Материалы задачи: [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [yandex-math](https://education.yandex.ru/handbook/math).

Предварительное основание уровня: Два связанных расчёта требуют правильной модели выборки.

**Junior**

### Редкое событие и сигнал детектора

ID: `research:probability:Junior` · Теория вероятностей · расчёт с объяснением · ориентир 12 мин.

Доля неисправных узлов 0.5%. Детектор срабатывает на 96% неисправных и на 3% исправных. После сигнала какова вероятность неисправности? Покажите расчёт на 100000 узлах и объясните, почему 96% нельзя использовать как вероятность неисправности после сигнала.

Материалы задачи: [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [yandex-math](https://education.yandex.ru/handbook/math).

Предварительное основание уровня: Нужно восстановить вероятностную модель из разных условных частот.

**Middle**

### Ограниченные повторы доставки

ID: `research:probability:Middle` · Теория вероятностей · расчёт с объяснением · ориентир 15 мин.

Каждая попытка доставки независимо успешна с вероятностью 0.7. Допускаются максимум 3 попытки; следующая выполняется только после неудачи. Найдите вероятность окончательного провала, распределение количества выполненных попыток и его ожидание. Когда коррелированные отказы делают эту оценку опасной?

Материалы задачи: [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [yandex-math](https://education.yandex.ru/handbook/math).

Предварительное основание уровня: Нужно вывести распределение процесса с ранней остановкой.

**Senior**

### Суперпозиция нагрузки

ID: `research:probability:Senior` · Теория вероятностей · развёрнутый кейс · ориентир 25 мин.

Два независимых потока имеют пуассоновские интенсивности 30 и 20 событий в секунду. Найдите вероятность более 70 событий за секунду через выражение для CDF и приближённую оценку. После включения общей рекламной рассылки дисперсия секундных счётчиков стала 180 при среднем 50. Почему прежняя модель перестала подходить и какие данные нужны для выбора новой?

Материалы задачи: [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [yandex-math](https://education.yandex.ru/handbook/math).

Предварительное основание уровня: Требуется вычисление хвоста и диагностика нарушения предпосылок.

**Lead**

### Общая причина отказов

ID: `research:probability:Lead` · Теория вероятностей · развёрнутый кейс · ориентир 30 мин.

Каждый из двух ЦОД недоступен за час с вероятностью 0.01. Известны только эти маргинальные частоты. Найдите возможные границы вероятности одновременной недоступности. Затем добавьте модель: общий сетевой отказ имеет вероятность q=0.002 и выключает оба ЦОД; иначе локальные отказы независимы и равновероятны. Восстановите локальную вероятность и совместный риск. Какие измерения докажут пользу третьего ЦОД?

Материалы задачи: [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [yandex-math](https://education.yandex.ru/handbook/math).

Предварительное основание уровня: Нужно построить и проверить модель риска для архитектурного решения.

## Математическая статистика и эксперименты

Источники тем: [18.650: Statistics for Applications — assignments](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/); [18.05: Probability and Statistics — problem sets](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/); [Experimentation Platform research](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Среднее и выброс

ID: `research:statistics:Intern` · Математическая статистика и эксперименты · расчёт с объяснением · ориентир 10 мин.

Времена выполнения задачи в минутах: 2, 3, 3, 4, 18. Вычислите среднее, медиану и выборочную дисперсию с делителем n−1. Для отчёта о типичном времени выберите показатель и объясните, почему нельзя удалить 18 только из-за неудобного результата.

Материалы задачи: [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/).

Предварительное основание уровня: Нужно посчитать и интерпретировать статистики одного набора.

**Junior**

### Интервал конверсии

ID: `research:statistics:Junior` · Математическая статистика и эксперименты · расчёт с объяснением · ориентир 12 мин.

Из 400 независимых пользователей 52 завершили регистрацию. Оцените конверсию и приближённый 95% доверительный интервал по нормальному приближению. Объясните его частотный смысл и почему для 2 успехов из 10 этот метод ненадёжен.

Материалы задачи: [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/).

Предварительное основание уровня: Требуется оценка неопределённости и проверка метода.

**Middle**

### A/B с повторными сессиями

ID: `research:statistics:Middle` · Математическая статистика и эксперименты · развёрнутый кейс · ориентир 20 мин.

Пользователи случайно назначены в A или B, но аналитик сравнивает 50000 сессий и считает их независимыми. Один пользователь создаёт до 30 сессий; метрика — доля пользователей, купивших за 7 дней. Опишите единицу анализа, SQL-агрегацию, оценку эффекта и способ построения интервала. Что изменится, если эксперимент назначается по организациям?

Материалы задачи: [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/).

Предварительное основание уровня: Нужно спроектировать оценку эффекта при зависимых наблюдениях.

**Senior**

### Победитель из двадцати тестов

ID: `research:statistics:Senior` · Математическая статистика и эксперименты · расчёт с объяснением · ориентир 25 мин.

Проверили 20 независимых гипотез, все нулевые истинны. Каждый тест использовал α=0.05; затем показали только минимальный p-value. Найдите вероятность хотя бы одного ложного открытия. Предложите протокол для одной основной и 19 исследовательских метрик; как учесть ежедневную остановку по значимости?

Материалы задачи: [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/).

Предварительное основание уровня: Взаимодействуют выбор гипотез, multiplicity и остановка.

**Lead**

### Проверка платформы экспериментов

ID: `research:statistics:Lead` · Математическая статистика и эксперименты · развёрнутый кейс · ориентир 30 мин.

В A/B-тесте ожидается разделение 50/50, получено 54000/46000 пользователей. B имеет +2% выручки; ещё видны дубли assignment, изменение определения выручки на третий день и задержка событий до 48 часов. Составьте протокол решения: проверка SRM, восстановление корректной выборки, единица анализа выручки и критерии допуска результата. Какие данные нужно сохранить для независимого повторного расчёта?

Материалы задачи: [exp-srm](https://www.microsoft.com/en-us/research/articles/diagnosing-sample-ratio-mismatch-in-a-b-testing/), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/).

Предварительное основание уровня: Нужно выстроить проверяемую процедуру решения при нескольких источниках смещения.

## SQL и PostgreSQL

Источники тем: [PostgreSQL Exercises](https://pgexercises.com/); [SQL Academy — тренажёр](https://sql-academy.org/ru/trainer); [PostgreSQL Tutorial](https://www.postgresql.org/docs/current/tutorial.html). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Заказы и клиенты без покупок

ID: `research:sql:Intern` · SQL и PostgreSQL · SQL · ориентир 12 мин.

Таблицы customers(id) и orders(id, customer_id, status, amount). Клиенты: 1,2,3. Заказы: (10,1,paid,100),(11,1,cancelled,50),(12,2,paid,70). Напишите SQL, который для каждого клиента вернёт число оплаченных заказов и их сумму, включая клиента 3 с нулями. Покажите результат и объясните размещение фильтра status.

Материалы задачи: [pg-exercises](https://pgexercises.com/), [sql-academy](https://sql-academy.org/ru/trainer), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно написать запрос, учесть NULL и проверить результат.

**Junior**

### Последний статус с равным временем

ID: `research:sql:Junior` · SQL и PostgreSQL · SQL · ориентир 15 мин.

events(entity_id, event_id, happened_at, status) содержит историю. Для entity=1 есть (7,10:00,new),(8,10:05,paid),(9,10:05,refunded); для entity=2 — (10,10:03,new). Верните последний статус каждой сущности, при равном времени выбирая больший event_id. Предложите подходящий индекс; почему JOIN с MAX(happened_at) недостаточен?

Материалы задачи: [pg-exercises](https://pgexercises.com/), [sql-academy](https://sql-academy.org/ru/trainer), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Требуются оконная функция, детерминизм и индекс.

**Middle**

### Сессии по разрывам событий

ID: `research:sql:Middle` · SQL и PostgreSQL · SQL · ориентир 25 мин.

events(user_id, event_id, ts) содержит события; новая сессия начинается, если разрыв с предыдущим событием строго больше 30 минут. Одинаковые ts упорядочиваются по event_id. Напишите запрос, возвращающий user_id, session_no, start_ts, end_ts, event_count. Покажите обработку первой строки и случая ровно 30 минут. В таблице 100 млн строк: предложите индекс и способ проверки плана.

Материалы задачи: [pg-exercises](https://pgexercises.com/), [sql-academy](https://sql-academy.org/ru/trainer), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно составить многоэтапный запрос и оценить его выполнение.

**Senior**

### Конкурентное резервирование

ID: `research:sql:Senior` · SQL и PostgreSQL · SQL · ориентир 30 мин.

В PostgreSQL stocks(sku PRIMARY KEY, available CHECK(available>=0)) и reservations(request_id UNIQUE,sku,qty). Два запроса хотят последние 5 единиц; возможен повтор одного request_id после сетевого таймаута. Напишите транзакционный алгоритм для READ COMMITTED: исключите перепродажу и двойное списание, задайте результат конфликта и порядок проверки. Докажите поведение на двух конкурирующих транзакциях.

Материалы задачи: [postgres-isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [pg-exercises](https://pgexercises.com/), [sql-academy](https://sql-academy.org/ru/trainer), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Требуется доказать корректность при конкуренции и повторе.

**Lead**

### Миграция уникальности без остановки

ID: `research:sql:Lead` · SQL и PostgreSQL · развёрнутый кейс · ориентир 35 мин.

В multi-tenant системе email сейчас уникален глобально; нужен UNIQUE(tenant_id,lower(email)) только для active пользователей. Таблица 200 млн строк, допустимая блокировка записи ≤2 секунд, старые и новые версии сервиса сосуществуют неделю. Предложите миграцию индекса и контрактов, проверку коллизий, последовательность отката и метрики. Что делать, если новый индекс CONCURRENTLY остался INVALID?

Материалы задачи: [postgres-index](https://www.postgresql.org/docs/current/sql-createindex.html), [pg-exercises](https://pgexercises.com/), [sql-academy](https://sql-academy.org/ru/trainer), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно обосновать жизненный цикл изменения данных и совместимость нескольких версий.

## Python: корректность, память и конкурентность

Источники тем: [Python exercises](https://exercism.org/tracks/python/exercises); [Программирование на Python](https://stepik.org/course/67/promo); [6.006: Introduction to Algorithms — assignments](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Сводка строк журнала

ID: `research:python:Intern` · Python: корректность, память и конкурентность · код · ориентир 15 мин.

Напишите summarize(lines) для строк вида «user_id;amount». Пустые строки пропускаются; user_id — непустая строка, amount — целое число ≥0. Некорректная строка не прерывает чтение: возвращаются суммы по пользователям и номера ошибочных строк, начиная с 1. Для ["a;2","bad","a;3","b;-1",""] покажите результат. Исходный список менять нельзя.

Материалы задачи: [ex-python](https://exercism.org/tracks/python/exercises), [stepik-python](https://stepik.org/course/67/promo), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Предварительное основание уровня: Нужно реализовать небольшой, но полный контракт обработки ошибок.

**Junior**

### Объединение интервалов

ID: `research:python:Junior` · Python: корректность, память и конкурентность · код · ориентир 20 мин.

Реализуйте merge(intervals) для полуоткрытых интервалов [start,end), start&lt;end. Пересекающиеся интервалы объединяются, соприкасающиеся не объединяются. Для [(5,8),(1,3),(2,6),(8,9)] ожидается [(1,8),(8,9)]. Не изменяйте вход. Укажите сложность и тесты для вложенных, одинаковых и пустых интервалов.

Материалы задачи: [ex-python](https://exercism.org/tracks/python/exercises), [stepik-python](https://stepik.org/course/67/promo), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Предварительное основание уровня: Нужно реализовать алгоритм и доказать граничное поведение.

**Middle**

### Соединение отсортированных потоков

ID: `research:python:Middle` · Python: корректность, память и конкурентность · код · ориентир 30 мин.

Два однопроходных итератора дают (key,value), отсортированные по key, с повторяющимися ключами. Реализуйте генератор inner_join, выдающий декартовы пары значений каждого общего ключа. Вся выборка в память не помещается; одна группа ключа помещается. Задайте порядок выдачи, оцените память и покажите пример с двумя записями слева и тремя справа одного ключа.

Материалы задачи: [ex-python](https://exercism.org/tracks/python/exercises), [stepik-python](https://stepik.org/course/67/promo), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Предварительное основание уровня: Нужно спроектировать ленивый алгоритм с явным бюджетом памяти.

**Senior**

### Отмена ограниченного batch fetch

ID: `research:python:Senior` · Python: корректность, память и конкурентность · код · ориентир 35 мин.

В Python asyncio есть async fetch(id); он может зависнуть или выбросить исключение. Реализуйте batch(ids,k,timeout): одновременно не больше k запросов, индивидуальный timeout, результат в порядке входа с отдельными ошибками. При отмене batch все дочерние задачи завершаются и закрывают ресурсы; список ids может содержать 100000 элементов. Не создавайте сразу 100000 Task.

Материалы задачи: [python-asyncio](https://docs.python.org/3/library/asyncio-task.html), [ex-python](https://exercism.org/tracks/python/exercises), [stepik-python](https://stepik.org/course/67/promo), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Предварительное основание уровня: Требуется корректный жизненный цикл ресурсов и отмены при нагрузке.

**Lead**

### Потоковый экспорт с проверкой целостности

ID: `research:python:Lead` · Python: корректность, память и конкурентность · развёрнутый кейс · ориентир 40 мин.

Сервис экспортирует 2 ТБ записей из БД в объектное хранилище через Python; доступно 512 MiB RAM. Чтение и запись имеют независимые сбои, повторы не должны дублировать строки. Источник поддерживает snapshot и keyset pagination, хранилище — multipart upload. Спроектируйте алгоритм checkpoint/resume, лимиты очередей, формат manifest и проверку полноты. После истечения snapshot как поступить без смешения версий?

Материалы задачи: [ex-python](https://exercism.org/tracks/python/exercises), [stepik-python](https://stepik.org/course/67/promo), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Предварительное основание уровня: Нужно согласовать алгоритм и протокол данных через несколько отказных границ.

## Алгоритмы и структуры данных

Источники тем: [6.006: Introduction to Algorithms — assignments](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/); [Python exercises](https://exercism.org/tracks/python/exercises); [Java exercises](https://exercism.org/tracks/java/exercises); [Go exercises](https://exercism.org/tracks/go/exercises). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Первое появление идентификатора

ID: `research:algorithms:Intern` · Алгоритмы и структуры данных · код · ориентир 10 мин.

Получен список [4,2,4,1,2,7]. Верните уникальные ID в порядке первого появления: [4,2,1,7]. Напишите алгоритм, объясните роль дополнительной структуры и оцените время и память. Что изменится, если ID нельзя хешировать?

Материалы задачи: [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/), [ex-python](https://exercism.org/tracks/python/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises).

Предварительное основание уровня: Нужно реализовать и объяснить однопроходный алгоритм.

**Junior**

### Кратчайшая цепочка зависимостей

ID: `research:algorithms:Junior` · Алгоритмы и структуры данных · код · ориентир 20 мин.

Ориентированный невзвешенный граф задан списками смежности; вершины могут образовывать циклы. Найдите кратчайший путь от s до t и восстановите последовательность вершин. Если пути нет, верните None. Объясните, когда помечать посещённые вершины, и оцените сложность.

Материалы задачи: [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/), [ex-python](https://exercism.org/tracks/python/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises).

Предварительное основание уровня: Нужно выбрать алгоритм и доказать свойство минимальности.

**Middle**

### Взвешенное расписание работ

ID: `research:algorithms:Middle` · Алгоритмы и структуры данных · код · ориентир 30 мин.

Даны работы (start,end,profit), интервалы полуоткрытые и могут соприкасаться. Нужно выбрать непересекающиеся работы с максимальной суммарной выгодой и вернуть их ID. Для (0,3,5),(1,4,6),(3,5,5),(0,5,11) оптимум 11. Выведите DP и найдите предшественников эффективно; почему жадный выбор по end недостаточен?

Материалы задачи: [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/), [ex-python](https://exercism.org/tracks/python/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises).

Предварительное основание уровня: Требуется самостоятельный вывод DP и восстановление решения.

**Senior**

### Внешняя сортировка журнала

ID: `research:algorithms:Senior` · Алгоритмы и структуры данных · развёрнутый кейс · ориентир 35 мин.

Файл 500 ГБ содержит записи (user_id,event_time,event_id), доступно 1 ГБ RAM. Нужно упорядочить по всем трём полям и удалить точные дубли, сохранив потоковый вывод. Спроектируйте размер runs, k-way merge и обработку ограничения 128 открытых файлов; оцените число проходов и дисковую работу.

Материалы задачи: [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/), [ex-python](https://exercism.org/tracks/python/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises).

Предварительное основание уровня: Нужно учитывать внешнюю память, файловые лимиты и корректность merge.

**Lead**

### Проверяемая смена шардирования

ID: `research:algorithms:Lead` · Алгоритмы и структуры данных · развёрнутый кейс · ориентир 40 мин.

Хранилище ключей переходит с hash(key)%8 на hash(key)%16; записи продолжаются, удаление также возможно. Зафиксируйте алгоритм маршрутизации и переноса, при котором клиент не читает устаревшую запись после подтверждённой записи/удаления. Доступны версии записей и tombstones, но нет транзакции между шардами. Приведите контрпример наивному «копировать и переключить» и план проверки инварианта.

Материалы задачи: [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/), [ex-python](https://exercism.org/tracks/python/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises).

Предварительное основание уровня: Нужно доказать алгоритмический инвариант через конкурентную миграцию.

## HTML, CSS и доступность

Источники тем: [Learn web development](https://developer.mozilla.org/en-US/docs/Learn_web_development); [Figma Learn Design exercises](https://www.figma.com/resource-library/getting-started-in-design/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Форма без мыши

ID: `research:web-platform:Intern` · HTML, CSS и доступность · код · ориентир 15 мин.

Форма содержит два input без label и div с текстом «Отправить» и обработчиком click. Напишите доступную HTML-версию: email обязателен, ошибка привязана к полю, отправка работает с клавиатуры. Объясните порядок Tab и поведение Enter; CSS должен сохранять видимый фокус.

Материалы задачи: [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [figma](https://www.figma.com/resource-library/getting-started-in-design/).

Предварительное основание уровня: Нужно создать рабочую форму с несколькими состояниями.

**Junior**

### Сетка с длинными названиями

ID: `research:web-platform:Junior` · HTML, CSS и доступность · код · ориентир 20 мин.

В контейнере шириной от 320 до 1200px нужен список карточек не уже 240px, с промежутком 16px. Длинное непрерывное название не должно расширять страницу; кнопки карточек должны быть у нижнего края. Напишите HTML/CSS без фиксированной высоты текста и поясните поведение на 320px и при zoom 200%.

Материалы задачи: [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [figma](https://www.figma.com/resource-library/getting-started-in-design/).

Предварительное основание уровня: Нужно согласовать несколько правил раскладки и проверить крайние размеры.

**Middle**

### Модальное окно с вложенным выбором

ID: `research:web-platform:Middle` · HTML, CSS и доступность · развёрнутый кейс · ориентир 25 мин.

Из таблицы открывается dialog редактирования; внутри него открывается второй dialog выбора даты. Составьте управление фокусом: начальный фокус, Escape, Tab, возврат после закрытия каждого окна. Строка таблицы может быть удалена, пока окно открыто. Покажите тесты клавиатурой и объясните inert для фона.

Материалы задачи: [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [figma](https://www.figma.com/resource-library/getting-started-in-design/).

Предварительное основание уровня: Требуется спроектировать поведение при динамическом DOM.

**Senior**

### Большая доступная таблица

ID: `research:web-platform:Senior` · HTML, CSS и доступность · развёрнутый кейс · ориентир 30 мин.

Каталог содержит 100000 строк и 20 колонок; полный DOM тормозит, пользователи screen reader и клавиатуры должны находить и редактировать записи. Сравните пагинацию и виртуализацию, задайте контракт фокуса при удалении строки, aria row indices и проверку времени отклика. При поиске сервер отдаёт результат через 500ms.

Материалы задачи: [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [figma](https://www.figma.com/resource-library/getting-started-in-design/).

Предварительное основание уровня: Нужно сравнить стратегии по нескольким конфликтующим ограничениям.

**Lead**

### Миграция компонентов формы

ID: `research:web-platform:Lead` · HTML, CSS и доступность · развёрнутый кейс · ориентир 35 мин.

В 12 приложениях используются разные поля ввода; новая библиотека должна сохранить совместимость, WCAG-поведение и поддержку тем. За 6 недель можно мигрировать только 3 приложения. Предложите контракт HTML/ARIA, CSS-токенов и ошибок, критерии выбора пилота, проверку регрессий и откат. Как предотвратить «одинаковый вид, разное клавиатурное поведение»?

Материалы задачи: [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [figma](https://www.figma.com/resource-library/getting-started-in-design/).

Предварительное основание уровня: Нужно обеспечить проверяемые гарантии общей системы при ограниченном rollout.

## JavaScript и TypeScript

Источники тем: [TypeScript Handbook: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html); [Learn web development](https://developer.mozilla.org/en-US/docs/Learn_web_development); [Full Stack Open](https://fullstackopen.com/en/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Копия и обновление массива

ID: `research:javascript-typescript:Intern` · JavaScript и TypeScript · код · ориентир 12 мин.

Есть rows=[{id:1,done:false},{id:2,done:false}]. Напишите функцию, которая меняет done только у id=2, не изменяя исходный массив и его объекты. Для неизменённой строки сохраните ссылку. Покажите три проверки равенства ссылок и объясните, почему spread массива сам по себе не копирует объекты.

Материалы задачи: [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно реализовать и проверить семантику ссылок.

**Junior**

### Тип состояний загрузки

ID: `research:javascript-typescript:Junior` · JavaScript и TypeScript · код · ориентир 15 мин.

Задайте TypeScript-тип LoadState&lt;T> для idle, loading, success с data и error с message. Напишите render, который не может читать data в loading и проверяет исчерпываемость ветвей. Что произойдёт при добавлении состояния cancelled?

Материалы задачи: [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно сформулировать контракт типов и его эволюцию.

**Middle**

### Устаревший ответ поиска

ID: `research:javascript-typescript:Middle` · JavaScript и TypeScript · код · ориентир 25 мин.

Вводится a, затем ab; запрос ab завершился раньше a. Напишите JS/TS-слой поиска с debounce 200ms, отменой и запретом применения устаревшего результата. Почему одного AbortController недостаточно? Покажите тест, где ответ уже получен, но его обработка ещё ожидает microtask.

Материалы задачи: [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно разобрать гонку между отменой и фиксацией результата.

**Senior**

### Валидация на границе типов

ID: `research:javascript-typescript:Senior` · JavaScript и TypeScript · код · ориентир 30 мин.

TypeScript SDK получает JSON с amount, currency и createdAt. Сервер начал присылать amount строкой и иногда currency=null; код делает response as Payment. Спроектируйте runtime parser, версии контракта и обработку несовместимости. Деньги могут превышать безопасный integer JS. Приведите тесты на потерю точности и неизвестные поля.

Материалы задачи: [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Взаимодействуют внешний контракт, точность данных и совместимость.

**Lead**

### SDK для нескольких потребителей

ID: `research:javascript-typescript:Lead` · JavaScript и TypeScript · развёрнутый кейс · ориентир 35 мин.

Один TypeScript SDK используется браузером, Node.js и React Native. Новая версия меняет формат ошибок и способ отмены; старые потребители обновятся через 3 месяца. Опишите public API, совместимость ESM/CJS по целевым окружениям, adapter layer и набор контрактных тестов. Как проверить, что типы и фактическое поведение ошибок совпадают?

Материалы задачи: [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно обеспечить технический контракт нескольких платформ и версий.

## React: состояние и асинхронные данные

Источники тем: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect); [React Learn](https://react.dev/learn); [Full Stack Open](https://fullstackopen.com/en/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Счётчик и производное значение

ID: `research:react:Intern` · React: состояние и асинхронные данные · код · ориентир 12 мин.

В React-компоненте counter хранится в useState, а doubled обновляется отдельным useEffect. Перепишите компонент так, чтобы doubled не мог отстать. Кнопка должна увеличивать counter два раза за одно нажатие. Покажите код и объясните functional updater.

Материалы задачи: [react-effects](https://react.dev/learn/you-might-not-need-an-effect), [react](https://react.dev/learn), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно исправить код с двумя связанными ошибками состояния.

**Junior**

### Перестановка редактируемых строк

ID: `research:react:Junior` · React: состояние и асинхронные данные · код · ориентир 18 мин.

Список React-строк использует key=index; каждая строка имеет локальный draft. После сортировки draft оказался у другой записи. Напишите исправление и тест для вставки строки в начало и удаления редактируемой строки. Когда draft следует вынести из строки в родителя?

Материалы задачи: [react](https://react.dev/learn), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно восстановить корректную идентичность и срок жизни данных.

**Middle**

### Оптимистическое редактирование

ID: `research:react:Middle` · React: состояние и асинхронные данные · развёрнутый кейс · ориентир 25 мин.

Два React-клиента редактируют карточку с version=7. Клиент A оптимистически меняет название, B успевает сохранить version=8; ответ A — 409 и новая версия. Опишите состояние UI, запрос с expectedVersion и восстановление без потери локального текста. Пользователь ещё изменил текст, пока A ожидал.

Материалы задачи: [react](https://react.dev/learn), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно обработать серверный и локальный конфликт одновременно.

**Senior**

### SSR и персональные данные

ID: `research:react:Senior` · React: состояние и асинхронные данные · развёрнутый кейс · ориентир 30 мин.

React-приложение рендерится на сервере; HTML кешируется CDN по URL. Компонент /me читает имя пользователя и экспериментальную группу. Воспроизводится показ чужого имени, иногда hydration mismatch. Предложите границу кеширования, сериализацию initial state и диагностику несовпадения; какие данные нельзя поместить в общий HTML?

Материалы задачи: [react](https://react.dev/learn), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно согласовать SSR, кеш и приватность через несколько границ.

**Lead**

### Общий слой запросов

ID: `research:react:Lead` · React: состояние и асинхронные данные · развёрнутый кейс · ориентир 35 мин.

Пять React-приложений имеют разные query caches. Нужны logout без чужих данных, optimistic mutations, dedup, offline и SSR. Опишите ключи identity/tenant, invalidation, cancel и conformance-тесты. Зафиксируйте, что гарантирует общий слой, а что остаётся предметным правилом приложения; предложите миграцию одного критичного экрана.

Материалы задачи: [react](https://react.dev/learn), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно спроектировать библиотечные гарантии и их внедрение.

## Реактивность Vue и Angular

Источники тем: [Vue interactive tutorial](https://vuejs.org/tutorial/); [Angular tutorials](https://angular.dev/tutorials); [TypeScript Handbook: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Vue: фильтр списка

ID: `research:vue-angular:Intern` · Реактивность Vue и Angular · код · ориентир 15 мин.

Во Vue 3 есть ref массив товаров и ref search. Напишите computed для фильтрации без изменения массива и шаблон с устойчивыми key. После изменения названия товара фильтр должен обновиться. Объясните разницу computed и ручного пересчёта по клику.

Материалы задачи: [vue](https://vuejs.org/tutorial/), [angular](https://angular.dev/tutorials), [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

Предварительное основание уровня: Нужно собрать реактивный компонент с изменяемыми данными.

**Junior**

### Angular: валидация формы

ID: `research:vue-angular:Junior` · Реактивность Vue и Angular · код · ориентир 20 мин.

Angular-форма имеет email и confirmEmail. Нужны обязательность, проверка формата и совпадения; серверный 409 сообщает занятый email. Опишите typed reactive form, validator уровня группы и отображение ошибок после touched/submit. Покажите тест, где серверная ошибка исчезает только после изменения email.

Материалы задачи: [angular](https://angular.dev/tutorials), [vue](https://vuejs.org/tutorial/), [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

Предварительное основание уровня: Нужно определить несколько независимых источников ошибок.

**Middle**

### Vue: watcher и отмена

ID: `research:vue-angular:Middle` · Реактивность Vue и Angular · код · ориентир 25 мин.

Во Vue search меняется три раза, watcher вызывает fetch; ответы приходят в обратном порядке. Напишите watcher с cleanup и revision, чтобы список соответствовал последнему запросу. Компонент может unmount до ответа. Покажите порядок событий теста и объясните, когда результат нельзя фиксировать.

Материалы задачи: [vue](https://vuejs.org/tutorial/), [angular](https://angular.dev/tutorials), [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

Предварительное основание уровня: Нужно доказать корректность асинхронного реактивного эффекта.

**Senior**

### Angular: поток поиска

ID: `research:vue-angular:Senior` · Реактивность Vue и Angular · код · ориентир 30 мин.

Angular-компонент делает subscribe внутри subscribe для поиска и детали выбранной строки. При быстром выборе показывается старая деталь; после ухода остаются подписки. Постройте RxJS pipeline с distinctUntilChanged, switchMap и завершением при уничтожении; ошибки поиска не должны навсегда закрывать ввод. Приведите marble-сценарий.

Материалы задачи: [angular](https://angular.dev/tutorials), [vue](https://vuejs.org/tutorial/), [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

Предварительное основание уровня: Требуется корректная композиция и проверка нескольких потоков событий.

**Lead**

### Смешанная миграция UI

ID: `research:vue-angular:Lead` · Реактивность Vue и Angular · развёрнутый кейс · ориентир 35 мин.

Часть продукта на Vue, часть на Angular; общий редактор должен сохранять черновик при переходе между ними. Framework-neutral контракт передаёт snapshot и revision, доступны Web Components либо route-level integration. Выберите границу, опишите events, ownership и cleanup. Как проверить совместимость и отсутствие двух источников истины?

Материалы задачи: [vue](https://vuejs.org/tutorial/), [angular](https://angular.dev/tutorials), [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

Предварительное основание уровня: Нужно обеспечить совместимость двух реализаций общего поведения.

## API: FastAPI и Node.js

Источники тем: [FastAPI Tutorial](https://fastapi.tiangolo.com/tutorial/); [Full Stack Open](https://fullstackopen.com/en/); [PostgreSQL Tutorial](https://www.postgresql.org/docs/current/tutorial.html). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### FastAPI: вход и ошибка

ID: `research:backend-api:Intern` · API: FastAPI и Node.js · код · ориентир 15 мин.

Напишите FastAPI endpoint POST /items для {name,quantity}; name непустое после trim, quantity — строго целое от 1 до 100, строка "3" недопустима. Ответ 201 содержит ID и нормализованное имя. Покажите модели и три ошибочных запроса. ID создаётся сервером.

Материалы задачи: [fastapi](https://fastapi.tiangolo.com/tutorial/), [fullstack](https://fullstackopen.com/en/), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно реализовать контракт с типами, нормализацией и ошибками.

**Junior**

### Node.js: ошибка асинхронного обработчика

ID: `research:backend-api:Junior` · API: FastAPI и Node.js · код · ориентир 20 мин.

Node.js API использует async createOrder(req.body); функция может выбросить ValidationError либо DatabaseError. Напишите слой обработки, который возвращает 400 с безопасной причиной либо 503 с requestId, без stack trace и без двойного ответа. Опишите проверку тестом reject после await и журналирование.

Материалы задачи: [fastapi](https://fastapi.tiangolo.com/tutorial/), [fullstack](https://fullstackopen.com/en/), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно реализовать корректную обработку асинхронных отказов.

**Middle**

### FastAPI: идемпотентный платёж

ID: `research:backend-api:Middle` · API: FastAPI и Node.js · развёрнутый кейс · ориентир 30 мин.

POST /payments получает Idempotency-Key; провайдер может списать деньги, но ответ потеряется. Два одновременных запроса используют тот же ключ, иногда с разным amount. Спроектируйте FastAPI service + PostgreSQL хранение состояний и ответы 201/202/409. Что нужно запросить у провайдера, чтобы повтор не сделал второе списание?

Материалы задачи: [fastapi](https://fastapi.tiangolo.com/tutorial/), [fullstack](https://fullstackopen.com/en/), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно согласовать локальную и внешнюю границы отказа.

**Senior**

### Node.js: CPU и хвост задержки

ID: `research:backend-api:Senior` · API: FastAPI и Node.js · развёрнутый кейс · ориентир 30 мин.

API Node.js обрабатывает 300 req/s; синхронный расчёт в одном endpoint занимает 80ms CPU. После его вызовов p99 всех endpoints превышает 2s, CPU одного ядра 100%. Выведите ограничение пропускной способности расчёта, предложите изоляцию и backpressure. Как тестом отделить event loop lag от ожидания БД?

Материалы задачи: [fastapi](https://fastapi.tiangolo.com/tutorial/), [fullstack](https://fullstackopen.com/en/), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно количественно оценить bottleneck и проверить причинность.

**Lead**

### Версия API и постепенная миграция

ID: `research:backend-api:Lead` · API: FastAPI и Node.js · развёрнутый кейс · ориентир 40 мин.

FastAPI и Node.js сервисы читают общий Payment DTO. amount:number меняется на amountMinor:string и currency; клиенты обновляются 90 дней. Нельзя терять точность и повторно списывать после retry. Опишите версии, adapter, rollout и contract tests, включая сетевой сбой между записью и ответом. Какие новые значения невозможно безопасно отдать старому клиенту?

Материалы задачи: [fastapi](https://fastapi.tiangolo.com/tutorial/), [fullstack](https://fullstackopen.com/en/), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно обеспечить контракт данных и операций на нескольких стэках.

## Java и Go: коллекции и конкурентность

Источники тем: [Java exercises](https://exercism.org/tracks/java/exercises); [Go exercises](https://exercism.org/tracks/go/exercises); [6.006: Introduction to Algorithms — assignments](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Java: группировка событий

ID: `research:java-go:Intern` · Java и Go: коллекции и конкурентность · код · ориентир 15 мин.

На Java напишите Map&lt;String,Integer> countByType(List&lt;Event>), пропуская null Event и пустой type. Не изменяйте список. Для [A,null,B,A,empty] ожидается {A:2,B:1}. Покажите обработку отсутствующего ключа и тест для пустого списка.

Материалы задачи: [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Предварительное основание уровня: Нужно реализовать коллекционный контракт с отсутствующими значениями.

**Junior**

### Go: копия слайса

ID: `research:java-go:Junior` · Java и Go: коллекции и конкурентность · код · ориентир 18 мин.

Go-функция получает []int и возвращает отсортированную копию. Вызывающий сохраняет исходный slice; capacity больше length. Напишите решение и тест, который обнаружит мутацию общей backing array. Чем s[:len(s)] отличается от копии?

Материалы задачи: [ex-go](https://exercism.org/tracks/go/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Предварительное основание уровня: Нужно разобраться в семантике памяти и написать регрессионный тест.

**Middle**

### Go: pipeline и ранняя остановка

ID: `research:java-go:Middle` · Java и Go: коллекции и конкурентность · код · ориентир 30 мин.

Источник Go отправляет значения в channel; два workers вычисляют результат. Потребитель останавливается после 10 значений. Реализуйте context cancellation и закрытие channels без утечки goroutines и panic. Опишите, кто закрывает каждый channel и как тестировать остановку во время blocked send.

Материалы задачи: [ex-go](https://exercism.org/tracks/go/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Предварительное основание уровня: Нужно доказать корректность завершения нескольких конкурентных участников.

**Senior**

### Java: ограниченный executor

ID: `research:java-go:Senior` · Java и Go: коллекции и конкурентность · развёрнутый кейс · ориентир 30 мин.

Java-сервис отправляет задачи в fixedThreadPool, очередь растёт до 2 млн задач. Задачи делают внешние запросы, timeout клиента не отменяет работу. Спроектируйте bounded ThreadPoolExecutor, политику rejection и deadline/cancellation. Как гарантировать освобождение connection при исключении и проверить нагрузкой восстановление после overload?

Материалы задачи: [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Предварительное основание уровня: Нужно обеспечить управляемую деградацию при перегрузке.

**Lead**

### Конкурентный контракт двух SDK

ID: `research:java-go:Lead` · Java и Go: коллекции и конкурентность · развёрнутый кейс · ориентир 35 мин.

Java и Go SDK отправляют batch запросов с максимум 8 параллельными операциями. На отмену требуется завершить дочерние операции за 2s; ошибка одного элемента не отменяет остальные. Опишите общий контракт ordering, deadlines и errors, реализуемые механизмы в обоих языках и conformance traces. Как выявить SDK, который возвращает до остановки дочерних операций?

Материалы задачи: [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Предварительное основание уровня: Нужно проверить одинаковые гарантийные свойства двух реализаций.

## Android/Kotlin и iOS/Swift

Источники тем: [Android Basics with Compose](https://developer.android.com/courses/android-basics-compose/course); [Introducing SwiftUI](https://developer.apple.com/tutorials/swiftui). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Android: восстановление счётчика

ID: `research:mobile-native:Intern` · Android/Kotlin и iOS/Swift · код · ориентир 15 мин.

Экран Android на Kotlin показывает счётчик. После поворота значение теряется, после перезапуска процесса тоже. Предложите хранение для каждого сценария, покажите минимальный код состояния и тест. Какие данные не стоит сохранять в SavedStateHandle из-за размера?

Материалы задачи: [android](https://developer.android.com/courses/android-basics-compose/course), [ios](https://developer.apple.com/tutorials/swiftui).

Предварительное основание уровня: Нужно правильно выбрать слой хранения для двух lifecycle событий.

**Junior**

### Swift: состояние редактирования

ID: `research:mobile-native:Junior` · Android/Kotlin и iOS/Swift · код · ориентир 20 мин.

В SwiftUI список редактирует запись value type. Редактор получает копию записи; после Save список не обновляется. Покажите контракт Binding либо явного callback, отмену без изменения исходной записи и стабильную identity строки. Чем @State черновика отличается от canonical модели?

Материалы задачи: [ios](https://developer.apple.com/tutorials/swiftui), [android](https://developer.android.com/courses/android-basics-compose/course).

Предварительное основание уровня: Нужно реализовать контракт владельца состояния и отмены.

**Middle**

### Android: offline outbox

ID: `research:mobile-native:Middle` · Android/Kotlin и iOS/Swift · развёрнутый кейс · ориентир 30 мин.

Kotlin-приложение создаёт заявки без сети. После reconnect клиент отправил заявку, сервер сохранил, но ответ потерялся; WorkManager повторил отправку. Опишите Room outbox, stable client ID, transaction записи заявки+outbox и серверный ключ повтора. Как отобразить pending/failed/synced и восстановиться после смерти процесса?

Материалы задачи: [android](https://developer.android.com/courses/android-basics-compose/course), [ios](https://developer.apple.com/tutorials/swiftui).

Предварительное основание уровня: Нужно спроектировать протокол между durable local state и сервером.

**Senior**

### iOS: отмена и применение ответа

ID: `research:mobile-native:Senior` · Android/Kotlin и iOS/Swift · код · ориентир 30 мин.

Swift async экран загружает карточку A, затем B; A отвечает позже. Экран может исчезнуть, а Task продолжить запрос. Спроектируйте actor-isolated repository, MainActor commit, cancellation и revision guard. Покажите тест обратного порядка и поясните, почему cancellation не заменяет проверки актуальности.

Материалы задачи: [ios](https://developer.apple.com/tutorials/swiftui), [android](https://developer.android.com/courses/android-basics-compose/course).

Предварительное основание уровня: Взаимодействуют actor isolation, отмена и жизненный цикл экрана.

**Lead**

### Миграция локальной схемы

ID: `research:mobile-native:Lead` · Android/Kotlin и iOS/Swift · развёрнутый кейс · ориентир 40 мин.

Android и iOS приложения переходят на новую offline-схему заявок. Пользователь может не обновляться 6 месяцев; в outbox есть неотправленные старые записи. Нельзя удалить пользовательский текст или отправить заявку дважды. Опишите versioned payload, миграцию БД, server adapters, recovery после прерывания и критерии rollout.

Материалы задачи: [android](https://developer.android.com/courses/android-basics-compose/course), [ios](https://developer.apple.com/tutorials/swiftui).

Предварительное основание уровня: Нужно обеспечить долгую совместимость и отказоустойчивую миграцию двух платформ.

## Flutter/Dart и React Native

Источники тем: [Flutter learning resources / codelabs](https://docs.flutter.dev/reference/learning-resources); [React Native: Learn the Basics](https://reactnative.dev/docs/tutorial); [Full Stack Open](https://fullstackopen.com/en/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Flutter: состояния запроса

ID: `research:mobile-cross:Intern` · Flutter/Dart и React Native · код · ориентир 15 мин.

Flutter-экран на Dart должен показывать loading, empty, data и error для Future&lt;List&lt;Item>>. Напишите реализацию без запуска нового запроса при каждом build; добавьте Retry. Покажите поведение пустого ответа и объясните, где хранится Future.

Материалы задачи: [flutter](https://docs.flutter.dev/reference/learning-resources), [react-native](https://reactnative.dev/docs/tutorial), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно собрать компонент с полным lifecycle запроса.

**Junior**

### React Native: редактируемый список

ID: `research:mobile-cross:Junior` · Flutter/Dart и React Native · код · ориентир 20 мин.

React Native FlatList содержит 5000 строк с TextInput. Используется index key и inline state внутри строки; после скролла текст исчезает. Исправьте ownership черновика, keyExtractor и обновление одной строки. Объясните, почему виртуализация меняет lifetime компонента.

Материалы задачи: [flutter](https://docs.flutter.dev/reference/learning-resources), [react-native](https://reactnative.dev/docs/tutorial), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно учесть идентичность и virtualized lifecycle.

**Middle**

### Dart: debounce и dispose

ID: `research:mobile-cross:Middle` · Flutter/Dart и React Native · код · ориентир 25 мин.

Dart-клиент ищет адрес; предыдущий HTTP-запрос нельзя физически отменить. Нужны debounce, защита от позднего ответа и запрет setState после dispose. Напишите компонентный алгоритм и тест с двумя Completer, которые завершаются в обратном порядке.

Материалы задачи: [flutter](https://docs.flutter.dev/reference/learning-resources), [react-native](https://reactnative.dev/docs/tutorial), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно доказать корректность при неотменяемом асинхронном запросе.

**Senior**

### React Native: поток событий

ID: `research:mobile-cross:Senior` · Flutter/Dart и React Native · развёрнутый кейс · ориентир 30 мин.

Native module выдаёт 2000 сенсорных событий/с; JS рисует график 60fps, очередь растёт, память достигает 700MB. Предложите batching/downsampling и bounded buffer с явной политикой потери. Как сохранить alarm события и проверить timestamp ordering после перехода приложения в background?

Материалы задачи: [flutter](https://docs.flutter.dev/reference/learning-resources), [react-native](https://reactnative.dev/docs/tutorial), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно спроектировать управление потоком через платформенную границу.

**Lead**

### Выбор общей мобильной архитектуры

ID: `research:mobile-cross:Lead` · Flutter/Dart и React Native · развёрнутый кейс · ориентир 35 мин.

Два приложения — Flutter и React Native — используют один offline API. Нужны редактирование заявок, native push и sync после обновления; команда не может одновременно переписать оба клиента. Опишите общий operation protocol и conformance tests, сравните UI migration с protocol migration и задайте критерии пилота/отката. Какие гарантии нельзя получить только выбором framework?

Материалы задачи: [flutter](https://docs.flutter.dev/reference/learning-resources), [react-native](https://reactnative.dev/docs/tutorial), [fullstack](https://fullstackopen.com/en/).

Предварительное основание уровня: Нужно выбрать проверяемую границу общей архитектуры и путь миграции.

## Pandas и NumPy: подготовка данных

Источники тем: [Pandas getting started tutorials](https://pandas.pydata.org/docs/getting_started/intro_tutorials/); [NumPy tutorials](https://numpy.org/numpy-tutorials/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Группы и пропуски

ID: `research:dataframes:Intern` · Pandas и NumPy: подготовка данных · код · ориентир 15 мин.

Pandas DataFrame содержит city=[A,A,B,B], amount=[10,None,0,20]. Получите по city сумму, число всех строк и число непустых amount. Покажите результат и объясните различие size/count. Для группы, где все amount пропущены, сумма должна остаться NaN, а не 0.

Материалы задачи: [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/), [numpy](https://numpy.org/numpy-tutorials/).

Предварительное основание уровня: Нужно реализовать агрегат с несколькими семантиками пропуска.

**Junior**

### Broadcasting нормализации

ID: `research:dataframes:Junior` · Pandas и NumPy: подготовка данных · код · ориентир 18 мин.

NumPy X имеет shape (4,3), mean и std рассчитаны по столбцам. Напишите стандартизацию без Python-цикла; один столбец постоянный. Задайте политику для std=0 и NaN, покажите shapes и проверку результата. Почему массив shape (4,) не является средним по столбцам?

Материалы задачи: [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/), [numpy](https://numpy.org/numpy-tutorials/).

Предварительное основание уровня: Нужно проверить векторизованный расчёт и граничные данные.

**Middle**

### Дубли в join справочника

ID: `research:dataframes:Middle` · Pandas и NumPy: подготовка данных · код · ориентир 25 мин.

В Pandas facts(order_id,customer_id,amount) 1 млн строк. После merge с customers(customer_id,segment) сумма amount выросла на 12%. В справочнике есть история сегментов. Опишите диагностику, correct as-of join по времени заказа и проверки cardinality. Почему drop_duplicates(customer_id) без правила выбора неверен?

Материалы задачи: [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/), [numpy](https://numpy.org/numpy-tutorials/).

Предварительное основание уровня: Нужно восстановить временной контракт данных и доказать корректность соединения.

**Senior**

### Данные не помещаются в RAM

ID: `research:dataframes:Senior` · Pandas и NumPy: подготовка данных · развёрнутый кейс · ориентир 30 мин.

CSV 120 ГБ с событиями нужно агрегировать по (day,user_id); RAM 4 ГБ, пользователей 80 млн. Чтение chunks решает размер входа, но итоговый dict растёт. Предложите Pandas/NumPy решение с внешним разбиением, dtype и merge агрегатов; оцените память и проверки equivalence на небольшом наборе.

Материалы задачи: [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/), [numpy](https://numpy.org/numpy-tutorials/).

Предварительное основание уровня: Требуются внешний алгоритм, оценка памяти и проверка типов.

**Lead**

### Контракт подготовки признаков

ID: `research:dataframes:Lead` · Pandas и NumPy: подготовка данных · развёрнутый кейс · ориентир 35 мин.

Три команды готовят один признак: timezone суток, пропуски и dtype различаются. Нужно воспроизводить обучение и inference спустя год; daily вход 300 ГБ. Спроектируйте versioned transformation contract, golden datasets и проверку эквивалентности Pandas, NumPy и Spark. Какие расхождения допустимы численно, а какие меняют смысл?

Материалы задачи: [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/), [numpy](https://numpy.org/numpy-tutorials/).

Предварительное основание уровня: Нужно обеспечить долгую воспроизводимость нескольких реализаций.

## Машинное обучение и scikit-learn

Источники тем: [Scikit-learn example gallery](https://scikit-learn.org/stable/auto_examples/index.html); [Учебник по машинному обучению](https://education.yandex.ru/handbook/ml); [18.650: Statistics for Applications — assignments](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Метрики редкого класса

ID: `research:classical-ml:Intern` · Машинное обучение и scikit-learn · расчёт с объяснением · ориентир 15 мин.

В выборке 1000 объектов, 20 положительных. Модель предсказала positive для 25 объектов; 15 из них действительно positive. Постройте confusion matrix, accuracy, precision и recall. Сравните с моделью «все negative» и выберите метрику, если пропуск positive стоит дороже.

Материалы задачи: [sklearn](https://scikit-learn.org/stable/auto_examples/index.html), [yandex-ml](https://education.yandex.ru/handbook/ml), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/).

Предварительное основание уровня: Нужно рассчитать и интерпретировать несколько метрик.

**Junior**

### Pipeline без утечки

ID: `research:classical-ml:Junior` · Машинное обучение и scikit-learn · код · ориентир 20 мин.

В scikit-learn сначала StandardScaler.fit_transform применён ко всем данным, затем train_test_split и LogisticRegression. Исправьте код для cross-validation с подбором C и пропусками. Объясните, на каких данных обучается imputer/scaler внутри каждого fold и как оставить финальный test нетронутым.

Материалы задачи: [sklearn-leakage](https://scikit-learn.org/stable/common_pitfalls.html), [sklearn](https://scikit-learn.org/stable/auto_examples/index.html), [yandex-ml](https://education.yandex.ru/handbook/ml), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/).

Предварительное основание уровня: Нужно исправить утечку в полном процессе подбора.

**Middle**

### Предсказание для новых организаций

ID: `research:classical-ml:Middle` · Машинное обучение и scikit-learn · развёрнутый кейс · ориентир 25 мин.

Есть 100000 строк от 400 организаций. Внутри организации повторы; целевая эксплуатация — новые организации. Random split даёт ROC-AUC 0.94, GroupKFold 0.72. Спроектируйте validation, baseline, confidence interval и анализ признаков, позволяющих узнавать организацию. Как поступить с почти уникальным organization_id?

Материалы задачи: [sklearn](https://scikit-learn.org/stable/auto_examples/index.html), [yandex-ml](https://education.yandex.ru/handbook/ml), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/).

Предварительное основание уровня: Нужно проектировать оценку generalization при зависимых данных.

**Senior**

### Порог после смены базовой частоты

ID: `research:classical-ml:Senior` · Машинное обучение и scikit-learn · расчёт с объяснением · ориентир 30 мин.

Классификатор откалиброван при prevalence=0.2; в новой среде prevalence=0.02. Допустим prior probability shift: p(x|y) неизменно. Выведите преобразование старых posterior odds в новые. При цене FN=50 и FP=1 определите threshold по новой posterior и план проверки предпосылки.

Материалы задачи: [sklearn-threshold](https://scikit-learn.org/stable/modules/classification_threshold.html), [sklearn](https://scikit-learn.org/stable/auto_examples/index.html), [yandex-ml](https://education.yandex.ru/handbook/ml), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/).

Предварительное основание уровня: Требуется вывести вероятностное преобразование и решение по стоимости.

**Lead**

### Допуск модели к дорогому решению

ID: `research:classical-ml:Lead` · Машинное обучение и scikit-learn · развёрнутый кейс · ориентир 40 мин.

Модель кредитного риска снизила средний loss на 4%, но новых клиентов мало, drift по доходам и labels запаздывают на 90 дней. Спроектируйте release protocol: temporal validation, segment uncertainty, calibration/cost, shadow/canary и fallback. Как отделить изменение политики выдачи от улучшения предсказания?

Материалы задачи: [sklearn](https://scikit-learn.org/stable/auto_examples/index.html), [yandex-ml](https://education.yandex.ru/handbook/ml), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/).

Предварительное основание уровня: Нужно согласовать статистическую валидность и эксплуатационное решение.

## PyTorch и TensorFlow: обучение и inference

Источники тем: [TensorFlow tutorials](https://www.tensorflow.org/tutorials); [PyTorch tutorials](https://docs.pytorch.org/tutorials/); [Учебник по машинному обучению](https://education.yandex.ru/handbook/ml). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### TensorFlow: формы и loss

ID: `research:deep-learning:Intern` · PyTorch и TensorFlow: обучение и inference · код · ориентир 15 мин.

Бинарный классификатор TensorFlow выдаёт logits shape (8,1), labels имеют shape (8,). Задайте согласованные формы, BinaryCrossentropy(from_logits=True) и расчёт accuracy по threshold logits. Что произойдёт, если применить sigmoid и оставить from_logits=True? Покажите тест на logits [-2,2].

Материалы задачи: [tensorflow](https://www.tensorflow.org/tutorials), [pytorch](https://docs.pytorch.org/tutorials/), [yandex-ml](https://education.yandex.ru/handbook/ml).

Предварительное основание уровня: Нужно связать tensor contract и математическую семантику loss.

**Junior**

### PyTorch: шаг обучения

ID: `research:deep-learning:Junior` · PyTorch и TensorFlow: обучение и inference · код · ориентир 20 мин.

Напишите PyTorch training step с optimizer.zero_grad, forward, loss.backward и optimizer.step. Для evaluation нужны dropout выключен и autograd отключён. Покажите, как получить среднюю loss эпохи при последнем batch меньшего размера; почему простое среднее batch losses неверно?

Материалы задачи: [pytorch](https://docs.pytorch.org/tutorials/), [tensorflow](https://www.tensorflow.org/tutorials), [yandex-ml](https://education.yandex.ru/handbook/ml).

Предварительное основание уровня: Нужно реализовать полный шаг и корректную метрику эпохи.

**Middle**

### Маска последовательностей

ID: `research:deep-learning:Middle` · PyTorch и TensorFlow: обучение и inference · код · ориентир 30 мин.

PyTorch модель выдаёт logits (B,T,V), targets (B,T), padding_id=0; длины последовательностей различаются. Напишите token loss только для непаддинговых позиций и сравните token-weighted и sequence-weighted средние. В batch есть полностью пустая последовательность. Как избежать деления на ноль и нечестного веса?

Материалы задачи: [pytorch](https://docs.pytorch.org/tutorials/), [tensorflow](https://www.tensorflow.org/tutorials), [yandex-ml](https://education.yandex.ru/handbook/ml).

Предварительное основание уровня: Нужно реализовать loss с неодинаковой длиной и вырожденными данными.

**Senior**

### Паритет экспорта модели

ID: `research:deep-learning:Senior` · PyTorch и TensorFlow: обучение и inference · развёрнутый кейс · ориентир 30 мин.

Модель PyTorch экспортирована для inference в TensorFlow-пайплайн; top-1 отличается на 3% примеров. Возможны другой порядок каналов, resize, dtype и режим batch normalization. Составьте порядок локализации по промежуточным tensors, golden inputs и численным допускам. Как отличить малую logit ошибку на границе решения от семантической ошибки preprocessing?

Материалы задачи: [pytorch](https://docs.pytorch.org/tutorials/), [tensorflow](https://www.tensorflow.org/tutorials), [yandex-ml](https://education.yandex.ru/handbook/ml).

Предварительное основание уровня: Нужно диагностировать расхождение нескольких реализаций численного контракта.

**Lead**

### Serving с лимитом памяти

ID: `research:deep-learning:Lead` · PyTorch и TensorFlow: обучение и inference · развёрнутый кейс · ориентир 40 мин.

Embedding модель занимает 6 ГБ, GPU 16 ГБ; входы от 10 до 4000 tokens. При concurrency=8 возникают OOM, p99 должен быть ≤300ms. Спроектируйте dynamic batching по token budget, admission control, warmup и fallback. Какие эксперименты нужны для выбора PyTorch/TensorFlow serving и проверки tail latency без скрытой потери запросов?

Материалы задачи: [pytorch](https://docs.pytorch.org/tutorials/), [tensorflow](https://www.tensorflow.org/tutorials), [yandex-ml](https://education.yandex.ru/handbook/ml).

Предварительное основание уровня: Нужно принять платформенное решение по воспроизводимым ресурсным измерениям.

## Excel, Power BI и Tableau

Источники тем: [Excel help and learning](https://support.microsoft.com/en-us/excel/); [Microsoft Learn for Power BI](https://learn.microsoft.com/en-us/training/powerplatform/power-bi); [Tableau free training](https://www.tableau.com/learn/training). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Excel: взвешенная доля

ID: `research:business-intelligence:Intern` · Excel, Power BI и Tableau · расчёт с объяснением · ориентир 12 мин.

В Excel две строки: канал A — 10 покупок из 20 визитов; B — 90 из 980. Рассчитайте общую конверсию формулой по суммам и покажите, почему среднее двух процентов неверно. Добавьте правило для нулевого общего знаменателя и проверку, что покупки не превышают визиты.

Материалы задачи: [excel](https://support.microsoft.com/en-us/excel/), [powerbi](https://learn.microsoft.com/en-us/training/powerplatform/power-bi), [tableau](https://www.tableau.com/learn/training).

Предварительное основание уровня: Нужно вычислить и защитить аналитический показатель.

**Junior**

### Power BI: модель фактов

ID: `research:business-intelligence:Junior` · Excel, Power BI и Tableau · код · ориентир 20 мин.

Есть sales(order_id,date_id,product_id,amount), products(product_id,category), calendar(date_id,month). Постройте star schema и DAX measure общей выручки, чтобы фильтры месяца и категории работали. Объясните cardinality и направление фильтра. Что случится при дубликате product_id в dimension?

Материалы задачи: [powerbi](https://learn.microsoft.com/en-us/training/powerplatform/power-bi), [excel](https://support.microsoft.com/en-us/excel/), [tableau](https://www.tableau.com/learn/training).

Предварительное основание уровня: Нужно построить модель, меру и проверку кардинальности.

**Middle**

### Tableau: фильтр и фиксированный знаменатель

ID: `research:business-intelligence:Middle` · Excel, Power BI и Tableau · код · ориентир 25 мин.

В Tableau нужно показать долю выручки выбранной категории от выручки всех категорий за выбранный месяц. Обычный фильтр категории меняет знаменатель на саму категорию. Предложите FIXED LOD либо иную модель расчёта, задайте порядок фильтров и тест на месяц с категориями 30 и 70. Выбранная категория с выручкой 30 должна дать 30%.

Материалы задачи: [tableau](https://www.tableau.com/learn/training), [excel](https://support.microsoft.com/en-us/excel/), [powerbi](https://learn.microsoft.com/en-us/training/powerplatform/power-bi).

Предварительное основание уровня: Требуется понять вычислительную область и порядок фильтрации.

**Senior**

### Одна метрика в трёх отчётах

ID: `research:business-intelligence:Senior` · Excel, Power BI и Tableau · развёрнутый кейс · ориентир 30 мин.

Excel, Power BI и Tableau показывают разную месячную выручку. В SQL факт содержит UTC timestamp, возвраты со знаком минус и late events. Определите общий контракт периода, currency, refunds и cutoff; предложите reconciliation по дням и ID. Почему совпадение месячной суммы не доказывает совпадение состава?

Материалы задачи: [powerbi](https://learn.microsoft.com/en-us/training/powerplatform/power-bi), [excel](https://support.microsoft.com/en-us/excel/), [tableau](https://www.tableau.com/learn/training).

Предварительное основание уровня: Нужно найти семантические расхождения нескольких аналитических систем.

**Lead**

### Управляемая аналитическая модель

ID: `research:business-intelligence:Lead` · Excel, Power BI и Tableau · развёрнутый кейс · ориентир 35 мин.

40 отчётов используют разные определения active user; новый контракт нужен без потери старых квартальных отчётов. Спроектируйте версионированную semantic model, certification отчётов, lineage, row-level access и rollout для Power BI/Tableau/Excel. Как доказать, что новый фильтр доступа не изменил агрегаты для разрешённой группы?

Материалы задачи: [powerbi](https://learn.microsoft.com/en-us/training/powerplatform/power-bi), [excel](https://support.microsoft.com/en-us/excel/), [tableau](https://www.tableau.com/learn/training).

Предварительное основание уровня: Нужно обеспечить governance с конкретными техническими гарантиями.

## Spark и Airflow: пакетные данные

Источники тем: [Spark SQL getting started](https://spark.apache.org/docs/latest/sql-getting-started.html); [Airflow tutorials](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html); [Pandas getting started tutorials](https://pandas.pydata.org/docs/getting_started/intro_tutorials/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Spark: фильтр и агрегат

ID: `research:batch-pipelines:Intern` · Spark и Airflow: пакетные данные · код · ориентир 15 мин.

Spark DataFrame содержит customer_id, amount и status. Напишите преобразования для суммы paid по customer_id; amount может быть NULL. Данные сохраняются в Parquet по date. Объясните lazy evaluation и место action; почему collect всего результата опасен?

Материалы задачи: [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [airflow](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html), [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/).

Предварительное основание уровня: Нужно составить распределённое преобразование и объяснить выполнение.

**Junior**

### Airflow: повторяемая дата

ID: `research:batch-pipelines:Junior` · Spark и Airflow: пакетные данные · развёрнутый кейс · ориентир 20 мин.

Airflow DAG ежедневно пересчитывает partition за logical date. Загрузка получила половину данных и task упал; retry должен заменить partition, не удвоить записи. Опишите staging, atomic publish и передачу маленьких метаданных через XCom. Почему datetime.now вместо data interval опасен при backfill?

Материалы задачи: [airflow](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/).

Предварительное основание уровня: Нужно спроектировать идемпотентность и временной контракт DAG.

**Middle**

### Spark: тяжёлый ключ join

ID: `research:batch-pipelines:Middle` · Spark и Airflow: пакетные данные · развёрнутый кейс · ориентир 30 мин.

Fact 2 ТБ соединяется со справочником 30 ГБ; один key встречается в 35% fact. Broadcast невозможен. Один reducer работает 70 минут, остальные 5. Предложите диагностику skew, salting/hot-key split и сборку результата без размножения строк. Как проверить сумму и cardinality после оптимизации?

Материалы задачи: [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [airflow](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html), [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/).

Предварительное основание уровня: Нужно менять распределённый алгоритм с доказательством эквивалентности.

**Senior**

### Late data и backfill

ID: `research:batch-pipelines:Senior` · Spark и Airflow: пакетные данные · развёрнутый кейс · ориентир 35 мин.

Airflow обновляет Spark витрину за последние 7 дней; события приходят с задержкой до 30 дней, справочник меняется ретроактивно. Потребители требуют reproducible monthly close и свежую online витрину. Спроектируйте две проекции, versioned backfill и атомарное переключение. Как обнаружить partial backfill и откатить публикацию?

Материалы задачи: [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [airflow](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html), [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/).

Предварительное основание уровня: Нужно согласовать временные контракты и отказоустойчивую публикацию.

**Lead**

### Общий протокол data products

ID: `research:batch-pipelines:Lead` · Spark и Airflow: пакетные данные · развёрнутый кейс · ориентир 40 мин.

10 DAG публикуют зависимые витрины в разное время; аналитик смешивает версии. Нужны SLA 06:00, backfill за год и отказ одного upstream без неверной публикации. Опишите контракт snapshots, dependency versions, lineage и admission; предложите измеримый план внедрения. Как потребитель выбирает согласованный срез?

Материалы задачи: [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [airflow](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html), [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/).

Предварительное основание уровня: Нужно построить проверяемые межpipeline гарантии и режим восстановления.

## Kafka и потоковая обработка

Источники тем: [Kafka quickstart](https://kafka.apache.org/quickstart/); [Spark SQL getting started](https://spark.apache.org/docs/latest/sql-getting-started.html); [PostgreSQL Tutorial](https://www.postgresql.org/docs/current/tutorial.html). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Порядок событий по ключу

ID: `research:streaming:Intern` · Kafka и потоковая обработка · развёрнутый кейс · ориентир 12 мин.

В Kafka topic три partitions. События одного заказа должны читаться по порядку; producer сейчас отправляет без key. Предложите ключ, объясните область гарантии порядка и покажите, почему consumer group не создаёт общий порядок между partitions.

Материалы задачи: [kafka](https://kafka.apache.org/quickstart/), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно применить модель партиционирования к предметному порядку.

**Junior**

### Commit после записи

ID: `research:streaming:Junior` · Kafka и потоковая обработка · развёрнутый кейс · ориентир 20 мин.

Kafka consumer читает событие, пишет строку в PostgreSQL и коммитит offset. Сбой случился после SQL commit, но до offset commit. Опишите повтор и схему event_id UNIQUE. Что изменится, если offset закоммитить до SQL?

Материалы задачи: [kafka](https://kafka.apache.org/quickstart/), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно разобрать два отказных сценария и обеспечить идемпотентность.

**Middle**

### Event-time окна

ID: `research:streaming:Middle` · Kafka и потоковая обработка · развёрнутый кейс · ориентир 30 мин.

Поток покупок содержит event_time и ingest_time; задержка до 10 минут. Нужна сумма за 5-минутные event-time окна, вывод предварительный и окончательный. Предложите watermark, state retention и late-event policy. Покажите пример, где событие 12:04 приходит в 12:11; почему processing-time окно неверно?

Материалы задачи: [kafka](https://kafka.apache.org/quickstart/), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно определить временную семантику результата и поздних данных.

**Senior**

### CDC и удаление

ID: `research:streaming:Senior` · Kafka и потоковая обработка · развёрнутый кейс · ориентир 35 мин.

CDC публикует upsert/delete с row version. При replay старое upsert пришло после нового delete, downstream воскресил строку. Опишите version-aware sink, retention tombstones и bootstrap snapshot+stream. Что делать с одинаковой version и разным payload?

Материалы задачи: [kafka](https://kafka.apache.org/quickstart/), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно доказать консистентность при нескольких режимах доставки.

**Lead**

### Сквозная гарантия доставки

ID: `research:streaming:Lead` · Kafka и потоковая обработка · развёрнутый кейс · ориентир 40 мин.

Kafka-поток должен обновлять витрину и отправлять внешнее уведомление. Kafka transactions доступны, внешний HTTP endpoint не поддерживает идемпотентность. Требование бизнеса — «ровно одно уведомление». Определите достижимые гарантии, контрпример потери ответа и изменение внешнего контракта. Спроектируйте outbox/reconciliation и критерии, когда система сообщает uncertain.

Материалы задачи: [kafka](https://kafka.apache.org/quickstart/), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Предварительное основание уровня: Нужно обосновать предел гарантий и изменить архитектурный контракт.

## Linux и диагностика сети

Источники тем: [The Missing Semester](https://missing.csail.mit.edu/); [Wireshark labs for Computer Networking](https://gaia.cs.umass.edu/kurose_ross/wireshark.php). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Права рабочего файла

ID: `research:systems-networking:Intern` · Linux и диагностика сети · развёрнутый кейс · ориентир 12 мин.

В Linux файл config имеет mode 0640 и владельца app:ops. Процесс запущен пользователем worker из группы ops. Может ли он читать, писать и выполнять файл? Предложите минимальное изменение для чтения конфигурации пользователем monitor без доступа остальных. Почему chmod 777 неверен?

Материалы задачи: [linux](https://missing.csail.mit.edu/), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Предварительное основание уровня: Нужно применить модель прав к конкретным пользователям.

**Junior**

### DNS или TCP

ID: `research:systems-networking:Junior` · Linux и диагностика сети · развёрнутый кейс · ориентир 20 мин.

Сервис не открывается: DNS отвечает A=10.0.0.8, ping проходит, TCP SYN на port 443 повторяется без SYN-ACK. Составьте Linux/Wireshark диагностику и список гипотез; каких данных недостаточно, чтобы обвинить приложение? Отличите timeout от TCP RST.

Материалы задачи: [linux](https://missing.csail.mit.edu/), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Предварительное основание уровня: Нужно выстроить диагностическую последовательность по наблюдениям.

**Middle**

### Файл удалён, диск полон

ID: `research:systems-networking:Middle` · Linux и диагностика сети · развёрнутый кейс · ориентир 25 мин.

Linux показывает df=100%, du на filesystem — 30%. Приложение удалило log, но продолжает его писать. Объясните расхождение, команды диагностики и безопасное освобождение места без уничтожения открытой БД. После рестарта log снова быстро растёт: предложите ротацию и ограничение.

Материалы задачи: [linux](https://missing.csail.mit.edu/), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Предварительное основание уровня: Нужно диагностировать состояние ядра и восстановить ресурс безопасно.

**Senior**

### TCP retransmission и p99

ID: `research:systems-networking:Senior` · Linux и диагностика сети · развёрнутый кейс · ориентир 30 мин.

Wireshark показывает повторные TCP сегменты, duplicate ACK и рост p99; сервер CPU=30%. После увеличения MTU часть клиентов перестала работать. Предложите проверку PMTU/MSS, packet loss и capture artefacts. Как проверить причинность откатом и избежать вывода о потере пакетов по одному capture?

Материалы задачи: [linux](https://missing.csail.mit.edu/), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Предварительное основание уровня: Требуется причинная диагностика сетевого и прикладного поведения.

**Lead**

### Надёжность сетевого пути

ID: `research:systems-networking:Lead` · Linux и диагностика сети · развёрнутый кейс · ориентир 40 мин.

Два региона используют разные VM, но один DNS provider и один межрегиональный VPN. Нужна доступность 99.95%; предлагается третий регион. Постройте failure model, тесты failover DNS/маршрутов, лимиты TTL и план измерений. Какие общие зависимости третий регион не устраняет, и как проверить сценарий частичного split?

Материалы задачи: [linux](https://missing.csail.mit.edu/), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Предварительное основание уровня: Нужно обосновать архитектурное решение через отказные зависимости.

## Docker и Kubernetes

Источники тем: [Docker workshop](https://docs.docker.com/get-started/tutorials/run-an-app/); [Kubernetes Tasks](https://kubernetes.io/docs/tasks/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Контейнер и данные

ID: `research:containers:Intern` · Docker и Kubernetes · код · ориентир 15 мин.

Docker-контейнер пишет uploads в /app/uploads; после удаления контейнера файлы исчезли. Напишите запуск с volume, объясните отличие image/container/volume и тест сохранности после пересоздания. Как не включить uploads и секреты в build context?

Материалы задачи: [docker](https://docs.docker.com/get-started/tutorials/run-an-app/), [kubernetes](https://kubernetes.io/docs/tasks/).

Предварительное основание уровня: Нужно реализовать durable хранение и проверить lifecycle контейнера.

**Junior**

### Readiness и restart loop

ID: `research:containers:Junior` · Docker и Kubernetes · код · ориентир 20 мин.

Kubernetes сервис стартует 90 секунд, liveness probe начинается на 10-й. Pods постоянно перезапускаются. Задайте startup/readiness/liveness probes и объясните, когда Pod получает трафик. Почему отказ общей БД не всегда должен убивать все Pods?

Материалы задачи: [kubernetes](https://kubernetes.io/docs/tasks/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Предварительное основание уровня: Нужно согласовать три разных health контракта.

**Middle**

### OOM и CPU throttling

ID: `research:containers:Middle` · Docker и Kubernetes · развёрнутый кейс · ориентир 25 мин.

Pod имеет request 100m/256Mi и limit 500m/512Mi; при burst CPU throttled, иногда OOMKilled. У node ещё 8 ГБ свободно. Предложите измерения working set, allocations и throttling, изменения resources и нагрузочную проверку. Почему свободная память node не отменяет container limit?

Материалы задачи: [kubernetes](https://kubernetes.io/docs/tasks/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Предварительное основание уровня: Нужно анализировать разные ресурсные ограничения и их последствия.

**Senior**

### Drain stateful workloads

ID: `research:containers:Senior` · Docker и Kubernetes · развёрнутый кейс · ориентир 30 мин.

Kubernetes node нужно обновить; на нём worker с локальным WAL и PodDisruptionBudget minAvailable=2 для трёх replicas. Один replica уже не готов. Спроектируйте drain/rollout, перенос WAL и критерии остановки. Что PDB не гарантирует при падении node и почему force delete опасен?

Материалы задачи: [kubernetes](https://kubernetes.io/docs/tasks/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Предварительное основание уровня: Нужно обеспечить последовательность обслуживания с состоянием и ограничением доступности.

**Lead**

### Платформа нескольких арендаторов

ID: `research:containers:Lead` · Docker и Kubernetes · развёрнутый кейс · ориентир 40 мин.

20 команд работают в одном Kubernetes cluster; одна burst задача вытесняет latency-sensitive API. Нужны quotas, workload isolation, supply-chain policy и measurable SLO без отдельного cluster каждому. Предложите границы namespaces/RBAC/network/resources и критерии, когда shared cluster недостаточен. Как проверить noisy-neighbor сценарий?

Материалы задачи: [kubernetes](https://kubernetes.io/docs/tasks/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Предварительное основание уровня: Нужно выбрать и проверить несколько уровней изоляции общей платформы.

## Terraform и Ansible

Источники тем: [Getting started with Ansible](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html); [Terraform tutorials](https://developer.hashicorp.com/terraform/tutorials). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Ansible: повторяемый каталог

ID: `research:infrastructure:Intern` · Terraform и Ansible · код · ориентир 15 мин.

Напишите Ansible playbook, создающий /srv/app владельцем app:app с mode 0750 и помещающий config из template. Повторный запуск без изменений не должен показывать changed; изменение template перезапускает службу через handler. Как проверить это двумя запусками?

Материалы задачи: [ansible](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html), [terraform](https://developer.hashicorp.com/terraform/tutorials).

Предварительное основание уровня: Нужно написать проверяемую конфигурацию с условной реакцией.

**Junior**

### Terraform: изменение адреса ресурса

ID: `research:infrastructure:Junior` · Terraform и Ansible · код · ориентир 20 мин.

Terraform resource переименован с app_old на app; plan предлагает destroy/create рабочей VM. Сохранить VM обязательно. Предложите moved block/state migration, проверку plan и порядок команд при remote state. Почему правка имени в конфиге не переносит identity?

Материалы задачи: [terraform](https://developer.hashicorp.com/terraform/tutorials), [ansible](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html).

Предварительное основание уровня: Нужно безопасно выполнить эволюцию IaC identity.

**Middle**

### Разделение config и provisioning

ID: `research:infrastructure:Middle` · Terraform и Ansible · развёрнутый кейс · ориентир 25 мин.

Terraform создаёт VM и security group, Ansible ставит сервис. Secret сейчас попадает в Terraform state, два operators запускают apply одновременно. Спроектируйте remote state locking, secret reference и этапы pipeline. Как обнаружить drift, не перезаписав аварийное ручное изменение без проверки?

Материалы задачи: [terraform](https://developer.hashicorp.com/terraform/tutorials), [ansible](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html).

Предварительное основание уровня: Нужно согласовать безопасность и управление состоянием двух инструментов.

**Senior**

### Частичный apply

ID: `research:infrastructure:Senior` · Terraform и Ansible · развёрнутый кейс · ориентир 30 мин.

Terraform создал сеть и две VM, третья упала; Ansible успел изменить конфиг одной VM. Повтор pipeline должен восстановить согласованное состояние без уничтожения рабочих узлов. Опишите idempotent stages, state recovery, health checks и rollback границы. Что делать, если реальный ресурс создан, но запись в state не сохранилась?

Материалы задачи: [terraform](https://developer.hashicorp.com/terraform/tutorials), [ansible](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html).

Предварительное основание уровня: Нужно восстановить несколько частичных состояний разных систем.

**Lead**

### Изменение IaC модулей

ID: `research:infrastructure:Lead` · Terraform и Ansible · развёрнутый кейс · ориентир 40 мин.

30 окружений используют Terraform module v1 и Ansible role v1; v2 меняет subnet layout и формат secrets. Одновременно можно мигрировать 2 окружения, outage≤5min. Предложите совместимость, state move, phased plan и допуск пилота. Как проверить сохранность identity и возможность отката после появления новых ресурсов?

Материалы задачи: [terraform](https://developer.hashicorp.com/terraform/tutorials), [ansible](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html).

Предварительное основание уровня: Нужно управлять миграцией инфраструктурного контракта многих потребителей.

## Prometheus, SLO и диагностика

Источники тем: [Getting started with Prometheus](https://prometheus.io/docs/tutorials/getting_started/); [Kubernetes Tasks](https://kubernetes.io/docs/tasks/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Counter после рестарта

ID: `research:observability:Intern` · Prometheus, SLO и диагностика · код · ориентир 12 мин.

Prometheus counter requests_total за минуты имеет значения 100,140,180,5,35: процесс перезапустился. Объясните, почему requests_total_now−requests_total_before неверен, и запишите запрос для скорости за 5 минут. Какой тип метрики нужен для числа текущих активных запросов?

Материалы задачи: [prometheus](https://prometheus.io/docs/tutorials/getting_started/), [kubernetes](https://kubernetes.io/docs/tasks/).

Предварительное основание уровня: Нужно связать вид метрики и корректный запрос.

**Junior**

### Кардинальность label

ID: `research:observability:Junior` · Prometheus, SLO и диагностика · развёрнутый кейс · ориентир 20 мин.

HTTP metric содержит user_id и raw URL; 2 млн пользователей и динамические /orders/{id}. Prometheus расходует 20 ГБ RAM. Предложите labels route/status/method, отдельно traces/logs и запрос error rate. Почему hashing user_id не уменьшает cardinality?

Материалы задачи: [prometheus](https://prometheus.io/docs/tutorials/getting_started/), [kubernetes](https://kubernetes.io/docs/tasks/).

Предварительное основание уровня: Нужно оценить и исправить модель данных наблюдаемости.

**Middle**

### SLO с бюджетом ошибок

ID: `research:observability:Middle` · Prometheus, SLO и диагностика · расчёт с объяснением · ориентир 25 мин.

SLO: 99.9% успешных запросов за 30 дней, трафик 10 млн запросов. За последние 2 часа ошибки 2%, за 24 часа 0.2%. Найдите общий budget и burn rate обоих окон. Предложите alert с быстрым и медленным окном и объясните, почему обычный CPU alert не заменяет пользовательский SLO.

Материалы задачи: [prometheus](https://prometheus.io/docs/tutorials/getting_started/), [kubernetes](https://kubernetes.io/docs/tasks/).

Предварительное основание уровня: Нужно выполнить расчёт и определить измеримый сигнал действия.

**Senior**

### Перцентили нескольких реплик

ID: `research:observability:Senior` · Prometheus, SLO и диагностика · код · ориентир 30 мин.

Каждая replica публикует свой p99 gauge; dashboard усредняет их и показывает 120ms. У одной replica p99=2s, трафик между replicas разный. Предложите histogram-based запрос общего p99, сравнение per-replica tails и выбор buckets для SLO250ms. Какие ограничения у агрегирования summaries?

Материалы задачи: [prometheus](https://prometheus.io/docs/tutorials/getting_started/), [kubernetes](https://kubernetes.io/docs/tasks/).

Предварительное основание уровня: Нужно понимать и проверять распределённую статистику latency.

**Lead**

### Единая модель SLO платформы

ID: `research:observability:Lead` · Prometheus, SLO и диагностика · развёрнутый кейс · ориентир 40 мин.

20 сервисов имеют «99.9%», но один считает только ответы до timeout, другой исключает 429, третий меряет health probe. Спроектируйте SLI contract, исключения, denominator и rollout alerts. Нужен customer-journey SLO через три сервиса; как избежать двойного подсчёта retries и доказать, что мониторинг не скрывает overload?

Материалы задачи: [prometheus](https://prometheus.io/docs/tutorials/getting_started/), [kubernetes](https://kubernetes.io/docs/tasks/).

Предварительное основание уровня: Нужно обеспечить достоверность общей модели надёжности нескольких сервисов.

## Git и доставка изменений

Источники тем: [Pro Git](https://git-scm.com/book/en/v2); [Full Stack Open](https://fullstackopen.com/en/); [Docker workshop](https://docs.docker.com/get-started/tutorials/run-an-app/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Изменения и коммит

ID: `research:delivery-git:Intern` · Git и доставка изменений · развёрнутый кейс · ориентир 12 мин.

В Git есть изменённый app.py, staged config.yml и untracked notes.txt. Нужно закоммитить только app.py, сохранив остальные изменения локально. Опишите команды и проверку состава commit. Почему git commit -a не подходит, а удаление notes.txt не требуется?

Материалы задачи: [git](https://git-scm.com/book/en/v2), [fullstack](https://fullstackopen.com/en/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Предварительное основание уровня: Нужно применить модель Git без потери чужих изменений.

**Junior**

### Конфликт merge и проверка

ID: `research:delivery-git:Junior` · Git и доставка изменений · развёрнутый кейс · ориентир 20 мин.

Две ветки изменили одну функцию расчёта комиссии: одна добавила минимум, другая округление. Merge конфликтует. Покажите порядок разрешения, тест для amount=1.01 и проверку обоих требований. Почему выбор целиком ours/theirs не гарантирует правильную функцию?

Материалы задачи: [git](https://git-scm.com/book/en/v2), [fullstack](https://fullstackopen.com/en/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Предварительное основание уровня: Нужно восстановить поведение из двух независимых изменений.

**Middle**

### Один artifact между средами

ID: `research:delivery-git:Middle` · Git и доставка изменений · развёрнутый кейс · ориентир 25 мин.

CI собирает Docker image отдельно для staging и production из того же commit; зависимости floating latest, результаты различаются. Спроектируйте build once/promote by digest, lockfiles, provenance и smoke gate. Как rollback выбирает точно проверенный image?

Материалы задачи: [git](https://git-scm.com/book/en/v2), [fullstack](https://fullstackopen.com/en/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Предварительное основание уровня: Нужно обеспечить воспроизводимость и трассируемость доставки.

**Senior**

### Canary с необратимой миграцией

ID: `research:delivery-git:Senior` · Git и доставка изменений · развёрнутый кейс · ориентир 30 мин.

Новая версия сервиса пишет поле, которого старая не понимает; миграция уже удалила старую колонку. Canary ухудшил p99 и errors. Предложите восстановление и future expand/contract policy. Как доказать совместимость rollback версии до rollout, включая новые данные?

Материалы задачи: [git](https://git-scm.com/book/en/v2), [fullstack](https://fullstackopen.com/en/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Предварительное основание уровня: Нужно оценить реальную обратимость и спроектировать безопасную доставку.

**Lead**

### Контракт выпуска платформы

ID: `research:delivery-git:Lead` · Git и доставка изменений · развёрнутый кейс · ориентир 40 мин.

12 сервисов должны выпускать изменения независимо, но shared event schema ломает downstream. Нужны consumer contracts, compatibility window и emergency rollback; полная integration среда стоит дорого. Предложите уровни проверок, ownership схем и критерии canary. Как предотвратить ситуацию, когда producer test проходит, а consumer падает?

Материалы задачи: [git](https://git-scm.com/book/en/v2), [fullstack](https://fullstackopen.com/en/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Предварительное основание уровня: Нужно согласовать децентрализованную доставку общей системы.

## QA: дизайн тестов и риск

Источники тем: [Atlassian Team Playbook](https://www.atlassian.com/team-playbook); [Postman scripts and test examples](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/); [Playwright getting started](https://playwright.dev/docs/intro). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Границы возраста

ID: `research:test-design:Intern` · QA: дизайн тестов и риск · развёрнутый кейс · ориентир 12 мин.

Форма принимает целый возраст от 18 до 65 включительно; пустое поле, дробь и строка отклоняются. Составьте минимальный набор boundary/equivalence тестов с ожидаемыми результатами. Покажите, какие ошибки ловят 17,18,65,66 и почему только 30 недостаточно.

Материалы задачи: [atlassian](https://www.atlassian.com/team-playbook), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro).

Предварительное основание уровня: Нужно составить компактный набор, способный найти разные дефекты.

**Junior**

### Таблица скидок

ID: `research:test-design:Junior` · QA: дизайн тестов и риск · развёрнутый кейс · ориентир 20 мин.

Скидка 10% только если клиент premium И сумма≥5000; при promo действует 15% вместо premium скидки, скидки не складываются. Составьте decision table, тесты для всех логических комбинаций и границы суммы. Найдите неоднозначность, если promo может быть просрочен, и оформите уточнение требования.

Материалы задачи: [atlassian](https://www.atlassian.com/team-playbook), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro).

Предварительное основание уровня: Нужно моделировать взаимодействующие правила и выявить пробел требования.

**Middle**

### Гонки бронирования

ID: `research:test-design:Middle` · QA: дизайн тестов и риск · развёрнутый кейс · ориентир 30 мин.

API бронирует последнее место. Два пользователя отправляют запрос одновременно, один запрос повторяется после timeout. Составьте deterministic тест-план с барьером конкурентного запуска, oracle состояния БД и ключами повтора. Что проверяется помимо количества HTTP200?

Материалы задачи: [atlassian](https://www.atlassian.com/team-playbook), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro).

Предварительное основание уровня: Нужно построить проверку инварианта, наблюдаемого через несколько слоёв.

**Senior**

### Флак в CI

ID: `research:test-design:Senior` · QA: дизайн тестов и риск · развёрнутый кейс · ориентир 30 мин.

Из 10000 запусков UI тест падает в 4%, в повторе проходит. Падения связаны с общим аккаунтом и ожиданием фиксированных 2s. Предложите эксперимент для разделения product race и test race, изоляцию fixtures и условные ожидания. Как rollout исправления покажет, что дефект не скрыт retries?

Материалы задачи: [atlassian](https://www.atlassian.com/team-playbook), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro).

Предварительное основание уровня: Нужно доказать улучшение качества проверки, а не снизить видимость failures.

**Lead**

### Приёмка критичного выпуска

ID: `research:test-design:Lead` · QA: дизайн тестов и риск · развёрнутый кейс · ориентир 40 мин.

Платёжная миграция меняет UI, API и reconciliation; времени 3 дня, полная regression занимает 5. Составьте risk-based release plan: инварианты денег и idempotency, уровни тестов, fixtures сбоев и production guardrails. Какие residual risks нужно назвать и что остановит rollout?

Материалы задачи: [atlassian](https://www.atlassian.com/team-playbook), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro).

Предварительное основание уровня: Нужно принять обоснованное решение о выпуске по неполной, но проверяемой информации.

## Playwright, Selenium и Postman

Источники тем: [Playwright getting started](https://playwright.dev/docs/intro); [Write your first Selenium script](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/); [Postman scripts and test examples](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Playwright: ожидание результата

ID: `research:test-automation:Intern` · Playwright, Selenium и Postman · код · ориентир 15 мин.

После клика «Сохранить» появляется сообщение «Сохранено». Напишите Playwright тест через role locators и web-first assertion; сервер может отвечать от 100ms до 3s. Проверяется также изменённое значение после перезагрузки. Почему waitForTimeout(3000) не доказывает сохранение?

Материалы задачи: [playwright](https://playwright.dev/docs/intro), [selenium](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/).

Предварительное основание уровня: Нужно написать тест UI и проверить серверное сохранение.

**Junior**

### Selenium: stale element

ID: `research:test-automation:Junior` · Playwright, Selenium и Postman · код · ориентир 20 мин.

Selenium нашёл строку таблицы, затем таблица перерисовалась после сортировки. Клик вызывает StaleElementReferenceException. Напишите Python helper, который повторно находит нужную строку по стабильному ID и ждёт clickable condition; повторы ограничены. Как избежать клика по другой строке?

Материалы задачи: [selenium](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/), [playwright](https://playwright.dev/docs/intro), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/).

Предварительное основание уровня: Нужно реализовать устойчивое ожидание динамического DOM.

**Middle**

### Postman: цепочка операции

ID: `research:test-automation:Middle` · Playwright, Selenium и Postman · код · ориентир 25 мин.

Postman collection создаёт заказ, получает 202+operationId и опрашивает статус до ready/failed. Напишите scripts для сохранения ID и проверок, задайте deadline, cleanup и запрет повторного POST при каждом poll. Как проверить конфликт idempotency key и не записать token в report?

Материалы задачи: [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro), [selenium](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/).

Предварительное основание уровня: Нужно реализовать многошаговый API тест с собственной state machine.

**Senior**

### Изоляция параллельного browser suite

ID: `research:test-automation:Senior` · Playwright, Selenium и Postman · развёрнутый кейс · ориентир 30 мин.

Playwright и Selenium suites запускаются по 16 workers на staging и делят аккаунт/заявку. Тест удаления ломает тест редактирования; cleanup может удалить чужой fixture. Спроектируйте namespace fixture, lease, cleanup ownership и trace correlation. Как проверить abandoned fixtures после падения worker?

Материалы задачи: [playwright](https://playwright.dev/docs/intro), [selenium](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/).

Предварительное основание уровня: Нужно обеспечить lifecycle и независимость распределённого тестового запуска.

**Lead**

### Контрактные проверки нескольких клиентов

ID: `research:test-automation:Lead` · Playwright, Selenium и Postman · развёрнутый кейс · ориентир 35 мин.

Web, Android и партнёрский API используют один booking backend. UI suite идёт 2 часа, API suite 5 минут; требуется выявлять breaking changes за 15 минут. Спроектируйте consumer-driven fixtures, выбор e2e маршрутов и reuse oracle без копирования реализации. Как mutation test проверит, что suite ловит двойную бронь?

Материалы задачи: [playwright](https://playwright.dev/docs/intro), [selenium](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/).

Предварительное основание уровня: Нужно обосновать качество и скорость общей стратегии автоматизации.

## OWASP, Burp Suite и безопасность приложений

Источники тем: [Web Security Academy: All labs](https://portswigger.net/web-security/all-labs); [OWASP WebGoat](https://owasp.org/projects/webgoat); [Wireshark labs for Computer Networking](https://gaia.cs.umass.edu/kurose_ross/wireshark.php). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Параметризованный запрос

ID: `research:application-security:Intern` · OWASP, Burp Suite и безопасность приложений · код · ориентир 15 мин.

Python API выполняет SQL через f-string с login пользователя. Покажите безопасную параметризацию и тест на login с кавычкой. Включать реальную атаку на чужой сервис не нужно: используйте локальную fixture БД. Чем parameter binding отличается от ручной замены кавычек?

Материалы задачи: [portswigger](https://portswigger.net/web-security/all-labs), [owasp](https://owasp.org/projects/webgoat), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Предварительное основание уровня: Нужно исправить уязвимый код и доказать поведение тестом.

**Junior**

### Доступ к чужому объекту

ID: `research:application-security:Junior` · OWASP, Burp Suite и безопасность приложений · развёрнутый кейс · ориентир 20 мин.

Локальный учебный API GET /invoices/{id} проверяет только login. В Burp Suite два собственных тестовых аккаунта видят счета друг друга при смене id. Составьте воспроизводимый тест авторизации и серверное исправление; что меняется для role=auditor с доступом только к одному tenant?

Материалы задачи: [portswigger](https://portswigger.net/web-security/all-labs), [owasp](https://owasp.org/projects/webgoat), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Предварительное основание уровня: Нужно проверить предметные права на объект при нескольких ролях.

**Middle**

### SSRF и redirect

ID: `research:application-security:Middle` · OWASP, Burp Suite и безопасность приложений · развёрнутый кейс · ориентир 30 мин.

Сервис загружает URL изображения. Проверяет hostname allowlist, но HTTP клиент следует redirect на внутренний адрес; DNS может вернуть другой IP между проверкой и соединением. Спроектируйте defensive fetch, контроль redirects/DNS/IPv6/private ranges, byte/time limits и локальные тестовые endpoints.

Материалы задачи: [portswigger](https://portswigger.net/web-security/all-labs), [owasp](https://owasp.org/projects/webgoat), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Предварительное основание уровня: Нужно анализировать несколько способов обхода одной сетевой границы.

**Senior**

### JWT и ротация ключа

ID: `research:application-security:Senior` · OWASP, Burp Suite и безопасность приложений · развёрнутый кейс · ориентир 35 мин.

Два tenant используют JWT; сервер выбирает ключ по непроверенному kid из URL и не проверяет aud. Планируется ротация signing keys без logout всех. Опишите проверку alg/iss/aud/kid, trusted key registry, overlap срока и расследование tokens со старым ключом. Как отделить подпись от права на конкретный invoice?

Материалы задачи: [portswigger](https://portswigger.net/web-security/all-labs), [owasp](https://owasp.org/projects/webgoat), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Предварительное основание уровня: Нужно спроектировать trust chain и безопасную эволюцию ключей.

**Lead**

### Изоляция загружаемого контента

ID: `research:application-security:Lead` · OWASP, Burp Suite и безопасность приложений · развёрнутый кейс · ориентир 40 мин.

Multi-tenant платформа принимает PDF и изображения, создаёт превью и публичные ссылки. Возможны malicious parser input, cross-tenant URL, огромная decompression и secret в logs. Спроектируйте threat model, sandbox/resource limits, storage ACL, publication gate и incident recovery. Какие проверки станут блокирующими для выпуска?

Материалы задачи: [portswigger](https://portswigger.net/web-security/all-labs), [owasp](https://owasp.org/projects/webgoat), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Предварительное основание уровня: Нужно обосновать и проверить системную модель угроз нескольких компонентов.

## UX/UI: исследование, прототип и проверка

Источники тем: [Figma Learn Design exercises](https://www.figma.com/resource-library/getting-started-in-design/); [Figma Learn projects](https://help.figma.com/hc/en-us/sections/13148624530967); [Miro templates / Miroverse](https://miro.com/templates/); [Atlassian Team Playbook](https://www.atlassian.com/team-playbook). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Ошибка в форме приглашения

ID: `research:ux-design:Intern` · UX/UI: исследование, прототип и проверка · развёрнутый кейс · ориентир 20 мин.

Кнопка «Пригласить» disabled, пока не заполнена зарплата; причины не показаны. На тесте 3 из 5 пользователей не смогли отправить приглашение. Предложите в Figma два состояния формы с подсказкой, ошибкой и успешной отправкой. Опишите клавиатурный путь и что проверить повторным тестом; число 3/5 нельзя объявлять точной долей всей аудитории.

Материалы задачи: [figma](https://www.figma.com/resource-library/getting-started-in-design/), [figma-projects](https://help.figma.com/hc/en-us/sections/13148624530967), [miro](https://miro.com/templates/), [atlassian](https://www.atlassian.com/team-playbook).

Предварительное основание уровня: Нужно создать состояния и связать решение с наблюдением.

**Junior**

### Интервью без наведения

ID: `research:ux-design:Junior` · UX/UI: исследование, прототип и проверка · развёрнутый кейс · ориентир 25 мин.

Нужно понять, почему работодатели прекращают подбор после просмотра трёх профилей. Составьте сценарий 20-минутного интервью, критерии подбора респондентов и схему заметок в FigJam/Miro. Замените вопрос «Вам неудобны наши фильтры?» нейтральным. Как отделить цитату, наблюдение и гипотезу команды?

Материалы задачи: [figma](https://www.figma.com/resource-library/getting-started-in-design/), [figma-projects](https://help.figma.com/hc/en-us/sections/13148624530967), [miro](https://miro.com/templates/), [atlassian](https://www.atlassian.com/team-playbook).

Предварительное основание уровня: Нужно спроектировать сбор и структуру качественных данных.

**Middle**

### Конфликт состояний приглашения

ID: `research:ux-design:Middle` · UX/UI: исследование, прототип и проверка · развёрнутый кейс · ориентир 30 мин.

Работодатель отправил приглашение; кандидат принял с другого устройства, пока экран работодателя показывал pending. Сеть пропала, действие «Отозвать» осталось. Постройте в Figma прототип состояний, server truth/version конфликт и доступные действия. Напишите acceptance criteria и тест для stale UI без ложного сообщения об успешном отзыве.

Материалы задачи: [figma](https://www.figma.com/resource-library/getting-started-in-design/), [figma-projects](https://help.figma.com/hc/en-us/sections/13148624530967), [miro](https://miro.com/templates/), [atlassian](https://www.atlassian.com/team-playbook).

Предварительное основание уровня: Нужно спроектировать опыт в условиях неполной актуальности данных.

**Senior**

### Сравнение двух маршрутов

ID: `research:ux-design:Senior` · UX/UI: исследование, прототип и проверка · развёрнутый кейс · ориентир 35 мин.

Вариант A ускоряет отправку приглашения с 90 до 60 секунд, но пользователи чаще ошибаются в зарплате:2% против 8%. Выборки маленькие, разные по опыту. Спроектируйте usability/experiment план: задачи, strata, метрики успеха и ошибок, достаточность свидетельств. Предложите третье решение и условия выбора, не сводя всё ко времени.

Материалы задачи: [figma](https://www.figma.com/resource-library/getting-started-in-design/), [figma-projects](https://help.figma.com/hc/en-us/sections/13148624530967), [miro](https://miro.com/templates/), [atlassian](https://www.atlassian.com/team-playbook).

Предварительное основание уровня: Нужно спроектировать валидное сравнение при конфликтующих результатах.

**Lead**

### Система сложных состояний

ID: `research:ux-design:Lead` · UX/UI: исследование, прототип и проверка · развёрнутый кейс · ориентир 40 мин.

Шесть продуктов используют общий компонент выбора кандидата. Нужны multi-select, server search, keyboard navigation, offline и частичные права. Спроектируйте state model, interaction contract и проверку в Figma+реальном прототипе. Определите release gate по accessibility и usability; какие доказательства нельзя получить только из статичного макета?

Материалы задачи: [figma](https://www.figma.com/resource-library/getting-started-in-design/), [figma-projects](https://help.figma.com/hc/en-us/sections/13148624530967), [miro](https://miro.com/templates/), [atlassian](https://www.atlassian.com/team-playbook).

Предварительное основание уровня: Нужно обеспечить и проверить поведенческий стандарт нескольких продуктов.

## Требования, BPMN и UML

Источники тем: [BPMN 2.0 Examples](https://camunda.com/bpmn/examples/); [UML 2.5.1 specification](https://www.omg.org/spec/UML/2.5.1/About-UML); [Atlassian Team Playbook](https://www.atlassian.com/team-playbook); [Miro templates / Miroverse](https://miro.com/templates/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Требование с неясным словом

ID: `research:business-analysis:Intern` · Требования, BPMN и UML · развёрнутый кейс · ориентир 15 мин.

Заказчик просит «приглашение отправляется быстро, зарплата указана правильно». Преобразуйте это в проверяемые требования и критерии приёмки для Jira; неизвестные пороги вынесите вопросами. Добавьте позитивный и негативный пример для зарплатного диапазона; не выдумывайте обязательную бизнес-политику.

Материалы задачи: [bpmn](https://camunda.com/bpmn/examples/), [uml](https://www.omg.org/spec/UML/2.5.1/About-UML), [atlassian](https://www.atlassian.com/team-playbook), [miro](https://miro.com/templates/).

Предварительное основание уровня: Нужно формализовать запрос и выявить недостающие решения.

**Junior**

### BPMN: два исхода и таймер

ID: `research:business-analysis:Junior` · Требования, BPMN и UML · развёрнутый кейс · ориентир 25 мин.

Заявка отправляется на согласование. Согласующий может принять или отклонить; если ответа нет 48 часов, заявка эскалируется, но не считается принятой. Постройте BPMN процесс с message/timer событиями и конечными состояниями. Покажите token trace для ответа на 47-м и 49-м часу; определите открытое правило позднего ответа.

Материалы задачи: [bpmn](https://camunda.com/bpmn/examples/), [uml](https://www.omg.org/spec/UML/2.5.1/About-UML), [atlassian](https://www.atlassian.com/team-playbook), [miro](https://miro.com/templates/).

Предварительное основание уровня: Нужно моделировать процесс и проверить временные альтернативы.

**Middle**

### UML: платёж с неопределённым исходом

ID: `research:business-analysis:Middle` · Требования, BPMN и UML · развёрнутый кейс · ориентир 30 мин.

Платёжный сервис получил timeout после отправки провайдеру. Клиент повторяет запрос; провайдер поддерживает operation key и status API. Нарисуйте UML state machine и sequence для retry/reconciliation, задайте invariants и Jira acceptance cases. Как различаются failed и unknown?

Материалы задачи: [bpmn](https://camunda.com/bpmn/examples/), [uml](https://www.omg.org/spec/UML/2.5.1/About-UML), [atlassian](https://www.atlassian.com/team-playbook), [miro](https://miro.com/templates/).

Предварительное основание уровня: Нужно согласовать две модели и проверяемые инварианты операции.

**Senior**

### Историческое правило доступа

ID: `research:business-analysis:Senior` · Требования, BPMN и UML · развёрнутый кейс · ориентир 35 мин.

Работодатель видит контакты после принятия приглашения. Новое правило: отзыв согласия скрывает контакты, но история статуса сохраняется. Есть ранее скачанные PDF. Составьте модель данных, BPMN изменения согласия, access decision table и impact analysis. Укажите предел отзыва для внешних копий, не обещая их автоматического удаления.

Материалы задачи: [bpmn](https://camunda.com/bpmn/examples/), [uml](https://www.omg.org/spec/UML/2.5.1/About-UML), [atlassian](https://www.atlassian.com/team-playbook), [miro](https://miro.com/templates/).

Предварительное основание уровня: Нужно провести сквозной impact analysis нескольких представлений данных.

**Lead**

### Версионирование бизнес-правил

ID: `research:business-analysis:Lead` · Требования, BPMN и UML · развёрнутый кейс · ориентир 40 мин.

Три продукта трактуют «подтверждённый кандидат» по-разному. Требуется новый единый контракт без переоценки прошлых результатов: правила, test evidence и версии должны сохраняться. Спроектируйте decision model, requirement-to-test traceability и миграцию Jira/Confluence спецификаций. Как докажете, что новый термин не изменил старый факт?

Материалы задачи: [bpmn](https://camunda.com/bpmn/examples/), [uml](https://www.omg.org/spec/UML/2.5.1/About-UML), [atlassian](https://www.atlassian.com/team-playbook), [miro](https://miro.com/templates/).

Предварительное основание уровня: Нужно управлять общим смысловым контрактом и доказать совместимость.

## Продукт: метрики, экономика и решения

Источники тем: [Atlassian Team Playbook](https://www.atlassian.com/team-playbook); [Experimentation Platform research](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/); [18.05: Probability and Statistics — problem sets](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Экономика заказа

ID: `research:product-management:Intern` · Продукт: метрики, экономика и решения · расчёт с объяснением · ориентир 15 мин.

Средний чек 2000₽, переменные издержки 1200₽, комиссия платёжного провайдера 3% чека. Привлечение покупателя стоит 900₽, он делает в среднем 2 заказа. Рассчитайте contribution на заказ и покупателя после CAC. Какие предпосылки нужно проверить до вывода об окупаемости?

Материалы задачи: [atlassian](https://www.atlassian.com/team-playbook), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/).

Предварительное основание уровня: Нужно выполнить расчёт и ограничить интерпретацию.

**Junior**

### Метрика приглашений

ID: `research:product-management:Junior` · Продукт: метрики, экономика и решения · развёрнутый кейс · ориентир 20 мин.

Команда увеличила число отправленных приглашений на 40%, но принятых стало меньше. Предложите основную метрику полезного контакта, guardrails spam/качества и воронку для диагностики. Уточните знаменатели, период и duplicates; оформите гипотезу и acceptance эксперимента в Jira.

Материалы задачи: [atlassian](https://www.atlassian.com/team-playbook), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/).

Предварительное основание уровня: Нужно формализовать продуктовый результат и диагностическую систему.

**Middle**

### Приоритет с неопределённостью

ID: `research:product-management:Middle` · Продукт: метрики, экономика и решения · расчёт с объяснением · ориентир 25 мин.

Есть две инициативы: A охватывает 1000 пользователей, impact=2, confidence=0.9, effort=3; B охватывает 5000, impact=1, confidence=0.3, effort=4. Посчитайте RICE и сравните. B имеет риск ошибки оценки reach в 5 раз. Предложите исследование, которое изменит решение, и покажите sensitivity; score не должен автоматически заменять стратегию.

Материалы задачи: [atlassian](https://www.atlassian.com/team-playbook), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/).

Предварительное основание уровня: Нужно рассчитать приоритет и найти сведения, меняющие выбор.

**Senior**

### Рост и каннибализация

ID: `research:product-management:Senior` · Продукт: метрики, экономика и решения · расчёт с объяснением · ориентир 30 мин.

Новая функция повышает конверсию на 5%, но уменьшает средний чек на 8%; трафик одинаков, переменные затраты на заказ фиксированы. Покажите изменение выручки на посетителя и почему одного conversion uplift недостаточно. Спроектируйте A/B с contribution metric, сегментами и horizon повторных заказов.

Материалы задачи: [atlassian](https://www.atlassian.com/team-playbook), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/).

Предварительное основание уровня: Нужно связать метрики и спроектировать причинную экономическую проверку.

**Lead**

### Решение о портфеле продукта

ID: `research:product-management:Lead` · Продукт: метрики, экономика и решения · развёрнутый кейс · ориентир 40 мин.

Доступно 8 engineer-months. A стоит 5 и снижает risk потери важных данных; B стоит 3 и ожидаемо даёт+4% contribution, эффект не проверен; C стоит 4 и нужен для нового сегмента с неизвестным спросом. Определите правила решения, план сбора evidence и staged roadmap. Какие ограничения не следует сводить к одному RICE и как проверять результат после релиза?

Материалы задачи: [atlassian](https://www.atlassian.com/team-playbook), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/).

Предварительное основание уровня: Нужно принять аргументированное решение при неопределённых целях и ограничении ресурса.

## C/C++, STM32 и реальное время

Источники тем: [STM32 MOOCs](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html); [C exercises](https://exercism.org/tracks/c/exercises); [C++ exercises](https://exercism.org/tracks/cpp/exercises); [FreeRTOS queues documentation](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/01-Queues). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### C: границы буфера

ID: `research:embedded-firmware:Intern` · C/C++, STM32 и реальное время · код · ориентир 20 мин.

На C реализуйте copy_name(dst,capacity,src), которая копирует нуль-терминированную строку с гарантией завершения, если capacity>0. Верните признак усечения; src и dst не пересекаются. Для capacity0,1 и 4 с src="abcd" задайте результаты. Не читайте src вне строки и не пишите вне dst.

Материалы задачи: [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html), [ex-c](https://exercism.org/tracks/c/exercises), [ex-cpp](https://exercism.org/tracks/cpp/exercises), [freertos](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/01-Queues).

Предварительное основание уровня: Нужно реализовать и проверить память на нескольких границах.

**Junior**

### UART: частичный пакет

ID: `research:embedded-firmware:Junior` · C/C++, STM32 и реальное время · код · ориентир 25 мин.

STM32 принимает UART кадры: magic0xAA, length1…32, payload, XOR checksum. DMA может отдавать фрагмент любой длины; мусор возможен между кадрами. Спроектируйте parser state machine на C/C++, bounded buffer и тесты partial/back-to-back/bad-length/bad-checksum. Как вернуться к поиску magic, не зациклившись?

Материалы задачи: [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html), [ex-c](https://exercism.org/tracks/c/exercises), [ex-cpp](https://exercism.org/tracks/cpp/exercises), [freertos](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/01-Queues).

Предварительное основание уровня: Нужно построить полный parser при произвольном разбиении потока.

**Middle**

### FreeRTOS: priority inversion

ID: `research:embedded-firmware:Middle` · C/C++, STM32 и реальное время · расчёт с объяснением · ориентир 25 мин.

Три задачи FreeRTOS: H приоритет 3, M2, L1. L захватила mutex и needs2ms CPU; H пришла через 0.5ms и ждёт его, затем M требует 10ms CPU. Нарисуйте timeline с/без priority inheritance. Почему binary semaphore не всегда заменяет mutex, и что нельзя делать в ISR?

Материалы задачи: [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html), [ex-c](https://exercism.org/tracks/c/exercises), [ex-cpp](https://exercism.org/tracks/cpp/exercises), [freertos](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/01-Queues).

Предварительное основание уровня: Нужно рассчитать расписание и применить механизм синхронизации.

**Senior**

### DMA, кеш и SPI

ID: `research:embedded-firmware:Senior` · C/C++, STM32 и реальное время · развёрнутый кейс · ориентир 35 мин.

STM32 с D-cache получает SPI данные через DMA в buffer; CPU иногда читает старые значения. Buffer делит cache line с другой изменяемой переменной. Предложите alignment/ownership, invalidate/clean порядок для RX/TX и memory barriers по контракту платформы. Как тест отличит stale cache от неверной длины DMA?

Материалы задачи: [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html), [ex-c](https://exercism.org/tracks/c/exercises), [ex-cpp](https://exercism.org/tracks/cpp/exercises), [freertos](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/01-Queues).

Предварительное основание уровня: Нужно доказать согласованность через DMA/cache аппаратную границу.

**Lead**

### Обновление прошивки с power loss

ID: `research:embedded-firmware:Lead` · C/C++, STM32 и реальное время · развёрнутый кейс · ориентир 40 мин.

Устройство имеет 2 flash slots, bootloader и C++ application под FreeRTOS. Новая прошивка меняет формат configuration; питание может пропасть на любом шаге. Спроектируйте signed manifest, atomic boot selection, probation/rollback и migration config. Как обеспечить, чтобы fallback старой прошивки мог читать настройки после пробного запуска?

Материалы задачи: [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html), [ex-c](https://exercism.org/tracks/c/exercises), [ex-cpp](https://exercism.org/tracks/cpp/exercises), [freertos](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/01-Queues).

Предварительное основание уровня: Нужно обеспечить жизненный цикл и восстановление программно-аппаратной системы.

## Электроника, PCB и измерения

Источники тем: [XYZs of Oscilloscopes](https://www.tek.com/en/documents/primer/xyzs-oscilloscopes-primer); [Getting started in KiCad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html); [STM32 MOOCs](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html). Условия ниже написаны самостоятельно, не являются дословным импортом задач источника.

**Стажёр**

### Делитель и вход АЦП

ID: `research:embedded-hardware:Intern` · Электроника, PCB и измерения · расчёт с объяснением · ориентир 15 мин.

Нужно измерять 5V входом АЦП 3.3V. Делитель: Rtop=10kΩ, Rbottom=20kΩ. Рассчитайте напряжение и эквивалентное сопротивление; при 5V входе этот выбор безопасен ли? Предложите новый номинал top для номинального выхода не выше 3.0V и объясните, что ещё проверить по допускам и datasheet.

Материалы задачи: [oscilloscope](https://www.tek.com/en/documents/primer/xyzs-oscilloscopes-primer), [kicad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html), [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html).

Предварительное основание уровня: Нужно рассчитать цепь и проверить пределы входа.

**Junior**

### I2C: время нарастания

ID: `research:embedded-hardware:Junior` · Электроника, PCB и измерения · расчёт с объяснением · ориентир 20 мин.

Шина I2C имеет Cbus=200pF, pull-up4.7kΩ и питание 3.3V. Используйте tr≈0.8473RC: допустимо 300ns, sink current≤3mA, VOL≈0.4V. Найдите верхнюю и нижнюю границы R и выберите стандартный номинал. Как подтвердить расчёт осциллографом и не добавить большую ёмкость щупом?

Материалы задачи: [oscilloscope](https://www.tek.com/en/documents/primer/xyzs-oscilloscopes-primer), [kicad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html), [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html).

Предварительное основание уровня: Нужно совместить два электрических ограничения и проверку измерением.

**Middle**

### PCB: возвратный ток

ID: `research:embedded-hardware:Middle` · Электроника, PCB и измерения · развёрнутый кейс · ориентир 30 мин.

На 4-слойной PCB SPI clock20MHz пересекает разрыв ground plane; осциллограф показывает ringing. В KiCad ERC/DRC ошибок нет. Объясните return path, предложите layout правку и метод проверки щупом с короткой землёй. Почему частота 20MHz не описывает весь спектр быстрых фронтов?

Материалы задачи: [oscilloscope](https://www.tek.com/en/documents/primer/xyzs-oscilloscopes-primer), [kicad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html), [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html).

Предварительное основание уровня: Нужно связать физику, проектирование и корректность измерения.

**Senior**

### Алиасинг диагностического сигнала

ID: `research:embedded-hardware:Senior` · Электроника, PCB и измерения · расчёт с объяснением · ориентир 30 мин.

Сигнал 100kHz измеряют осциллографом с sample rate150kSa/s; на экране видна более низкая частота. Выведите alias frequency, предложите sample rate и bandwidth/probe проверки для измерения 10ns фронта. Почему соблюдение Nyquist для основной частоты не гарантирует точное измерение фронта?

Материалы задачи: [oscilloscope](https://www.tek.com/en/documents/primer/xyzs-oscilloscopes-primer), [kicad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html), [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html).

Предварительное основание уровня: Нужно рассчитать два разных ограничения измерительного тракта.

**Lead**

### Допуск платы к выпуску

ID: `research:embedded-hardware:Lead` · Электроника, PCB и измерения · развёрнутый кейс · ориентир 40 мин.

Новая PCB содержит STM32, чувствительный АЦП и SPI дисплей. При обновлении дисплея измерение АЦП смещается на 3%; требуется≤0.5%. Составьте план локализации питания/reference/return path/timing, изменения KiCad layout и firmware, матрицу проверки по температуре/нагрузке. Какие измерения дадут основание выпускать плату, а не просто «шум стал меньше»?

Материалы задачи: [oscilloscope](https://www.tek.com/en/documents/primer/xyzs-oscilloscopes-primer), [kicad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html), [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html).

Предварительное основание уровня: Нужно принять инженерное решение по проверенному бюджету ошибки системы.
