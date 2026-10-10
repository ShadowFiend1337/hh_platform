# Закрытые кейсы для согласования

165 кейсов, 330 вопросов: 33 компетенции × 5 грейдов × 2 вопроса. Один верный ответ из четырёх в каждом вопросе. Ключи и объяснения находятся в приватных серверных данных.

Каждый кейс связан с открытой задачей того же уровня. Это авторская закрытая адаптация сценария по указанным материалам, а не дословный импорт вопроса источника. Грейд — предварительная оценка; выбор решения не доказывает способность самостоятельно его построить. Время открытого кейса сохранено как предварительный верхний ориентир, оно не откалибровано для закрытого формата.

## Линейная алгебра и оптимизация

### Стажёр — Калибровка датчика

ID: `research-mc:mathematics:Intern` · открытая пара: `research:mathematics:Intern`

Датчик: x=[0,1,2], y=[1,2,2]. Подбирается y≈a+bx методом наименьших квадратов.

**1. Какие коэффициенты минимизируют сумму квадратов ошибок?**

- **A.** a=1, b=1/2
- **B.** a=1, b=1
- **C.** a=2, b=0
- **D.** a=7/6, b=1/2

**2. Каковы остатки y−ŷ и их сумма?**

- **A.** [1/6,-1/3,1/6]; сумма 0
- **B.** [0,0,0]; сумма 0
- **C.** [-1/6,1/3,-1/6]; сумма 0
- **D.** [0,1/2,0]; сумма 1/2

Материалы: [mit-linear](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments/), [mit-calculus](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/), [yandex-math](https://education.yandex.ru/handbook/math).

Основание уровня: Нужно вывести и проверить двухпараметрическую модель, а не назвать термин.

### Junior — Шаг градиента с регуляризацией

ID: `research-mc:mathematics:Junior` · открытая пара: `research:mathematics:Junior`

X=[[1,0],[1,1]], y=[1,3], L=\|\|Xw−y\|\|²/2+\|\|w\|\|²/2. Начало w=[0,0], шаг η=0.1.

**1. Каковы новый w и значение L после одного шага?**

- **A.** [0.4,0.3]; 2.95
- **B.** [0.4,0.3]; 2.825
- **C.** [0.2,0.15]; 3.8625
- **D.** [-0.4,-0.3]; 7.95

**2. Второй столбец X умножили на 100. Что определяет устойчивость прежнего шага?**

- **A.** λmin(XᵀX+I); граница η&lt;2/λmin
- **B.** λmax(XᵀX+I); граница η&lt;2/λmax
- **C.** Только число строк X; граница не изменится
- **D.** Только норма y; уменьшить y в 100 раз

Материалы: [mit-calculus](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/), [mit-linear](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments/), [yandex-math](https://education.yandex.ru/handbook/math).

Основание уровня: Требуется связать вычисление с устойчивостью алгоритма.

### Middle — Неидентифицируемые коэффициенты

ID: `research-mc:mathematics:Middle` · открытая пара: `research:mathematics:Middle`

X=[[1,1,2],[1,2,4],[1,3,6]], y=[2,3,5]. Модель: a+bx+cz.

**1. Каковы ранг, минимизирующие коэффициенты и прогноз для [1,4,8]?**

- **A.** rank=2; a=1/3, b+2c=3/2; прогноз 19/3
- **B.** rank=3; a=0,b=1,c=1; прогноз 12
- **C.** rank=2; a=1/3,b+c=3/2; прогноз 19/3
- **D.** rank=2; коэффициенты неединственны, прогноз произволен

**2. Что даёт ridge со штрафом λ\|\|w\|\|², λ>0, на все коэффициенты?**

- **A.** Восстановление независимых причинных эффектов b и c
- **B.** Повышение ранга исходной матрицы X до 3
- **C.** Единственное решение со смещением; причинность не установлена
- **D.** Единственное решение без изменения предсказаний для любого λ

Материалы: [mit-linear](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments/), [mit-calculus](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/), [yandex-math](https://education.yandex.ru/handbook/math).

Основание уровня: Нужно вывести множество решений и корректно интерпретировать модель.

### Senior — Почти зависимые признаки

ID: `research-mc:mathematics:Senior` · открытая пара: `research:mathematics:Senior`

X=[[1,1],[1,1+ε],[1,1−ε]], ε=10⁻⁸. Least squares вычисляется в float64.

**1. Какой порядок обусловленности и какой метод уменьшает дополнительную потерю точности?**

- **A.** κ(X)≈1, κ(XᵀX)≈1; любой метод
- **B.** κ(X)≈10⁸, κ(XᵀX)≈10¹⁶; QR/SVD
- **C.** κ(X)≈10⁸, κ(XᵀX)≈10⁸; normal equations
- **D.** κ(X)≈10¹⁶, κ(XᵀX)≈10⁸; QR

**2. После возмущения y на 10⁻⁹ коэффициенты заметно меняются, прогнозы почти стабильны. Какой вывод обоснован?**

- **A.** Уменьшить residual итерациями normal equations до machine epsilon и считать отдельные коэффициенты надёжными независимо от возмущений y
- **B.** Отдельные коэффициенты ненадёжны; проверить чувствительность и регуляризацию
- **C.** Публиковать коэффициенты: стабильные прогнозы и малый residual подтверждают их точность; sensitivity y проверять только для будущих новых данных
- **D.** Перейти на QR и публиковать коэффициенты без sensitivity analysis: QR устраняет как вычислительную, так и исходную обусловленность задачи

Материалы: [mit-linear](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments/), [mit-calculus](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/), [yandex-math](https://education.yandex.ru/handbook/math).

Основание уровня: Взаимодействуют машинная точность, спектр и значимость параметров.

### Lead — Сжатие матрицы с гарантией ошибки

ID: `research-mc:mathematics:Lead` · открытая пара: `research:mathematics:Lead`

Матрица 100000×256, float32. σᵢ²=C·0.8^(i−1). Бюджет 80 MiB; относительная ошибка Фробениуса ≤0.01. Разрешена только усечённая SVD.

**1. Какой минимальный ранг и ориентировочная память факторов?**

- **A.** r=83; 31.7 MiB
- **B.** r=42; 16.1 MiB
- **C.** r=21; 8.0 MiB
- **D.** r=42; 97.7 MiB

**2. Какую проверку нельзя заменить гарантией Фробениуса?**

- **A.** Проверить только recall@k training queries после подбора rank на них; зафиксированный Frobenius bound исключает необходимость независимой retrieval оценки
- **B.** Recall@k retrieval на фиксированном наборе и бюджет деградации
- **C.** Повторить SVD на том же наборе, подтвердить Frobenius bound и dtype; это уже гарантирует сохранность ближайших соседей для любых queries
- **D.** Проверить память и средний cosine similarity всех пар; совпадение среднего достаточно для сохранения exact top-k каждого запроса

Материалы: [mit-linear](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments/), [mit-calculus](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/), [yandex-math](https://education.yandex.ru/handbook/math).

Основание уровня: Нужно принять техническое решение по нескольким проверяемым ограничениям.

## Теория вероятностей

### Стажёр — Выборка без возвращения

ID: `research-mc:probability:Intern` · открытая пара: `research:probability:Intern`

Из 8 исправных и 2 дефектных плат случайно выбирают 3 без возвращения.

**1. Вероятность ровно одного дефекта и ожидаемое число дефектов?**

- **A.** 7/15 и 1
- **B.** 0.2 и 0.6
- **C.** 7/15 и 0.6
- **D.** 0.384 и 0.6

**2. Первая выбранная плата дефектная. Какова вероятность, что следующая тоже дефектна?**

- **A.** 2/10
- **B.** 1/10
- **C.** 2/9
- **D.** 1/9

Материалы: [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [yandex-math](https://education.yandex.ru/handbook/math).

Основание уровня: Два связанных расчёта требуют правильной модели выборки.

### Junior — Редкое событие и сигнал детектора

ID: `research-mc:probability:Junior` · открытая пара: `research:probability:Junior`

Неисправны 0.5% узлов. Чувствительность детектора 96%, ложные сигналы на исправных 3%.

**1. Какова вероятность неисправности после сигнала?**

- **A.** Около 0.48%
- **B.** Около 76.19%
- **C.** Около 13.85%
- **D.** 96%

**2. Доля неисправных выросла до 5%, характеристики детектора прежние. Новый posterior?**

- **A.** Около 62.75%
- **B.** По-прежнему 13.85%
- **C.** 96%
- **D.** Около 4.8%

Материалы: [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [yandex-math](https://education.yandex.ru/handbook/math).

Основание уровня: Нужно восстановить вероятностную модель из разных условных частот.

### Middle — Ограниченные повторы доставки

ID: `research-mc:probability:Middle` · открытая пара: `research:probability:Middle`

Независимая попытка доставки успешна с p=0.7. Максимум три попытки, после успеха повторов нет.

**1. Каковы риск окончательного провала и E[N] выполненных попыток?**

- **A.** 0.09 и 1.39
- **B.** 0.027 и 3
- **C.** 0.3 и 1/0.7
- **D.** 0.027 и 1.39

**2. Каково распределение N?**

- **A.** P(1)=P(2)=P(3)=1/3
- **B.** P(1)=0.3, P(2)=0.09, P(3)=0.027
- **C.** P(1)=0.7, P(2)=0.21, P(3)=0.09
- **D.** P(1)=0.7, P(2)=0.21, P(3)=0.063

Материалы: [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [yandex-math](https://education.yandex.ru/handbook/math).

Основание уровня: Нужно вывести распределение процесса с ранней остановкой.

### Senior — Суперпозиция нагрузки

ID: `research-mc:probability:Senior` · открытая пара: `research:probability:Senior`

Два независимых пуассоновских потока: 30 и 20 событий/с. После общей рассылки среднее счётчика 50, дисперсия 180.

**1. До рассылки как выразить P(N>70) и нормальное приближение z?**

- **A.** 1−Σ(k=0…69)e⁻⁵⁰50^k/k!; z≈2.76
- **B.** Poisson(600); z≈−21.6
- **C.** Poisson(50); z=(70.5−50)/50≈0.41
- **D.** 1−Σ(k=0…70)e⁻⁵⁰50^k/k!; z≈2.90

**2. Что следует из дисперсии 180 при среднем 50?**

- **A.** Сохранить Poisson(50), увеличить число наблюдений и считать дисперсию180 допустимой новой дисперсией того же однородного пуассоновского процесса
- **B.** Перейти на Poisson(180), поскольку новая дисперсия даёт intensity; среднее50 сохранить отдельной нормировкой и не исследовать общие факторы
- **C.** Однозначно выбрать negative binomial по двум моментам и больше не проверять временную неоднородность, независимость потоков и механизм общей рассылки
- **D.** Однородный Poisson не согласуется с моментами; исследовать общие факторы и окна

Материалы: [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [yandex-math](https://education.yandex.ru/handbook/math).

Основание уровня: Требуется вычисление хвоста и диагностика нарушения предпосылок.

### Lead — Общая причина отказов

ID: `research-mc:probability:Lead` · открытая пара: `research:probability:Lead`

Каждый из двух ЦОД недоступен за час с вероятностью 0.01. Затем задан общий отказ q=0.002; вне него локальные отказы независимы с одинаковым p.

**1. Без модели зависимости каковы границы совместного отказа?**

- **A.** [0,0.01]
- **B.** Точно 0.0001
- **C.** [0.0001,0.01]
- **D.** [0,0.0001]

**2. В модели общего отказа каковы p и совместный риск?**

- **A.** p=0.002; риск=0.002004
- **B.** p≈0.008016; риск≈0.002064
- **C.** p=0.01; риск=0.0001
- **D.** p=0.008; риск=0.000064

Материалы: [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [yandex-math](https://education.yandex.ru/handbook/math).

Основание уровня: Нужно построить и проверить модель риска для архитектурного решения.

## Математическая статистика и эксперименты

### Стажёр — Среднее и выброс

ID: `research-mc:statistics:Intern` · открытая пара: `research:statistics:Intern`

Времена выполнения: 2,3,3,4,18 минут.

**1. Среднее, медиана и выборочная дисперсия с делителем n−1?**

- **A.** 6; 3; 36.4
- **B.** 3; 3; 45.5
- **C.** 6; 4; 45.5
- **D.** 6; 3; 45.5

**2. Для отчёта о типичном времени при пока неизвестной причине 18 что выбрать?**

- **A.** Среднее 3 после удаления 18 как выброса
- **B.** Среднее 6; оно исключает необходимость исследовать хвост
- **C.** Медиану 3; значение 18 больше не хранить
- **D.** Медиану 3; сохранить наблюдение и расследовать причину

Материалы: [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/).

Основание уровня: Нужно посчитать и интерпретировать статистики одного набора.

### Junior — Интервал конверсии

ID: `research-mc:statistics:Junior` · открытая пара: `research:statistics:Junior`

52 из 400 независимых пользователей завершили регистрацию. Используется нормальное приближение для 95% CI.

**1. Каковы оценка и интервал?**

- **A.** 52%; [47.10%,56.90%]
- **B.** 13%; [6.41%,19.59%]
- **C.** 13%; примерно [9.70%,16.30%]
- **D.** 13%; [12.87%,13.13%]

**2. Как интерпретировать 95% CI и случай 2 успехов из 10?**

- **A.** 95% пользователей имеют конверсию в интервале; 2/10 подходит
- **B.** 95% новых выборок дадут оценку внутри этого CI; 2/10 удалить
- **C.** 95% — покрытие процедуры; для 2/10 предпочесть Wilson/exact
- **D.** 95% — вероятность фиксированного параметра внутри этого частотного CI; 2/10 подходит

Материалы: [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/).

Основание уровня: Требуется оценка неопределённости и проверка метода.

### Middle — A/B с повторными сессиями

ID: `research-mc:statistics:Middle` · открытая пара: `research:statistics:Middle`

Назначение A/B по пользователям; до 30 сессий на пользователя. Цель: доля пользователей с покупкой за 7 дней.

**1. Какая таблица анализа соответствует цели?**

- **A.** Одна строка на сессию: покупка в этой сессии и assignment
- **B.** Одна строка на покупку: пользователь и assignment
- **C.** Одна строка на пользователя только после его первой покупки
- **D.** Одна строка на пользователя: assignment и факт покупки в фиксированном окне

**2. Если назначение теперь по организациям, как оценивать неопределённость?**

- **A.** Считать все пользователи независимыми, поскольку строка одна на пользователя
- **B.** Bootstrap сессий отдельно для каждой версии
- **C.** Исключить организации без покупок перед расчётом CI
- **D.** Сохранить целевой estimand и учитывать кластеры организаций

Материалы: [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/).

Основание уровня: Нужно спроектировать оценку эффекта при зависимых наблюдениях.

### Senior — Победитель из двадцати тестов

ID: `research-mc:statistics:Senior` · открытая пара: `research:statistics:Senior`

20 независимых тестов истинных H₀, α=0.05. Аналитик показывает минимальный p-value и ежедневно проверяет значимость.

**1. Вероятность хотя бы одного ложного открытия?**

- **A.** 1−0.95²⁰≈64.15%
- **B.** 5%
- **C.** 20·0.05=100% точно
- **D.** 0.05²⁰

**2. Какой протокол контролирует обе формы выбора?**

- **A.** Заранее выбрать primary, ежедневно применять Holm к20 метрикам и завершать при первом crossing; daily Holm одновременно контролирует optional stopping
- **B.** Использовать fixed horizon для каждого теста, затем объявить primary метрику с минимальным p-value, поскольку горизонт был зафиксирован заранее
- **C.** Применять FDR к19 secondary, primary проверять ежедневно приα=.05 без sequential correction, поскольку primary была выбрана до эксперимента
- **D.** Заранее выбрать основную метрику, корректировать вторичные и использовать fixed horizon либо sequential design

Материалы: [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/).

Основание уровня: Взаимодействуют выбор гипотез, multiplicity и остановка.

### Lead — Проверка платформы экспериментов

ID: `research-mc:statistics:Lead` · открытая пара: `research:statistics:Lead`

Ожидаемый split 50/50, наблюдается 54000/46000. Uplift выручки B +2%; есть дубли assignment, изменение определения метрики и события с задержкой до 48 ч.

**1. Каков χ² SRM и какое действие первым?**

- **A.** 640; случайно убрать 8000 из A и сразу сравнить
- **B.** 0.64; считать split согласованным
- **C.** 640; расследовать назначения и потери данных до интерпретации uplift
- **D.** 64; принять +2%, поскольку выборка большая

**2. Какой набор нужен для воспроизводимого повторного расчёта?**

- **A.** Сохранить assignment и events, убрать48-часовые задержки фильтром по ingest day; metric version, maturity policy и порядок дедупликации не фиксировать
- **B.** Assignment с временем, версии определения метрики, сырые события, dedup и maturation policy, analysis plan
- **C.** Сохранить assignment totals и среднюю выручку, текущую SQL формулу и dashboard snapshot; этого достаточно восстановить все версии метрики и поздние события
- **D.** Сохранить сырые revenue events и текущие assignment, перезаписав историю дубликатов; версию метрики применить последнюю ко всем дням без отдельного контракта

Материалы: [exp-srm](https://www.microsoft.com/en-us/research/articles/diagnosing-sample-ratio-mismatch-in-a-b-testing/), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/).

Основание уровня: Нужно выстроить проверяемую процедуру решения при нескольких источниках смещения.

## SQL и PostgreSQL

### Стажёр — Заказы и клиенты без покупок

ID: `research-mc:sql:Intern` · открытая пара: `research:sql:Intern`

customers: 1,2,3. orders: (10,1,paid,100),(11,1,cancelled,50),(12,2,paid,70). Нужны число и сумма paid-заказов для всех клиентов.

**1. Какой вариант сохраняет клиента 3 с нулями?**

- **A.** LEFT JOIN; WHERE o.status=paid; COUNT(o.id), COALESCE(SUM(amount),0)
- **B.** INNER JOIN с status=paid; COUNT(o.id), SUM(amount)
- **C.** LEFT JOIN с status=paid в ON; COUNT(*), SUM(amount)
- **D.** LEFT JOIN с status=paid в ON; COUNT(o.id), COALESCE(SUM(amount),0)

**2. Какой результат правильный: (customer,count,sum)?**

- **A.** (1,1,100),(2,1,70),(3,0,0)
- **B.** (1,2,150),(2,1,70),(3,0,0)
- **C.** (1,1,100),(2,1,70)
- **D.** (1,1,100),(2,1,70),(3,1,NULL)

Материалы: [pg-exercises](https://pgexercises.com/), [sql-academy](https://sql-academy.org/ru/trainer), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно написать запрос, учесть NULL и проверить результат.

### Junior — Последний статус с равным временем

ID: `research-mc:sql:Junior` · открытая пара: `research:sql:Junior`

Для entity=1 события (7,10:00,new),(8,10:05,paid),(9,10:05,refunded); entity=2: (10,10:03,new). Последнее событие определяется по времени, затем большему event_id.

**1. Как получить ровно один последний статус на сущность?**

- **A.** MAX(status) GROUP BY entity_id
- **B.** ROW_NUMBER() OVER(ORDER BY happened_at DESC), затем rn=1
- **C.** ROW_NUMBER() OVER(PARTITION BY entity_id ORDER BY happened_at DESC,event_id DESC), затем rn=1
- **D.** JOIN по MAX(happened_at) и все совпавшие строки

**2. Какие статусы и порядок индексных ключей соответствуют решению?**

- **A.** paid,new; (entity_id,happened_at DESC)
- **B.** refunded,new; (status,event_id,entity_id)
- **C.** refunded,refunded; (happened_at DESC)
- **D.** refunded,new; (entity_id,happened_at DESC,event_id DESC)

Материалы: [pg-exercises](https://pgexercises.com/), [sql-academy](https://sql-academy.org/ru/trainer), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Требуются оконная функция, детерминизм и индекс.

### Middle — Сессии по разрывам событий

ID: `research-mc:sql:Middle` · открытая пара: `research:sql:Middle`

events(user_id,event_id,ts): новая сессия только при разрыве >30 минут. Tie-break по event_id. Требуется session_no для каждой строки.

**1. Как построить номер сессии?**

- **A.** GROUP BY user_id,date_trunc(hour,ts)
- **B.** LAG по user_id и (ts,event_id); marker для первой строки или gap>30; SUM(marker) с ROWS в следующем CTE
- **C.** DENSE_RANK по ts внутри user_id
- **D.** LAG по user_id; marker при gap≥30; SUM(marker)

**2. Для событий 10:00(id1),10:30(id2),11:01(id3),11:01(id4) какие session_no?**

- **A.** 1,1,1,1
- **B.** 1,1,2,2
- **C.** 1,2,3,4
- **D.** 1,2,3,3

Материалы: [pg-exercises](https://pgexercises.com/), [sql-academy](https://sql-academy.org/ru/trainer), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно составить многоэтапный запрос и оценить его выполнение.

### Senior — Конкурентное резервирование

ID: `research-mc:sql:Senior` · открытая пара: `research:sql:Senior`

PostgreSQL READ COMMITTED: stocks.available≥0; reservations.request_id UNIQUE. Два запроса на последние 5 единиц, возможен retry после timeout.

**1. Какой алгоритм сохраняет запас и идемпотентность?**

- **A.** В одной транзакции SELECT available и затем безусловный UPDATE, после commit записать UNIQUE request_id; при retry читать существующий результат
- **B.** Сначала commit уникального request_id, затем условный UPDATE stocks в другой транзакции; это исключает частичный успех даже при падении между commits
- **C.** В одной транзакции условный UPDATE и reservations, но каждый retry получает новый request_id; concurrency безопасна, поэтому повторное списание исключено
- **D.** В одной транзакции уникальный request_id и UPDATE ... WHERE available≥qty; повтор читает результат и сверяет payload

**2. Повтор request_id пришёл с другим qty. Какой ответ соответствует идемпотентному контракту?**

- **A.** Под тем же request_id списать положительную разницу qty отдельной транзакцией, сохранив старый success; это продолжение исходной операции, не новая
- **B.** Удалить старую reservation и выполнить запрос с новым qty под прежним key; прежний stock decrement компенсируется отсутствием записи автоматически
- **C.** Конфликт payload, без нового списания
- **D.** Вернуть существующий success независимо от нового qty: uniqueness request_id делает любую смену payload безопасной и не требует сообщения клиенту

Материалы: [postgres-isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [pg-exercises](https://pgexercises.com/), [sql-academy](https://sql-academy.org/ru/trainer), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Требуется доказать корректность при конкуренции и повторе.

### Lead — Миграция уникальности без остановки

ID: `research-mc:sql:Lead` · открытая пара: `research:sql:Lead`

200 млн users. Глобальный UNIQUE(email) заменяют уникальностью lower(email) внутри tenant только для active. Две версии сервиса сосуществуют неделю.

**1. Какое создание индекса соответствует новому правилу?**

- **A.** CREATE UNIQUE INDEX CONCURRENTLY ... ON users(tenant_id,lower(email)) WHERE active; вне transaction block
- **B.** CREATE UNIQUE INDEX ... ON users(lower(email)) WHERE active
- **C.** CREATE UNIQUE INDEX CONCURRENTLY ... ON users(tenant_id,email); внутри BEGIN
- **D.** Удалить старый индекс и затем искать коллизии при создании нового

**2. Новый индекс INVALID, а позже разрешены одинаковые email в разных tenants. Что верно?**

- **A.** INVALID требует проверки и пересоздания; старый UNIQUE нельзя вернуть без устранения новых коллизий
- **B.** INVALID unique index всегда эквивалентен valid для новых writes; вернуть старый UNIQUE можно без collision audit, поскольку раньше он уже существовал
- **C.** Пересоздать INVALID concurrently после проверки, но при rollback достаточно вернуть старый binary: межtenant duplicate email автоматически получат новые имена
- **D.** Удалить INVALID и восстановить глобальный UNIQUE без предварительной обработки новых cross-tenant duplicates; уникальность по tenant уже исключает любые коллизии

Материалы: [postgres-index](https://www.postgresql.org/docs/current/sql-createindex.html), [pg-exercises](https://pgexercises.com/), [sql-academy](https://sql-academy.org/ru/trainer), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно обосновать жизненный цикл изменения данных и совместимость нескольких версий.

## Python: корректность, память и конкурентность

### Стажёр — Сводка строк журнала

ID: `research-mc:python:Intern` · открытая пара: `research:python:Intern`

summarize принимает строки user_id;amount. Пустые строки пропускаются, amount — целое ≥0; ошибки сохраняются по номеру строки с 1. Вход: ["a;2","bad","a;3","b;-1",""] .

**1. Какой результат соответствует контракту?**

- **A.** Суммы {a:5}; ошибки [1,3]
- **B.** Суммы {a:5}; ошибки [2,4]
- **C.** Суммы {a:5,b:-1}; ошибки [2]
- **D.** Суммы {a:3}; ошибки [2,4,5]

**2. Как организовать обработку ошибок?**

- **A.** Один try вокруг цикла, возврат при первом ValueError
- **B.** Удалять плохие строки из исходного списка во время обхода
- **C.** Любой Exception считать amount=0 без записи ошибки
- **D.** enumerate с 1, проверка двух полей, локальный try преобразования каждой строки

Материалы: [ex-python](https://exercism.org/tracks/python/exercises), [stepik-python](https://stepik.org/course/67/promo), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Основание уровня: Нужно реализовать небольшой, но полный контракт обработки ошибок.

### Junior — Объединение интервалов

ID: `research-mc:python:Junior` · открытая пара: `research:python:Junior`

merge объединяет пересечения полуоткрытых интервалов, но не соприкосновения. Вход [(5,8),(1,3),(2,6),(8,9)] менять нельзя.

**1. Каковы результат и условие объединения?**

- **A.** [(1,6),(5,8),(8,9)]; сравнение только соседей исходного списка
- **B.** [(1,8),(8,9)]; next.end&lt;current.end
- **C.** [(1,8),(8,9)]; next.start&lt;current.end
- **D.** [(1,9)]; next.start≤current.end

**2. Для n произвольных интервалов каковы время и способ не менять вход?**

- **A.** O(n); intervals.sort() и линейный проход
- **B.** O(log n); поиск бинарным поиском каждого пересечения
- **C.** O(n²) обязательно; каждый интервал сравнить со всеми
- **D.** O(n log n); sorted(intervals) и линейный проход

Материалы: [ex-python](https://exercism.org/tracks/python/exercises), [stepik-python](https://stepik.org/course/67/promo), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Основание уровня: Нужно реализовать алгоритм и доказать граничное поведение.

### Middle — Соединение отсортированных потоков

ID: `research-mc:python:Middle` · открытая пара: `research:python:Middle`

Два однопроходных итератора отсортированы по key и могут повторять ключи. Нужен inner join без хранения всей выборки; одна группа ключа помещается.

**1. Для общего ключа слева [a,b], справа [x,y,z] сколько пар и почему?**

- **A.** 1; ключ встречается один раз в результате
- **B.** 6; декартово произведение групп
- **C.** 2; zip до конца меньшей группы
- **D.** 3; сохранить последнее левое значение

**2. Какое решение согласуется с ограничением памяти?**

- **A.** При равенстве продвинуть оба по одной записи
- **B.** На каждом левом значении заново начать правый итератор
- **C.** Продвигать меньший ключ, буферизовать равные группы, выдавать пары; O(max group sizes)
- **D.** Преобразовать оба итератора в dict и пересечь ключи

Материалы: [ex-python](https://exercism.org/tracks/python/exercises), [stepik-python](https://stepik.org/course/67/promo), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Основание уровня: Нужно спроектировать ленивый алгоритм с явным бюджетом памяти.

### Senior — Отмена ограниченного batch fetch

ID: `research-mc:python:Senior` · открытая пара: `research:python:Senior`

async fetch(id) может зависнуть или выбросить исключение. Для100000 ids batch(ids,k,timeout) ограничивает concurrency и число Task, сохраняет порядок и cleanup при отмене.

**1. Какой подход покрывает concurrency, timeout и порядок?**

- **A.** O(k) workers с очередью, per-item timeout, индекс результата и отдельные ошибки
- **B.** 100000 Task под semaphore, individual timeout и индекс результата
- **C.** Последовательный await fetch без timeout
- **D.** Task на каждый id, сортировка ответов по времени завершения

**2. Как корректно обработать внешнюю отмену batch?**

- **A.** Вызвать cancel() на children и немедленно вернуть управление без await; факт выставления флага cancellation равен завершению сетевых операций
- **B.** Shield все workers, преобразовать внешнюю отмену в ошибку каждого элемента и оставить requests работать; это сохраняет результаты без orphan операций
- **C.** Отменить и дождаться дочерних задач, затем распространить CancelledError
- **D.** Поймать CancelledError, вернуть текущие частичные results и закрыть batch; children сами завершатся, поэтому ждать их и cleanup не требуется

Материалы: [python-asyncio](https://docs.python.org/3/library/asyncio-task.html), [ex-python](https://exercism.org/tracks/python/exercises), [stepik-python](https://stepik.org/course/67/promo), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Основание уровня: Требуется корректный жизненный цикл ресурсов и отмены при нагрузке.

### Lead — Потоковый экспорт с проверкой целостности

ID: `research-mc:python:Lead` · открытая пара: `research:python:Lead`

Python экспортирует 2 ТБ из БД в object storage при 512 MiB RAM. Доступны snapshot, keyset pagination, multipart upload; сбои возможны при чтении и записи.

**1. Какой checkpoint допускает безопасное продолжение после потери ответа на загрузку части?**

- **A.** Последний ключ и hash части без snapshot version; после потери ответа продолжить live keyset pagination, поскольку порядок ключей гарантирует согласованность данных
- **B.** Snapshot ID, границы ключей, стабильный part ID и подтверждённый hash/count; сверить уже записанную часть
- **C.** Snapshot ID, OFFSET и counts прочитанных строк; checkpoint публиковать перед upload, потому что retry может восстановить missing части по номеру страницы
- **D.** Snapshot ID и stable key границы, но новый случайный part ID на retry; manifest перечисляет все попытки, дедупликация строк после export решит повторы

**2. Snapshot истёк на середине экспорта. Как сохранить согласованность?**

- **A.** Повторить истёкший snapshot ID в metadata, а читать новые данные; стабильные part names и hashes гарантируют историческое содержимое исходного export
- **B.** Остановить этот экспорт; начать новый snapshot и manifest, публиковать только полный набор
- **C.** Продолжить по последнему ключу на live snapshot и использовать прежний manifest; отсутствие duplicate IDs гарантирует один согласованный временной срез
- **D.** Начать новый snapshot только для оставшихся ключей, сохранить прежние части и публиковать общий manifest после проверки count без version reconciliation

Материалы: [ex-python](https://exercism.org/tracks/python/exercises), [stepik-python](https://stepik.org/course/67/promo), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Основание уровня: Нужно согласовать алгоритм и протокол данных через несколько отказных границ.

## Алгоритмы и структуры данных

### Стажёр — Первое появление идентификатора

ID: `research-mc:algorithms:Intern` · открытая пара: `research:algorithms:Intern`

Из [4,2,4,1,2,7] нужны уникальные ID в порядке первого появления.

**1. Как получить [4,2,1,7] за ожидаемое O(n)?**

- **A.** Для каждого ID искать его во всей оставшейся части списка
- **B.** seen set и append в отдельный список при первом появлении
- **C.** Отсортировать set и вернуть список
- **D.** Добавлять каждое значение в set и вернуть отсортированный set

**2. Если уникальных ID k, какова дополнительная память и что меняется для нехешируемых ID?**

- **A.** O(k); обычный set работает с любыми mutable объектами
- **B.** O(k); нужна иная структура сравнения с другим bound
- **C.** O(1); set всегда хранит только последний ID
- **D.** O(n²); без hash невозможно решить задачу

Материалы: [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/), [ex-python](https://exercism.org/tracks/python/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises).

Основание уровня: Нужно реализовать и объяснить однопроходный алгоритм.

### Junior — Кратчайшая цепочка зависимостей

ID: `research-mc:algorithms:Junior` · открытая пара: `research:algorithms:Junior`

Ориентированный невзвешенный граф содержит циклы. Нужен кратчайший путь s→t либо None.

**1. Какое решение гарантирует кратчайший путь?**

- **A.** BFS без visited, parent перезаписывается при каждом входящем ребре
- **B.** Сортировать вершины по имени и пройти один раз
- **C.** BFS, visited при добавлении в очередь, parent при первом открытии
- **D.** DFS, остановка при первом достижении t

**2. Каковы сложность по спискам смежности и путь при s=t?**

- **A.** O(V+E); обязательно пройти цикл до s
- **B.** O(V+E); [s]
- **C.** O(V²); None
- **D.** O(E log V); []

Материалы: [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/), [ex-python](https://exercism.org/tracks/python/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises).

Основание уровня: Нужно выбрать алгоритм и доказать свойство минимальности.

### Middle — Взвешенное расписание работ

ID: `research-mc:algorithms:Middle` · открытая пара: `research:algorithms:Middle`

Работы (start,end,profit): A=(0,3,5),B=(1,4,6),C=(3,5,5),D=(0,5,11). Соприкосновения разрешены.

**1. Какой оптимум и корректная recurrence после сортировки по end?**

- **A.** 10; брать работу с минимальным end
- **B.** 16; dp[i]=profitᵢ+dp[i−1]
- **C.** 11; p(i) требует end[p(i)]&lt;startᵢ
- **D.** 11; dp[i]=max(dp[i−1],profitᵢ+dp[p(i)]) при end[p(i)]≤startᵢ

**2. Как найти p(i) и восстановить выбранные ID за O(n log n)?**

- **A.** Binary search по отсортированным end; сохранить/восстановить ветви DP
- **B.** Для каждого i просмотреть все предыдущие работы
- **C.** Отсортировать по profit и взять непересекающиеся
- **D.** Хранить только итоговую сумму без выбора ветвей

Материалы: [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/), [ex-python](https://exercism.org/tracks/python/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises).

Основание уровня: Требуется самостоятельный вывод DP и восстановление решения.

### Senior — Внешняя сортировка журнала

ID: `research-mc:algorithms:Senior` · открытая пара: `research:algorithms:Senior`

Файл 500 ГБ, RAM 1 ГБ, максимум 128 открытых файлов. Сортировка по (user_id,event_time,event_id) и удаление точных дублей.

**1. Как организовать внешнюю сортировку?**

- **A.** Sorted runs по1GB и одноэтапный merge всех примерно500 файлов; FD ограничение обходится тем, что heap хранит лишь один ключ от каждого файла
- **B.** Hash partition по user_id, sort внутри partitions и concatenate по номеру bucket; это даёт глобальный порядок всех трёх полей без merge
- **C.** Sort runs в bounded RAM и concatenate по минимальному ключу каждого run; перекрытие диапазонов не влияет на полный порядок внутри каждого run
- **D.** Bounded sorted runs; многоступенчатый k-way merge с fan-in ниже лимита FD

**2. Когда можно безопасно удалить точные дубли?**

- **A.** При merge хранить seen по user_id и удалять все последующие строки этого пользователя: это сохраняет точные события и ограничивает память1GB
- **B.** Сравнивать соседние (user_id,event_time), игнорируя event_id; сортировка по трём полям делает все такие записи точными дублями автоматически
- **C.** В merge сравнивать соседние полные ключи, сохраняя последний выданный
- **D.** Удалять точные дубли внутри каждого sorted run, затем обычный merge без межrun сравнения: одинаковые полные ключи всегда попадут в один run

Материалы: [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/), [ex-python](https://exercism.org/tracks/python/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises).

Основание уровня: Нужно учитывать внешнюю память, файловые лимиты и корректность merge.

### Lead — Проверяемая смена шардирования

ID: `research-mc:algorithms:Lead` · открытая пара: `research:algorithms:Lead`

Миграция hash(key)%8→%16 при продолжающихся записях и удалениях. Есть record versions и tombstones, нет межшардовой транзакции.

**1. Какой контрпример ломает наивное copy-then-switch?**

- **A.** Копирование записи с тем же version без новых записей
- **B.** Изменение числа пустых шардов без затронутых ключей
- **C.** После копирования v1 в новый шард старый принимает v2 или delete; switch возвращает v1
- **D.** Два чтения неизменного v1 из старого шарда

**2. Какое условие необходимо для заявленной гарантии после подтверждённой записи?**

- **A.** Routing epoch и dual reads, при miss всегда fallback старой записи; versions учитывать только при совпадении ключа в обоих шардах, tombstones можно удалить
- **B.** Version-aware copy и tombstones, но подтверждать старые writes после cutover без barrier/fencing; version сравнение гарантирует отсутствие stale reads всегда
- **C.** Остановить копирование при delete, удалять tombstone после локального apply; read нового шарда при miss возвращает старый, согласование routing не требуется
- **D.** Routing epoch и cutover barrier/fencing, сравнение versions, перенос tombstones

Материалы: [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/), [ex-python](https://exercism.org/tracks/python/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises).

Основание уровня: Нужно доказать алгоритмический инвариант через конкурентную миграцию.

## HTML, CSS и доступность

### Стажёр — Форма без мыши

ID: `research-mc:web-platform:Intern` · открытая пара: `research:web-platform:Intern`

Форма: два input без label, отправка через div с click. Нужны обязательный email, доступная ошибка и клавиатурная отправка.

**1. Какая структура обеспечивает нативную отправку с клавиатуры?**

- **A.** form, input type=text, span tabindex=0 с click
- **B.** form, label без связи, button type=button без обработчика клавиатуры
- **C.** form, label с for, input type=email required, button type=submit
- **D.** div role=form, placeholder вместо label, div с click

**2. Как связать ошибку и сохранить фокус?**

- **A.** Скрыть поле при ошибке и перенести Tab на конец страницы
- **B.** aria-describedby на поле, aria-invalid при ошибке, видимый focus style
- **C.** title на div ошибки, outline:none на всех controls
- **D.** Только красный border поля и общий alert без связи

Материалы: [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [figma](https://www.figma.com/resource-library/getting-started-in-design/).

Основание уровня: Нужно создать рабочую форму с несколькими состояниями.

### Junior — Сетка с длинными названиями

ID: `research-mc:web-platform:Junior` · открытая пара: `research:web-platform:Junior`

Карточки в контейнере 320…1200px: минимальная ширина 240px, gap 16px. Длинное слово не должно расширять страницу, кнопки внизу.

**1. Какое grid-правило сохраняет адаптивность даже в контейнере уже 240px?**

- **A.** repeat(auto-fit,minmax(240px,240px))
- **B.** repeat(auto-fit,minmax(100%,240px))
- **C.** repeat(auto-fit,minmax(min(100%,240px),1fr))
- **D.** repeat(4,240px)

**2. Как обработать длинное слово и выровнять кнопки без фиксированной высоты текста?**

- **A.** word-break:normal; кнопка float:right
- **B.** min-width:0, overflow-wrap:anywhere; flex-column и margin-top:auto на кнопке
- **C.** min-width:240px, white-space:nowrap; absolute bottom:0 без места под кнопку
- **D.** overflow:hidden на странице; фиксированная высота текста

Материалы: [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [figma](https://www.figma.com/resource-library/getting-started-in-design/).

Основание уровня: Нужно согласовать несколько правил раскладки и проверить крайние размеры.

### Middle — Модальное окно с вложенным выбором

ID: `research-mc:web-platform:Middle` · открытая пара: `research:web-platform:Middle`

Из таблицы открыт dialog редактирования, из него второй dialog даты. Инициирующая строка может быть удалена.

**1. Как обрабатывать Escape и Tab при двух открытых dialog?**

- **A.** Два независимых focus trap одновременно конкурируют
- **B.** Escape закрывает верхний; Tab ограничен верхним, фон inert
- **C.** Escape закрывает оба; Tab проходит через таблицу
- **D.** Escape закрывает нижний; trap остаётся в нём

**2. Куда вернуть фокус после закрытия, если инициатор удалён?**

- **A.** Создать скрытый клон удалённой кнопки и сфокусировать его
- **B.** Проверить доступность инициатора; иначе логический fallback в таблице
- **C.** Всегда focus() на сохранённом DOM-узле независимо от connected
- **D.** Всегда на body, даже если доступна соседняя строка

Материалы: [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [figma](https://www.figma.com/resource-library/getting-started-in-design/).

Основание уровня: Требуется спроектировать поведение при динамическом DOM.

### Senior — Большая доступная таблица

ID: `research-mc:web-platform:Senior` · открытая пара: `research:web-platform:Senior`

Каталог: 100000 строк ×20 колонок; нужны поиск, клавиатурное редактирование и screen reader. Серверный поиск занимает 500ms.

**1. Какое условие обязательно при выборе виртуализации?**

- **A.** Виртуализировать строки, stable record IDs и aria indices, но focus хранить только в DOM node; unmount активной строки не влияет на keyboard continuity
- **B.** Сохранить весь DOM и скрыть offscreen rows opacity:0; screen reader и browser Tab сами обеспечат доступность и render budget100000 строк
- **C.** Использовать pagination и row indices от0 на каждой странице, без общего identity; доступность подтверждать только автоматическим screenshot сравнением
- **D.** Стабильные record IDs, логические row indices, управляемый фокус и проверка с assistive tech

**2. Как проверить отзывчивость и потерю фокуса при удалении строки?**

- **A.** Измерить суммарную среднюю latency одного запроса и автоматически focus body после любых updates; screen-reader путь отдельно тестировать не требуется
- **B.** Отдельно измерить input/render и поиск; удалить сфокусированную запись и проверить логический переход
- **C.** Измерить server500ms и считать их полным UI latency; удалённую focused строку оставить detached node как постоянный navigation anchor без fallback
- **D.** Измерить render/input на пустом списке и network отдельно; удаление active row проверять только мышью, поскольку Tab order определяется CSS автоматически

Материалы: [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [figma](https://www.figma.com/resource-library/getting-started-in-design/).

Основание уровня: Нужно сравнить стратегии по нескольким конфликтующим ограничениям.

### Lead — Миграция компонентов формы

ID: `research-mc:web-platform:Lead` · открытая пара: `research:web-platform:Lead`

12 приложений мигрируют на библиотеку полей; за 6 недель доступны только 3 пилота. Нужны совместимость, темы и одинаковая клавиатурная семантика.

**1. Что должно входить в контракт общей библиотеки?**

- **A.** Единые CSS tokens и TypeScript events без runtime conformance; наличие одинаковых declarations доказывает одинаковый focus и submit во всех runtimes
- **B.** States/events, HTML/ARIA, ошибки, CSS tokens и conformance fixtures
- **C.** Типизированные props, design tokens и screenshot fixtures; HTML/ARIA states и keyboard events оставлять каждому приложению, объявив library behavior единым
- **D.** Единые HTML/ARIA states и глобальные CSS overrides; errors/events не версионировать, потому что визуальный API библиотеки не является behavior contract

**2. Как выбрать пилоты и ограничить риск миграции?**

- **A.** Сначала заменить все поля без rollback boundary, затем проводить AT tests только в новом приложении; проблемы остальных исправлять после полного cutover
- **B.** Покрыть разные сценарии/темы, применить адаптер, keyboard/AT regressions и поэтапный rollback
- **C.** Выбрать три самых похожих формы, проверить screenshot и сразу считать остальные девять compatible; одинаковый вид достаточен для keyboard contract
- **D.** Выбрать разнообразные пилоты, но мигрировать только CSS без adapters/runtime regressions; семантика старого HTML автоматически станет общей

Материалы: [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [figma](https://www.figma.com/resource-library/getting-started-in-design/).

Основание уровня: Нужно обеспечить проверяемые гарантии общей системы при ограниченном rollout.

## JavaScript и TypeScript

### Стажёр — Копия и обновление массива

ID: `research-mc:javascript-typescript:Intern` · открытая пара: `research:javascript-typescript:Intern`

rows=[{id:1,done:false},{id:2,done:false}]. Нужно изменить done у id=2, сохранив исходные данные и ссылку первой строки.

**1. Какой код соответствует контракту?**

- **A.** rows.map(r=>r.id===2?{...r,done:true}:r)
- **B.** [...rows].map(r=>{if(r.id===2)r.done=true;return r})
- **C.** rows.map(r=>({...r,done:r.id===2}))
- **D.** rows[1].done=true; return rows

**2. Какие проверки ссылок должны пройти?**

- **A.** result===rows; result[0]===rows[0]; result[1]===rows[1]
- **B.** result!==rows; обе строки имеют новые ссылки
- **C.** result!==rows; result[1]===rows[1]
- **D.** result!==rows; result[0]===rows[0]; result[1]!==rows[1]

Материалы: [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно реализовать и проверить семантику ссылок.

### Junior — Тип состояний загрузки

ID: `research-mc:javascript-typescript:Junior` · открытая пара: `research:javascript-typescript:Junior`

LoadState&lt;T>: idle,loading,success с data,error с message. Нужно безопасное чтение data и проверка полноты render.

**1. Какой тип поддерживает narrowing?**

- **A.** Discriminated union отдельных объектов с status и полями соответствующей ветви
- **B.** Один объект с status:string и data?:T,message?:string
- **C.** Один объект с обязательными data:T и message:string для всех состояний
- **D.** Тип any для ответа render

**2. Что обнаружит добавление cancelled при switch с assertNever в default?**

- **A.** Автоматическое преобразование cancelled в error
- **B.** Компилятор гарантирует отсутствие неизвестных status в сетевом JSON
- **C.** Compile error в неполном обработчике; runtime JSON всё равно требует валидации
- **D.** Только runtime ошибка, компиляция всегда успешна

Материалы: [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно сформулировать контракт типов и его эволюцию.

### Middle — Устаревший ответ поиска

ID: `research-mc:javascript-typescript:Middle` · открытая пара: `research:javascript-typescript:Middle`

Поиск: a затем ab. Ответ ab раньше a. Нужны debounce 200ms и запрет устаревшего commit.

**1. Какая комбинация закрывает гонку?**

- **A.** Только AbortController без проверки revision
- **B.** Только debounce; порядок ответов автоматически совпадёт
- **C.** Сравнить время ответа и применять самый поздний
- **D.** Abort предыдущего, cleanup таймера, revision guard после await перед commit

**2. a уже получил ответ, но обработка ждёт microtask; введён ab. Что должен проверить обработчик a?**

- **A.** Длину ответа против текущего search
- **B.** Свою revision против текущей непосредственно перед записью
- **C.** Только response.ok, поскольку сеть уже закончилась
- **D.** Только controller.signal до отправки a

Материалы: [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно разобрать гонку между отменой и фиксацией результата.

### Senior — Валидация на границе типов

ID: `research-mc:javascript-typescript:Senior` · открытая пара: `research:javascript-typescript:Senior`

JSON Payment: amount стал строкой, currency иногда null; сумма может превышать safe integer JS. Клиент использует response as Payment.

**1. Как безопасно разбирать ответ?**

- **A.** unknown→runtime schema/version adapter; деньги decimal string или bigint minor units по контракту
- **B.** Runtime parser проверяет currency/date, amount всегда преобразуется Number(); schema validation типа number гарантирует точность любых денежных integers
- **C.** Version adapter и decimal string в DTO, но SDK сначала делает parseFloat и затем string round-trip; TypeScript string type восстановит исходную точность
- **D.** Получить unknown, применить as Payment и проверять только наличие полей; assertion является runtime validator, а null currency заменять default без contract

**2. Какой тест выявляет потерю точности?**

- **A.** Сумма minor units "9007199254740993" проходит round-trip без округления
- **B.** Сумма "100" превращается в Number 100
- **C.** Только проверка наличия currency поля
- **D.** Только snapshot имени TypeScript интерфейса

Материалы: [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Взаимодействуют внешний контракт, точность данных и совместимость.

### Lead — SDK для нескольких потребителей

ID: `research-mc:javascript-typescript:Lead` · открытая пара: `research:javascript-typescript:Lead`

SDK для браузера, Node.js и React Native меняет ошибки и cancellation; старые consumers живут ещё 3 месяца.

**1. Какая проверка связывает declarations с поведением SDK?**

- **A.** Runtime fixtures всех errors, но без compile fixtures и cancellation traces; совпадение текстов сообщений гарантирует совместимость типов и AbortSignal
- **B.** Compile fixtures и runtime conformance для ошибок/отмены на матрице runtimes
- **C.** Compile fixtures во всех runtimes и package exports check; actual error/cancellation поведение не проверять, declarations гарантируют runtime соответствие
- **D.** Runtime smoke в Node и compile в браузере; React Native и CJS считать equivalent ESM, если bundle собирается без syntax errors

**2. Как обеспечить переход старых клиентов?**

- **A.** Оставить старые declarations на3 месяца, runtime errors сразу заменить; consumers компилируются, поэтому behavior compatibility автоматически сохранена
- **B.** Версионировать ошибки и cancellation, убрать CJS немедленно под тем же minor; только browser ESM consumers определяют обратную совместимость SDK
- **C.** Сохранить exports и старую error shape, но abort игнорировать в React Native без маркировки; наличие AbortSignal в типах достаточно для общего contract
- **D.** Версионировать contract, адаптировать старые errors, закрепить exports и срок поддержки

Материалы: [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html), [mdn](https://developer.mozilla.org/en-US/docs/Learn_web_development), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно обеспечить технический контракт нескольких платформ и версий.

## React: состояние и асинхронные данные

### Стажёр — Счётчик и производное значение

ID: `research-mc:react:Intern` · открытая пара: `research:react:Intern`

React: counter в useState; doubled отдельно обновляется useEffect. Кнопка должна увеличить counter дважды.

**1. Как исключить отставание doubled?**

- **A.** Хранить doubled в state и обновлять setTimeout
- **B.** Добавить второй useEffect для обратного изменения counter
- **C.** Мутировать doubled напрямую без render
- **D.** Вычислять doubled=counter*2 при render

**2. Какие два вызова гарантируют +2?**

- **A.** setCounter(c=>counter+1); setCounter(c=>counter+1)
- **B.** setCounter(c=>c+1); setCounter(c=>c+1)
- **C.** setCounter(counter+1); setCounter(counter+1)
- **D.** setCounter(counter++); setCounter(counter++)

Материалы: [react-effects](https://react.dev/learn/you-might-not-need-an-effect), [react](https://react.dev/learn), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно исправить код с двумя связанными ошибками состояния.

### Junior — Перестановка редактируемых строк

ID: `research-mc:react:Junior` · открытая пара: `research:react:Junior`

React-строки используют key=index и локальный draft; после сортировки черновик переехал к другой записи.

**1. Как исправить identity строки?**

- **A.** key=Math.random() при каждом render
- **B.** Оставить index, добавить id только в текст
- **C.** key=текущая позиция+длина массива
- **D.** key=record.id, стабильный между сортировками

**2. Draft должен переживать unmount строки. Где его хранить?**

- **A.** В map по record.id вне строки с явной политикой удаления
- **B.** Только в локальном useState строки
- **C.** В DOM value TextInput без контролируемой модели
- **D.** В useMemo строки, поскольку memo переживает unmount

Материалы: [react](https://react.dev/learn), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно восстановить корректную идентичность и срок жизни данных.

### Middle — Оптимистическое редактирование

ID: `research-mc:react:Middle` · открытая пара: `research:react:Middle`

A отправил optimistic edit version=7; B сохранил version=8. A получает 409, но успел набрать новый текст пока запрос ожидал.

**1. Какую модель UI выбрать?**

- **A.** Автоматически повторить старую отправку без новой version
- **B.** canonical, submitted snapshot и current draft отдельно; conflict с expectedVersion
- **C.** Один объект state для сервера, отправки и текущего текста
- **D.** Заменить draft ответом 409 сразу

**2. Какое действие безопасно после 409?**

- **A.** Повторять expectedVersion=7 до HTTP 200
- **B.** Сохранить current draft, показать свежий canonical, предложить merge/retry по новой version
- **C.** Вернуть submitted snapshot поверх current draft
- **D.** Считать optimistic update окончательно успешным

Материалы: [react](https://react.dev/learn), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно обработать серверный и локальный конфликт одновременно.

### Senior — SSR и персональные данные

ID: `research-mc:react:Senior` · открытая пара: `research:react:Senior`

SSR /me содержит имя и экспериментальную группу; CDN кеширует HTML только по URL. Есть чужие имена и hydration mismatch.

**1. Как исправить границу кеширования?**

- **A.** CDN key=URL+User-Agent, personal initial state в общем HTML; разные devices обычно изолируют пользователей, дополнительная identity scope не нужна
- **B.** URL cache оставить, personal имя скрывать до hydration; байты общего HTML доступны, но client replacement исключает возможность утечки
- **C.** Shared HTML с user name и экспериментом кешировать60s, после logout очистить browser cache; короткий TTL исключает межuser sharing на CDN
- **D.** Общий shell без personal data либо private cache с корректной identity scope

**2. Что нужно для согласованной hydration?**

- **A.** Сериализовать identity state и token в общий CDN HTML, client проверит своё имя и исправит; это одновременно гарантирует SSR consistency и privacy
- **B.** Первый client render пересчитывает эксперимент по новой seed, server HTML не менять; одинаковые component types достаточны для hydration совпадения
- **C.** Одинаковый допустимый initial snapshot сервера и первого client render
- **D.** Сервер и client независимо выбирают random/time initial values, suppression hydration warnings; matching после первого effect считается корректной hydration

Материалы: [react](https://react.dev/learn), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно согласовать SSR, кеш и приватность через несколько границ.

### Lead — Общий слой запросов

ID: `research-mc:react:Lead` · открытая пара: `research:react:Lead`

Пять React-приложений объединяют query caches: logout, optimistic updates, offline, SSR и dedup.

**1. Какой cache key/transition защищает от чужих данных?**

- **A.** Cache keys по URL+tenant, logout удаляет session cookie; inflight responses могут дописать cache, потому что API уже проверил прежнюю identity
- **B.** Identity/tenant keys и очистка values на logout, но reuse одного inflight Promise для разных identities; dedup безопасен при одинаковом endpoint
- **C.** Один global SSR cache с коротким TTL и permission flags только в UI; быстрое истечение гарантирует отсутствие cross-user data при server render
- **D.** Identity/tenant scope в ключах; при смене identity очистить данные и запретить поздние commits

**2. Что проверять в conformance suite общего слоя?**

- **A.** Проверить каждый cache отдельно на одной identity, затем объединить без adapter traces; индивидуальная корректность гарантирует совместимость lifecycle
- **B.** Identity switch при inflight, optimistic conflict, offline replay и SSR isolation
- **C.** Contract suite cache hit/dedup и optimistic success; logout во время inflight и SSR isolation считать покрытыми unit test HTTP endpoint
- **D.** Compile fixtures hooks и runtime только read path; offline replay и mutation conflict передать приложениям без определения общей revision семантики

Материалы: [react](https://react.dev/learn), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно спроектировать библиотечные гарантии и их внедрение.

## Реактивность Vue и Angular

### Стажёр — Vue: фильтр списка

ID: `research-mc:vue-angular:Intern` · открытая пара: `research:vue-angular:Intern`

Vue 3: ref товаров и ref search. Фильтр должен обновляться и при изменении названия товара.

**1. Как организовать список?**

- **A.** computed только от search, товары копируются вне реактивности
- **B.** computed, читающий reactive search/products; filter без мутации; key=id
- **C.** Пересчитать один раз при setup и сохранить обычный массив
- **D.** splice исходного products на каждом search

**2. Почему пересчёт только по click недостаточен?**

- **A.** Click автоматически отслеживает все дальнейшие изменения
- **B.** Изменение reactive названия не обязано сопровождаться click
- **C.** Computed всегда запускается на каждом keyboard event вне зависимостей
- **D.** Vue не отслеживает поля объектов внутри reactive списка

Материалы: [vue](https://vuejs.org/tutorial/), [angular](https://angular.dev/tutorials), [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

Основание уровня: Нужно собрать реактивный компонент с изменяемыми данными.

### Junior — Angular: валидация формы

ID: `research-mc:vue-angular:Junior` · открытая пара: `research:vue-angular:Junior`

Angular: email и confirmEmail, формат/обязательность/совпадение. Серверный 409 означает занятый email.

**1. Где проверять совпадение и связывать серверную ошибку?**

- **A.** Group validator; server error связан с отправленным email
- **B.** Validator только confirmEmail без чтения email
- **C.** 409 хранить как общую вечную ошибку приложения
- **D.** Совпадение проверять только после HTTP 201

**2. После 409 меняется confirmEmail, но email прежний. Что происходит с ошибкой занятости?**

- **A.** Остаётся; очищается при релевантном изменении email
- **B.** Сразу очищается при любом valueChanges формы
- **C.** Превращается в ошибку confirmEmail
- **D.** Автоматически считается решённой после blur

Материалы: [angular](https://angular.dev/tutorials), [vue](https://vuejs.org/tutorial/), [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

Основание уровня: Нужно определить несколько независимых источников ошибок.

### Middle — Vue: watcher и отмена

ID: `research-mc:vue-angular:Middle` · открытая пара: `research:vue-angular:Middle`

Vue watcher запускает три fetch поиска. Ответы приходят в обратном порядке, компонент может unmount.

**1. Как предотвратить stale commit?**

- **A.** Cleanup/abort плюс revision guard и проверка lifetime перед commit
- **B.** Только watcher immediate:true
- **C.** Только обработка response.ok
- **D.** Применять каждый ответ, затем сортировать список

**2. Какой тест действительно проверяет гонку?**

- **A.** Deferred responses C,B,A и unmount до завершения; применён только актуальный живой C
- **B.** Три синхронных ответа в порядке A,B,C
- **C.** Только snapshot списка после первого fetch
- **D.** Только вызов abort без проверки состояния

Материалы: [vue](https://vuejs.org/tutorial/), [angular](https://angular.dev/tutorials), [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

Основание уровня: Нужно доказать корректность асинхронного реактивного эффекта.

### Senior — Angular: поток поиска

ID: `research-mc:vue-angular:Senior` · открытая пара: `research:vue-angular:Senior`

Angular: subscribe внутри subscribe поиска и выбранной детали. Старая деталь приходит поздно, после ухода остаются подписки.

**1. Как построить latest-only поток с восстановлением после ошибки?**

- **A.** concatMap с внутренним catchError и cleanup; каждый queued выбор обязан показать detail независимо от текущего selection, это latest-only contract
- **B.** distinctUntilChanged→switchMap; catchError внутри inner; destroy binding
- **C.** switchMap для latest-only, catchError снаружи всего input потока и destroy cleanup; после ошибки outer stream продолжает ввод автоматически
- **D.** mergeMap и distinctUntilChanged с destroy cleanup; distinctUntilChanged гарантирует, что поздняя старая деталь не заменит новую

**2. A выбран, затем B; B ответил, затем A. Какой результат должен быть после ответа A?**

- **A.** A заменяет B как последний сетевой ответ
- **B.** Показываются A и B в одной детали
- **C.** Поток закрывается из-за изменения выбора
- **D.** Остаётся B; A не фиксируется

Материалы: [angular](https://angular.dev/tutorials), [vue](https://vuejs.org/tutorial/), [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

Основание уровня: Требуется корректная композиция и проверка нескольких потоков событий.

### Lead — Смешанная миграция UI

ID: `research-mc:vue-angular:Lead` · открытая пара: `research:vue-angular:Lead`

Общий редактор Vue/Angular сохраняет draft при переходах. Передаются snapshot и revision; нужны ownership и cleanup.

**1. Какой контракт устраняет два источника истины?**

- **A.** Один владелец canonical/draft, versioned DTO/events, framework adapters
- **B.** Два framework stores владеют draft независимо; timestamps синхронизируют последний save, а Web Component сам устраняет concurrent sources of truth
- **C.** Canonical owner общий, draft по одному в каждом framework; оба freely commit один revision, отдельный ordering contract не нужен
- **D.** Один owner и DTO, но mount/unmount не прекращают старые event handlers; одинаковый payload schema предотвращает stale commits после перехода

**2. Как проверить совместимость границы?**

- **A.** Одинаковые screenshots после save и bundle tests; lifecycle traces не нужны, потому что framework-neutral DTO гарантирует cleanup
- **B.** Mount/edit/save happy path в обоих adapters; conflict/unmount и сохранение черновика проверять только в одном, behavior считается framework-independent
- **C.** Compile DTO fixtures и round-trip JSON; runtime events порядок, ownership и route rollback не входят в совместимость этого integration contract
- **D.** Одинаковые traces mount/edit/save/conflict/unmount для обоих adapters

Материалы: [vue](https://vuejs.org/tutorial/), [angular](https://angular.dev/tutorials), [typescript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html).

Основание уровня: Нужно обеспечить совместимость двух реализаций общего поведения.

## API: FastAPI и Node.js

### Стажёр — FastAPI: вход и ошибка

ID: `research-mc:backend-api:Intern` · открытая пара: `research:backend-api:Intern`

FastAPI POST /items: name непустой после trim; quantity строго integer 1…100, строка "3" недопустима. ID создаёт сервер, успех 201.

**1. Какая проверка соответствует контракту?**

- **A.** Strict integer constraints, trim validator и response model с 201
- **B.** Обычный int с coercion строки и проверка только на frontend
- **C.** quantity:str, преобразовать в int после сохранения
- **D.** Принимать клиентский ID и необработанный name

**2. Какой запрос должен пройти?**

- **A.** {name:"A",quantity:101}
- **B.** {name:" A ",quantity:3} → name:"A"
- **C.** {name:" ",quantity:3}
- **D.** {name:"A",quantity:"3"}

Материалы: [fastapi](https://fastapi.tiangolo.com/tutorial/), [fullstack](https://fullstackopen.com/en/), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно реализовать контракт с типами, нормализацией и ошибками.

### Junior — Node.js: ошибка асинхронного обработчика

ID: `research-mc:backend-api:Junior` · открытая пара: `research:backend-api:Junior`

Node.js async createOrder может reject ValidationError либо DatabaseError. Нужны безопасные 400/503 и ровно один ответ.

**1. Как перехватить reject после await?**

- **A.** Отправить stack trace клиента при любом reject
- **B.** await операции внутри согласованного async error boundary/центрального mapper
- **C.** try вокруг вызова без await и без обработки Promise
- **D.** Ответить 201 до await, затем отправить 503 при reject

**2. Как отобразить DatabaseError?**

- **A.** 503 и затем 500 во втором обработчике
- **B.** 503 с requestId; детали в безопасном server log
- **C.** 400 со SQL запросом и stack
- **D.** 201 с пустым объектом, чтобы клиент не повторял

Материалы: [fastapi](https://fastapi.tiangolo.com/tutorial/), [fullstack](https://fullstackopen.com/en/), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно реализовать корректную обработку асинхронных отказов.

### Middle — FastAPI: идемпотентный платёж

ID: `research-mc:backend-api:Middle` · открытая пара: `research:backend-api:Middle`

POST /payments с Idempotency-Key: провайдер списал, ответ потерян. Конкурентные запросы с одним ключом иногда имеют разный amount.

**1. Какой контракт локального состояния необходим?**

- **A.** Unique owner/key, payload digest, pending/result; mismatch→409
- **B.** Только in-memory Set ключей процесса
- **C.** Новый ключ на каждый timeout
- **D.** Один ключ на пользователя для всех платежей

**2. Чем разрешить неопределённый результат внешнего списания?**

- **A.** Повторить списание с новым key после каждого timeout
- **B.** Локальный PostgreSQL rollback отменит внешний эффект
- **C.** Вернуть failed и удалить локальную запись без проверки
- **D.** Provider idempotency key либо status/reconciliation для той же операции

Материалы: [fastapi](https://fastapi.tiangolo.com/tutorial/), [fullstack](https://fullstackopen.com/en/), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно согласовать локальную и внешнюю границы отказа.

### Senior — Node.js: CPU и хвост задержки

ID: `research-mc:backend-api:Senior` · открытая пара: `research:backend-api:Senior`

Node.js принимает 300 req/s. Один endpoint делает 80ms синхронного CPU; одно ядро 100%, p99 остальных >2s.

**1. Теоретический максимум таких расчётов на одном worker без другого overhead?**

- **A.** 300/s
- **B.** Около 80/s
- **C.** Около 1250/s
- **D.** Около 12.5/s

**2. Как изолировать нагрузку и проверить причину?**

- **A.** Добавить await Promise.resolve перед расчётом и несколько keep-alive connections; измерять только DB spans, поскольку CPU utilization30% исключает loop lag
- **B.** Bounded worker pool/сервис, backpressure/deadlines; event-loop delay, CPU и DB spans
- **C.** Оставить CPU на event loop, увеличить HTTP timeout и DB pool; async handler автоматически изолирует80ms синхронную часть от прочих endpoints
- **D.** Вынести расчёт в worker pool, очередь без bound и без deadlines; p99 измерять только worker execution, ожидание очереди не является временем API

Материалы: [fastapi](https://fastapi.tiangolo.com/tutorial/), [fullstack](https://fullstackopen.com/en/), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно количественно оценить bottleneck и проверить причинность.

### Lead — Версия API и постепенная миграция

ID: `research-mc:backend-api:Lead` · открытая пара: `research:backend-api:Lead`

FastAPI/Node.js DTO amount:number меняют на amountMinor:string+currency. Старые клиенты живут 90 дней, точность и retry должны сохраниться.

**1. Что нельзя безопасно вернуть старому number-клиенту как integer minor units?**

- **A.** Значение 100 в согласованной валюте
- **B.** Значение 0 в согласованной валюте
- **C.** Значение 42 в согласованной валюте
- **D.** Значение 9007199254740993 без потери точности

**2. Какой rollout сохраняет retry semantics?**

- **A.** Version adapters и stable key, amountMinor всегда через Number для старых clients; невозможные значения округлять, чтобы сохранить HTTP200 compatibility
- **B.** Сохранить точный string DTO и consumer fixtures, но new version создаёт новые keys для pending retries; разные версии обозначают разные платежи
- **C.** Expand DTO и safe subset старых клиентов, digest считать по raw JSON каждой версии без operation normalization; изменение representation не влияет на retry
- **D.** Version adapters, stable operation key/payload contract, consumer fixtures и отказ старому клиенту для непредставимых значений

Материалы: [fastapi](https://fastapi.tiangolo.com/tutorial/), [fullstack](https://fullstackopen.com/en/), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно обеспечить контракт данных и операций на нескольких стэках.

## Java и Go: коллекции и конкурентность

### Стажёр — Java: группировка событий

ID: `research-mc:java-go:Intern` · открытая пара: `research:java-go:Intern`

Java countByType([A,null,B,A,empty]) пропускает null Event и пустой type; список не меняется.

**1. Какой результат?**

- **A.** {A:2,B:1}
- **B.** {A:1,B:1}
- **C.** {A:2,B:1,null:1,empty:1}
- **D.** {A:3,B:1}

**2. Как накопить count при отсутствующем ключе?**

- **A.** Удалять invalid Event из исходного списка при foreach
- **B.** Использовать Set типов вместо счётчиков
- **C.** Новый HashMap; merge(type,1,Integer::sum) после проверок
- **D.** map.get(type)+1 без default

Материалы: [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Основание уровня: Нужно реализовать коллекционный контракт с отсутствующими значениями.

### Junior — Go: копия слайса

ID: `research-mc:java-go:Junior` · открытая пара: `research:java-go:Junior`

Go: функция сортирует копию []int; capacity входа больше length, исходная backing array должна сохраниться.

**1. Что действительно создаёт независимую копию?**

- **A.** make/copy либо slices.Clone, затем сортировка копии
- **B.** s[:len(s)], затем sort.Ints
- **C.** s[:len(s):len(s)], затем sort.Ints
- **D.** Присвоить t:=s и сортировать t

**2. Какой тест выявит ошибку reslice?**

- **A.** Проверить только сортировку результата
- **B.** Проверить только capacity результата
- **C.** После сортировки результата сравнить элементы исходного slice с сохранённой копией
- **D.** Сравнить только длины входа и выхода

Материалы: [ex-go](https://exercism.org/tracks/go/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Основание уровня: Нужно разобраться в семантике памяти и написать регрессионный тест.

### Middle — Go: pipeline и ранняя остановка

ID: `research-mc:java-go:Middle` · открытая пара: `research:java-go:Middle`

Go producer→два workers→consumer. Consumer прекращает чтение после 10 результатов; возможны blocked sends.

**1. Кто должен закрыть общий output channel?**

- **A.** Каждый worker независимо после своей задачи
- **B.** Consumer сразу после 10-го результата
- **C.** Producer сразу после закрытия input
- **D.** Coordinator после завершения всех workers через WaitGroup

**2. Что освобождает worker, заблокированный на send после остановки consumer?**

- **A.** recover panic без завершения producer
- **B.** select между output&lt;-result и ctx.Done(); cancel и ожидание всех goroutines
- **C.** Проверка ctx.Err() только перед вычислением
- **D.** Ещё один buffered channel без ограничения размера

Материалы: [ex-go](https://exercism.org/tracks/go/exercises), [ex-java](https://exercism.org/tracks/java/exercises), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Основание уровня: Нужно доказать корректность завершения нескольких конкурентных участников.

### Senior — Java: ограниченный executor

ID: `research-mc:java-go:Senior` · открытая пара: `research:java-go:Senior`

Java fixedThreadPool накопил 2 млн задач внешних запросов. Timeout HTTP клиента не отменяет работу.

**1. Как ограничить ресурсный рост?**

- **A.** Fixed pool и unbounded queue, сокращённый HTTP timeout; возврат timeout клиенту автоматически отменяет работу executor и освобождает connection
- **B.** Bounded queue с rejection, отклонённые tasks запускать отдельными threads без ограничения; это сохраняет concurrency budget основного pool
- **C.** Bounded executor и deadlines только на Future.get клиента; внешним операциям deadlines не передавать, поскольку ожидание Future всегда останавливает I/O
- **D.** Bounded ThreadPoolExecutor queue, явный rejection и deadlines/cancellation операции

**2. Как проверить cleanup и восстановление?**

- **A.** Future.cancel(true) на timeout, сразу вернуть success cleanup без join; interrupt гарантирует мгновенное освобождение любых connection resources
- **B.** Нагрузочный тест только до overload, метрики active и average CPU; отсутствие crash доказывает восстановление очереди после снятия нагрузки
- **C.** Close connection только в успешной ветви, исключения логировать; bounded queue предотвращает resource leaks независимо от cleanup path
- **D.** try-with-resources, метрики active/queued/rejected, тест overload→снятие нагрузки→drain

Материалы: [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Основание уровня: Нужно обеспечить управляемую деградацию при перегрузке.

### Lead — Конкурентный контракт двух SDK

ID: `research-mc:java-go:Lead` · открытая пара: `research:java-go:Lead`

Java/Go batch SDK: максимум 8 операций; ошибка элемента не отменяет остальные. При отмене дочерние операции должны завершиться за 2s.

**1. Какой trace выявит SDK, возвращающий до остановки дочерних операций?**

- **A.** Cancel при blocked request, проверить только время возврата batch≤2s; outstanding work не учитывать, быстрый возврат равен успешному завершению
- **B.** После cancel ждать один произвольный child, остальные завершатся кооперативно; отсутствие одного error доказывает drain всех операций
- **C.** Cancel во время blocked request, track outstanding и проверить ноль после возврата в пределах 2s
- **D.** Cancel перед запуском batch и сравнить result count; эта трасса доказывает остановку уже активных requests в течение2s без child tracking

**2. Как согласовать два SDK?**

- **A.** Общий ordering/deadline, но item error отменяет всех siblings; изоляция ошибок несущественна, если SDK возвращает error list
- **B.** Ordering и isolated errors одинаковы, Go ждёт workers, Java возвращает сразу после future.cancel; обе реализации имеют одинаковый cancellation contract
- **C.** Общий ordering/error/deadline contract; context/workers в Go, bounded executor/futures в Java
- **D.** Одинаковые API names и max8, ошибки выдавать в completion order; callers сами восстановят input ordering, это не часть общего contract

Материалы: [ex-java](https://exercism.org/tracks/java/exercises), [ex-go](https://exercism.org/tracks/go/exercises), [mit-algorithms](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/pages/assignments/).

Основание уровня: Нужно проверить одинаковые гарантийные свойства двух реализаций.

## Android/Kotlin и iOS/Swift

### Стажёр — Android: восстановление счётчика

ID: `research-mc:mobile-native:Intern` · открытая пара: `research:mobile-native:Intern`

Android Kotlin: счётчик теряется при повороте и пересоздании процесса; состояние маленькое.

**1. Что покрывает поворот и допустимое восстановление после process recreation?**

- **A.** Большой bitmap в SavedStateHandle
- **B.** ViewModel плюс SavedStateHandle для малого состояния
- **C.** Только локальная переменная Activity
- **D.** Только ViewModel без сохранения для process recreation

**2. Что выбрать для гарантированного длительного хранения после закрытия приложения?**

- **A.** Durable store; saved state не считать постоянной БД
- **B.** Только ViewModel
- **C.** Только remember без saveable
- **D.** Сохранить ссылку на Activity в singleton

Материалы: [android](https://developer.android.com/courses/android-basics-compose/course), [ios](https://developer.apple.com/tutorials/swiftui).

Основание уровня: Нужно правильно выбрать слой хранения для двух lifecycle событий.

### Junior — Swift: состояние редактирования

ID: `research-mc:mobile-native:Junior` · открытая пара: `research:mobile-native:Junior`

SwiftUI редактор получает копию value-type записи. Save не обновляет список, Cancel должен оставить canonical без изменений.

**1. Какая модель поддерживает такой Cancel?**

- **A.** Новый случайный id на каждый render
- **B.** Обновлять только копию и не сообщать владельцу списка
- **C.** Локальный draft, callback Save обновляет canonical по стабильному id
- **D.** Все изменения напрямую в canonical Binding без буфера

**2. Какой тест проверяет ownership?**

- **A.** Проверить только текст редактора во время ввода
- **B.** Проверить только число строк после Save
- **C.** Сравнить screenshots без сценария Cancel
- **D.** Изменить draft→Cancel: список старый; повторить→Save: обновлён только нужный id

Материалы: [ios](https://developer.apple.com/tutorials/swiftui), [android](https://developer.android.com/courses/android-basics-compose/course).

Основание уровня: Нужно реализовать контракт владельца состояния и отмены.

### Middle — Android: offline outbox

ID: `research-mc:mobile-native:Middle` · открытая пара: `research:mobile-native:Middle`

Kotlin offline-заявка: сервер сохранил, ответ потерялся, WorkManager повторил. Нужны Room outbox и восстановление после process death.

**1. Что предотвращает вторую заявку?**

- **A.** Только boolean sent в памяти
- **B.** Считать любой timeout окончательной неудачей и создавать новую заявку
- **C.** Stable client operation ID, server uniqueness/payload check и durable outbox
- **D.** Новый UUID при каждом запуске Worker

**2. Когда писать заявку и outbox?**

- **A.** Сначала network send, затем локальная запись
- **B.** Заявку сейчас, outbox только после первой ошибки
- **C.** Outbox в памяти Worker, заявку в Room
- **D.** В одной локальной транзакции до network send

Материалы: [android](https://developer.android.com/courses/android-basics-compose/course), [ios](https://developer.apple.com/tutorials/swiftui).

Основание уровня: Нужно спроектировать протокол между durable local state и сервером.

### Senior — iOS: отмена и применение ответа

ID: `research-mc:mobile-native:Senior` · открытая пара: `research:mobile-native:Senior`

Swift async экран запросил A, затем B; A отвечает позже. Экран может исчезнуть до ответа.

**1. Что защищает UI commit?**

- **A.** Revision guard после await без screen lifetime и MainActor contract; callback после исчезновения экрана всегда безопасен, если entity совпадает
- **B.** MainActor, проверка revision/entity после await и lifetime cancellation
- **C.** MainActor для всех UI writes и Task.cancel старого запроса; любой уже готовый callback может commit, actor isolation автоматически делает его актуальным
- **D.** Actor repository и revision check до await; после await проверку не повторять, потому что actor не допускает смену выбранной карточки в ожидании

**2. Какой тест проверяет актуальность?**

- **A.** Проверить только successful HTTP status
- **B.** Проверить только наличие @MainActor annotation
- **C.** B завершить раньше A; затем late A и исчезновение экрана не меняют UI
- **D.** A завершить раньше B без исчезновения экрана

Материалы: [ios](https://developer.apple.com/tutorials/swiftui), [android](https://developer.android.com/courses/android-basics-compose/course).

Основание уровня: Взаимодействуют actor isolation, отмена и жизненный цикл экрана.

### Lead — Миграция локальной схемы

ID: `research-mc:mobile-native:Lead` · открытая пара: `research:mobile-native:Lead`

Android/iOS offline schema меняется. Старые clients живут 6 месяцев, outbox содержит старые неотправленные тексты.

**1. Как сохранить неотправленные операции при миграции?**

- **A.** Одна version для local schema/server DTO, server old adapter убрать после первого нового app release; все offline clients обновляются при reconnect
- **B.** Версии payload и stable IDs, но pending outbox удалять при migration для чистого recovery; текст в draft позволяет восстановить все операции без дублей
- **C.** Транзакционная local migration, stable operation IDs, версии schema и wire payload отдельно
- **D.** Transactional schema migration и сохранение текста, operation IDs заново генерировать для new wire payload; retry новой версии не относится к старой записи

**2. Что включить в rollout gate?**

- **A.** Upgrade всех supported versions на empty outbox, без interrupted migration; atomic write гарантирует recovery всех внешних операций
- **B.** Test old payload adapter в API отдельно, local recovery и operation IDs не проверять; одинаковый server JSON достаточен для end-to-end совместимости
- **C.** Upgrade paths с pending ops, power/process interruption, old payload adapters и recovery
- **D.** Clean install новых iOS/Android и successful sync, migration paths с pending outbox считать эквивалентными пустой БД после schema update

Материалы: [android](https://developer.android.com/courses/android-basics-compose/course), [ios](https://developer.apple.com/tutorials/swiftui).

Основание уровня: Нужно обеспечить долгую совместимость и отказоустойчивую миграцию двух платформ.

## Flutter/Dart и React Native

### Стажёр — Flutter: состояния запроса

ID: `research-mc:mobile-cross:Intern` · открытая пара: `research:mobile-cross:Intern`

Flutter Future&lt;List&lt;Item>> должен показывать loading,empty,data,error и Retry; запрос не должен повторяться при каждом build.

**1. Где создавать Future?**

- **A.** Внутри каждого build перед FutureBuilder
- **B.** В getter, вызываемом при каждом render
- **C.** В конструкторе каждой строки списка
- **D.** initState/контролируемый Retry event, хранить между build

**2. Как обработать успешный [] и Retry после ошибки?**

- **A.** []→empty; Retry создаёт новую operation и loading
- **B.** []→error; Retry повторно читает уже завершённый Future
- **C.** []→вечный loading; Retry вызывает setState без новой операции
- **D.** []→data с одной пустой строкой; Retry закрывает экран

Материалы: [flutter](https://docs.flutter.dev/reference/learning-resources), [react-native](https://reactnative.dev/docs/tutorial), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно собрать компонент с полным lifecycle запроса.

### Junior — React Native: редактируемый список

ID: `research-mc:mobile-cross:Junior` · открытая пара: `research:mobile-cross:Junior`

React Native FlatList: 5000 TextInput-строк, index key и локальный draft. После скролла текст пропадает.

**1. Как сохранить draft при виртуализации?**

- **A.** Локальный state каждого item и index key
- **B.** Отключить все rerenders и мутировать props
- **C.** Хранить draft только в native TextInput value без модели
- **D.** Map drafts по id вне item; keyExtractor по id

**2. Как обновить одну строку без перемещения её identity?**

- **A.** Immutable update нужного id и стабильные keys
- **B.** Пересоздать всем строкам random keys
- **C.** Sort по тексту draft после каждого ввода и оставить index keys
- **D.** Мутировать массив без уведомления FlatList

Материалы: [flutter](https://docs.flutter.dev/reference/learning-resources), [react-native](https://reactnative.dev/docs/tutorial), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно учесть идентичность и virtualized lifecycle.

### Middle — Dart: debounce и dispose

ID: `research-mc:mobile-cross:Middle` · открытая пара: `research:mobile-cross:Middle`

Dart HTTP поиск нельзя физически отменить. Нужны debounce, latest-only и отсутствие setState после dispose.

**1. Какие guards необходимы?**

- **A.** Cleanup Timer, revision и mounted перед commit; dispose инвалидирует запрос
- **B.** Только Timer.cancel() после старта HTTP
- **C.** Только сравнение response status
- **D.** Только mounted без проверки revision

**2. Два Completer завершаются B затем A. Что проверить?**

- **A.** Оба результата объединяются независимо от поиска
- **B.** A применяется, если ответ HTTP 200
- **C.** Результат B остаётся; после dispose ни один late callback не делает setState
- **D.** Последний сетевой ответ A должен победить

Материалы: [flutter](https://docs.flutter.dev/reference/learning-resources), [react-native](https://reactnative.dev/docs/tutorial), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно доказать корректность при неотменяемом асинхронном запросе.

### Senior — React Native: поток событий

ID: `research-mc:mobile-cross:Senior` · открытая пара: `research:mobile-cross:Senior`

Native module: 2000 sensor events/s, JS график 60fps; очередь растёт до 700MB. Alarm-события терять нельзя.

**1. Какая политика ограничивает память и сохраняет alarms?**

- **A.** Native batching/downsampling обычных данных, bounded ring, отдельный durable alarm channel
- **B.** Bounded ring для всех events, drop oldest при перегрузке включая alarms; durable alert summary раз в минуту заменяет каждый individual alarm
- **C.** Batch обычные events и alarms вместе, без верхнего queue bound в background; foreground60fps гарантирует последующий drain и ограничение RAM
- **D.** Downsample только в JS после bridge, upstream очередь не ограничивать; уменьшение числа render calls автоматически ограничивает native backlog

**2. Как проверить порядок после background?**

- **A.** Согласованный source timestamp/sequence, lifecycle replay tests и memory bound под нагрузкой
- **B.** Sort по JS receipt wall-clock после resume, timestamp source отбросить; этот порядок точно восстанавливает исходную последовательность измерений
- **C.** Проверить source timestamps только foreground и FPS60; background replay не влияет на memory/order contract при native batching
- **D.** Сохранить source sequence, но после background сбросить queue и alarms; отсутствие backlog доказывает выполнение требований сохранности событий

Материалы: [flutter](https://docs.flutter.dev/reference/learning-resources), [react-native](https://reactnative.dev/docs/tutorial), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно спроектировать управление потоком через платформенную границу.

### Lead — Выбор общей мобильной архитектуры

ID: `research-mc:mobile-cross:Lead` · открытая пара: `research:mobile-cross:Lead`

Flutter и React Native используют общий offline API, push и sync. Переписать оба клиента одновременно нельзя.

**1. Что мигрировать независимо от UI framework?**

- **A.** Stable operation IDs и outbox только Flutter, React Native использует random keys; одинаковая API schema достаточна для единого sync contract
- **B.** Version DTO и conflict protocol, outbox хранить только в JS/Dart memory; framework state restoration гарантирует recovery после process death
- **C.** Operation protocol: IDs, versions, conflicts, outbox и adapters
- **D.** UI migration обоих frameworks до operation versioning; одинаковые screens устраняют различия offline retries и push delivery автоматически

**2. Какой пилот проверяет совместимость?**

- **A.** Одинаковые failure fixtures в обоих клиентах: lost response, restart, old payload, conflict
- **B.** Одинаковые screenshots и successful sync, lost response проверить только server unit test; native lifecycle не влияет на retry operation identity
- **C.** Failure fixtures обоих clients только new payload, pending old operations не включать; rollback UI автоматически возвращает старую wire совместимость
- **D.** Повторить restart и conflict, но каждый retry с новым key; сравнить лишь итоговый UI текст, не persisted effects и server operation count

Материалы: [flutter](https://docs.flutter.dev/reference/learning-resources), [react-native](https://reactnative.dev/docs/tutorial), [fullstack](https://fullstackopen.com/en/).

Основание уровня: Нужно выбрать проверяемую границу общей архитектуры и путь миграции.

## Pandas и NumPy: подготовка данных

### Стажёр — Группы и пропуски

ID: `research-mc:dataframes:Intern` · открытая пара: `research:dataframes:Intern`

Pandas: city=[A,A,B,B], amount=[10,None,0,20]. Нужны sum, число строк и число непустых amount; all-missing сумма должна быть NaN.

**1. Каков результат (sum,size,count) для A и B?**

- **A.** A=(10,2,2), B=(20,2,2)
- **B.** A=(NaN,2,1), B=(20,2,1)
- **C.** A=(10,2,1), B=(20,2,2)
- **D.** A=(10,1,1), B=(20,1,2)

**2. Как сохранить NaN для полностью пропущенной группы?**

- **A.** dropna перед groupby и size
- **B.** sum(min_count=1), size и count отдельно
- **C.** fillna(0), затем sum и count
- **D.** sum() без min_count всегда сохраняет NaN

Материалы: [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/), [numpy](https://numpy.org/numpy-tutorials/).

Основание уровня: Нужно реализовать агрегат с несколькими семантиками пропуска.

### Junior — Broadcasting нормализации

ID: `research-mc:dataframes:Junior` · открытая пара: `research:dataframes:Junior`

NumPy X.shape=(4,3). Стандартизация по столбцам; один столбец постоянный, возможны NaN.

**1. Какой shape среднего корректен для broadcasting?**

- **A.** (4,1), axis=1
- **B.** Скаляр среднего всех 12 элементов
- **C.** (3,) или (1,3), axis=0
- **D.** (4,), axis=1

**2. Как обработать std=0 и NaN?**

- **A.** Всегда делить на std без проверки
- **B.** Заменить любой NaN единицей и считать результат стандартным
- **C.** Пересчитать std по строкам, чтобы избежать нулевого столбца
- **D.** Явная политика constant/NaN; например constant→0, остальные по выбранной ddof

Материалы: [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/), [numpy](https://numpy.org/numpy-tutorials/).

Основание уровня: Нужно проверить векторизованный расчёт и граничные данные.

### Middle — Дубли в join справочника

ID: `research-mc:dataframes:Middle` · открытая пара: `research:dataframes:Middle`

Pandas merge facts 1 млн orders со справочником истории customer segment увеличил amount sum на 12%.

**1. Что проверить первым?**

- **A.** Multiplicity ключей и match count по order_id; временную валидность segment на момент order
- **B.** Округлить amount до merge
- **C.** Удалить все дубли customer_id без правила выбора
- **D.** Уменьшить amount каждой строки на 12%

**2. Какой invariant нужен для correct as-of join?**

- **A.** Для каждого customer выбрать самый новый segment для всех исторических orders
- **B.** Разрешить два overlap interval match и усреднить сумму
- **C.** Сверить только число уникальных customer_id
- **D.** Для каждого order ровно один допустимый interval match либо явный unmatched; сумма/число facts сохраняются

Материалы: [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/), [numpy](https://numpy.org/numpy-tutorials/).

Основание уровня: Нужно восстановить временной контракт данных и доказать корректность соединения.

### Senior — Данные не помещаются в RAM

ID: `research-mc:dataframes:Senior` · открытая пара: `research:dataframes:Senior`

CSV 120 ГБ, RAM 4 ГБ, 80 млн пользователей; агрегаты по (day,user_id). Chunks читаются, но итоговый dict растёт.

**1. Что ограничивает память результата?**

- **A.** Преобразовать все user_id в category и сохранить весь dictionary в RAM без оценки cardinality; categorical dtype всегда занимает меньше любой partitioning схемы
- **B.** Hash partition только по day, не учитывать hot day и размер user groups; один день любого размера гарантированно помещается в4GB
- **C.** Hash partition/external sort по полному group key, bounded per-partition aggregation
- **D.** Очень маленькие chunks и один global aggregate dict на80млн users; chunk RAM bound автоматически распространяется на итоговую cardinality состояния

**2. Что проверять при слиянии частичных агрегатов?**

- **A.** Только одинаковое число файлов
- **B.** Только отсутствие MemoryError
- **C.** Среднее частичных средних без весов
- **D.** Counts/sums против baseline, одинаковые key semantics и отсутствие numeric overflow

Материалы: [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/), [numpy](https://numpy.org/numpy-tutorials/).

Основание уровня: Требуются внешний алгоритм, оценка памяти и проверка типов.

### Lead — Контракт подготовки признаков

ID: `research-mc:dataframes:Lead` · открытая пара: `research:dataframes:Lead`

Три команды расходятся в timezone суток, null policy и dtype признака. Daily input 300 ГБ; обучение/inference нужно воспроизвести через год.

**1. Какой контракт сохраняет смысл?**

- **A.** Версии schema/timezone/null/rounding/cutoff, transformation artifact и lineage
- **B.** Сохранить Git commit transform и текущий input path, timezone брать local default среды; одинаковый код гарантирует одинаковые суточные границы через год
- **C.** Schema versions и lineage, missing values в inference заменять0, в training NaN; различие engines допустимо, если feature name одинаковый
- **D.** Golden dataset только типичных чисел, версии cutoff/timezone не хранить; floating tolerance можно применить к category и date semantics

**2. Где допустим численный tolerance при сравнениях Pandas/NumPy/Spark?**

- **A.** В согласованных floating operations; категории, null и границы суток проверяются точно
- **B.** Разрешить один день timezone расхождения и совпадение monthly average; категориальные значения сравнить после произвольного кодирования числами
- **C.** Считать null эквивалентным0 и empty string во всех engines, иначе test слишком строгий; floating sum проверять только по округлённому total
- **D.** Сравнивать все columns единым relative tolerance, включая IDs и даты; небольшая numeric разница не может менять семантику join или cutoff

Материалы: [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/), [numpy](https://numpy.org/numpy-tutorials/).

Основание уровня: Нужно обеспечить долгую воспроизводимость нескольких реализаций.

## Машинное обучение и scikit-learn

### Стажёр — Метрики редкого класса

ID: `research-mc:classical-ml:Intern` · открытая пара: `research:classical-ml:Intern`

1000 объектов, 20 positive; модель выбрала 25 positive, из них 15 верных. Пропуск positive дорог.

**1. Каковы TP,FP,FN,TN и precision/recall?**

- **A.** 15,10,5,975; 60%/75%
- **B.** 15,10,5,970; 60%/75%
- **C.** 15,5,10,970; 75%/60%
- **D.** 25,0,5,970; 100%/83.3%

**2. Почему accuracy 98.5% недостаточно для решения?**

- **A.** Always-negative имеет accuracy 0%
- **B.** При редком positive precision автоматически 100%
- **C.** Always-negative даёт 98% и recall 0; нужны cost/recall и false-positive tradeoff
- **D.** Accuracy 98.5% означает recall 98.5%

Материалы: [sklearn](https://scikit-learn.org/stable/auto_examples/index.html), [yandex-ml](https://education.yandex.ru/handbook/ml), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/).

Основание уровня: Нужно рассчитать и интерпретировать несколько метрик.

### Junior — Pipeline без утечки

ID: `research-mc:classical-ml:Junior` · открытая пара: `research:classical-ml:Junior`

StandardScaler fit_transform на всех данных, затем split и LogisticRegression; есть missing values и поиск C через CV.

**1. Как устранить leakage при CV?**

- **A.** Fit scaler на test, чтобы train/test имели общий масштаб
- **B.** Передать уже full-data scaled матрицу в Pipeline без preprocessing
- **C.** Pipeline(imputer,scaler,classifier) внутри GridSearchCV только на train
- **D.** Fit imputer/scaler на полном наборе, CV только classifier

**2. Когда использовать final holdout?**

- **A.** После каждого C, выбрать лучший по holdout
- **B.** Для fit imputer, но не classifier
- **C.** Для остановки поиска после первого высокого accuracy
- **D.** Один раз после выбора C и всех процедур на train

Материалы: [sklearn-leakage](https://scikit-learn.org/stable/common_pitfalls.html), [sklearn](https://scikit-learn.org/stable/auto_examples/index.html), [yandex-ml](https://education.yandex.ru/handbook/ml), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/).

Основание уровня: Нужно исправить утечку в полном процессе подбора.

### Middle — Предсказание для новых организаций

ID: `research-mc:classical-ml:Middle` · открытая пара: `research:classical-ml:Middle`

100000 строк от 400 организаций. Deployment на новые организации. Random split ROC-AUC .94; GroupKFold .72.

**1. Какая оценка ближе к deployment задаче?**

- **A.** Group-disjoint validation/holdout с fold-local preprocessing
- **B.** Random split, потому что больше независимых строк
- **C.** Лучшее из .94 и .72 без изменения протокола
- **D.** Split по строкам после удаления target

**2. Как оценивать CI и проверить organization_id?**

- **A.** Удалить организации с низким AUC
- **B.** Считать разницу .22 доказательством ошибки GroupKFold
- **C.** Bootstrap организаций, ablation ID и контракт неизвестной организации
- **D.** Bootstrap отдельных строк и сохранить raw ID без проверки

Материалы: [sklearn](https://scikit-learn.org/stable/auto_examples/index.html), [yandex-ml](https://education.yandex.ru/handbook/ml), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/).

Основание уровня: Нужно проектировать оценку generalization при зависимых данных.

### Senior — Порог после смены базовой частоты

ID: `research-mc:classical-ml:Senior` · открытая пара: `research:classical-ml:Senior`

Calibrated posterior при prevalence=.2 переносится в среду .02. Предполагается неизменное p(x\|y), цена FN=50, FP=1.

**1. Как преобразовать odds?**

- **A.** Оставить posterior прежним, меняется только accuracy
- **B.** Новые odds=старые odds·0.081633
- **C.** Новая вероятность=старая вероятность·0.1
- **D.** Новые odds=старые odds·10

**2. Какой threshold применять при данных ценах?**

- **A.** p_new>0.5 независимо от costs
- **B.** p_new>1/51, с проверкой prior-shift/calibration
- **C.** p_old>1/51 без correction
- **D.** p_new>50/51

Материалы: [sklearn-threshold](https://scikit-learn.org/stable/modules/classification_threshold.html), [sklearn](https://scikit-learn.org/stable/auto_examples/index.html), [yandex-ml](https://education.yandex.ru/handbook/ml), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/).

Основание уровня: Требуется вывести вероятностное преобразование и решение по стоимости.

### Lead — Допуск модели к дорогому решению

ID: `research-mc:classical-ml:Lead` · открытая пара: `research:classical-ml:Lead`

Risk model: средний loss ниже на 4%; мало новых клиентов, income drift, labels созревают 90 дней, изменилась политика выдачи.

**1. Как отделить качество предсказаний от новой политики?**

- **A.** Сравнить loss до/после на выданных кредитах, policy mix не учитывать; mature labels и temporal split сами устраняют selection bias новой выдачи
- **B.** Shadow на всех applicants, затем объявить причинный+4% policy эффект по predictions; отсутствие реальных новых outcomes не ограничивает такой вывод
- **C.** Использовать только cohorts с labels раньше90дней и stratify по income; быстрое созревание является случайным и не требует проверки selection
- **D.** Mature temporal cohorts, policy-aware оценка и контролируемое сравнение policy при допустимых условиях

**2. Что должно быть в release gate?**

- **A.** Temporal mature validation и segment checks, fallback убрать после первого дня;90-day labels delay не влияет на post-release outcome monitoring
- **B.** Best train AUC и calibration старого prevalence, thresholds оставить прежними; policy change учитывать только в marketing dashboard
- **C.** Segment uncertainty, calibration/cost, maturity horizon, canary guardrails и fallback
- **D.** Overall loss−4%, drift monitor и canary по uptime; редкие новые сегменты допустить без uncertainty, aggregate автоматически покрывает их риск

Материалы: [sklearn](https://scikit-learn.org/stable/auto_examples/index.html), [yandex-ml](https://education.yandex.ru/handbook/ml), [mit-statistics](https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/pages/assignments/).

Основание уровня: Нужно согласовать статистическую валидность и эксплуатационное решение.

## PyTorch и TensorFlow: обучение и inference

### Стажёр — TensorFlow: формы и loss

ID: `research-mc:deep-learning:Intern` · открытая пара: `research:deep-learning:Intern`

TensorFlow binary logits shape (8,1), labels (8,). Нужны согласованные формы и BinaryCrossentropy.

**1. Какая конфигурация корректна?**

- **A.** Labels broadcast на (8,8) для совпадения shapes
- **B.** Согласовать shapes; logits прямо в BCE(from_logits=True)
- **C.** Sigmoid(logits) в BCE(from_logits=True)
- **D.** Logits в BCE(from_logits=False)

**2. Для logits [-2,2] какие классы при probability threshold .5?**

- **A.** [1,1], поскольку BCE положительна
- **B.** [0,0], поскольку logits не probabilities
- **C.** [0,1], поскольку порог logits 0
- **D.** [0,1], поскольку порог logits .5 эквивалентен .5 вероятности

Материалы: [tensorflow](https://www.tensorflow.org/tutorials), [pytorch](https://docs.pytorch.org/tutorials/), [yandex-ml](https://education.yandex.ru/handbook/ml).

Основание уровня: Нужно связать tensor contract и математическую семантику loss.

### Junior — PyTorch: шаг обучения

ID: `research-mc:deep-learning:Junior` · открытая пара: `research:deep-learning:Junior`

PyTorch training step; evaluation без dropout/autograd. Последний batch меньше остальных.

**1. Какой порядок training и режим evaluation?**

- **A.** forward→backward→zero_grad→step; train для evaluation
- **B.** zero_grad→forward→backward→step; eval плюс no_grad/inference_mode
- **C.** forward→step→backward; только no_grad выключает dropout
- **D.** zero_grad→backward→forward→step; eval выключает autograd

**2. Batch sizes 4 и 1, mean losses 1 и 3. Какова средняя loss по примерам?**

- **A.** 4
- **B.** 0.8
- **C.** 1.4
- **D.** 2

Материалы: [pytorch](https://docs.pytorch.org/tutorials/), [tensorflow](https://www.tensorflow.org/tutorials), [yandex-ml](https://education.yandex.ru/handbook/ml).

Основание уровня: Нужно реализовать полный шаг и корректную метрику эпохи.

### Middle — Маска последовательностей

ID: `research-mc:deep-learning:Middle` · открытая пара: `research:deep-learning:Middle`

PyTorch logits (B,T,V), targets (B,T), padding_id=0. Разные длины, есть пустая sequence.

**1. Как считать token-weighted loss?**

- **A.** Mean CE по всем B·T, включая padding
- **B.** Сначала mean по каждой sequence, включая пустые, затем mean
- **C.** Считать padding правильным классом с нулевой loss, оставить denominator B·T
- **D.** Masked sum per-token CE / число valid tokens; отдельный контракт all-empty batch

**2. У sequence 1 два tokens с суммой loss 2, у sequence 2 восемь с суммой 16. Token-/sequence-weighted means?**

- **A.** 1.8 и 1.5
- **B.** 1.5 и 1.8
- **C.** 2 и 2
- **D.** 1.8 и 1.8

Материалы: [pytorch](https://docs.pytorch.org/tutorials/), [tensorflow](https://www.tensorflow.org/tutorials), [yandex-ml](https://education.yandex.ru/handbook/ml).

Основание уровня: Нужно реализовать loss с неодинаковой длиной и вырожденными данными.

### Senior — Паритет экспорта модели

ID: `research-mc:deep-learning:Senior` · открытая пара: `research:deep-learning:Senior`

PyTorch→TensorFlow inference: top-1 различается на 3%. Подозреваются layout, resize, dtype и batch norm mode.

**1. Как локализовать расхождение?**

- **A.** Golden inputs, одинаковый preprocessing/eval, сравнение промежуточных tensors по слоям
- **B.** Сравнить top-1 на одинаковых inputs, сразу увеличить global tolerance до совпадения; промежуточные tensors и preprocessing mode не фиксировать
- **C.** Golden raw inputs и layer checks, resize/layout в engines оставить default; одинаковые weights гарантируют одинаковую семантику preprocessing
- **D.** Переобучить TensorFlow модель на том же dataset и сравнить accuracy, batch norm mode не закреплять; это локализует ошибку export конкретного слоя

**2. Малая logit ошибка меняет top-1 только при малом margin. Как интерпретировать?**

- **A.** Проверить disagreement по margin и допуски; это возможно без крупной семантической ошибки
- **B.** Игнорировать все label disagreements при малом max logit error; margin и downstream error cost не меняют достаточность численного tolerance
- **C.** Любой top-1 disagreement считать доказательством channel permutation, даже если layer tensors близки; margin никогда не влияет на выбор класса
- **D.** Сравнить только mean logit по batch и total accuracy; совпадение двух агрегатов доказывает одинаковый preprocessing и individual predictions

Материалы: [pytorch](https://docs.pytorch.org/tutorials/), [tensorflow](https://www.tensorflow.org/tutorials), [yandex-ml](https://education.yandex.ru/handbook/ml).

Основание уровня: Нужно диагностировать расхождение нескольких реализаций численного контракта.

### Lead — Serving с лимитом памяти

ID: `research-mc:deep-learning:Lead` · открытая пара: `research:deep-learning:Lead`

Embedding model 6 ГБ, GPU 16 ГБ, длины 10…4000 tokens. Concurrency=8 даёт OOM; p99≤300ms.

**1. Как управлять batches и admission?**

- **A.** Фиксировать concurrency8 и batch8 по request count, поскольку6GB weights оставляют10GB; token lengths не влияют на activation memory
- **B.** Token-budget batching и bounded queue, deadlines считать только после dequeue; очередь не входит в p99≤300ms API результата
- **C.** Length buckets и retry любого OOM без admission/rejection, queue unbounded; средний GPU utilization определяет гарантированный tail latency
- **D.** Profile по shapes, token-budget/length buckets, bounded queue/deadlines и explicit rejection

**2. Как честно сравнить serving engines?**

- **A.** Сравнить engines при разных concurrency, выбрать минимальную average latency; memory/errors не учитывать, если weights одинакового размера
- **B.** Benchmark коротких warm requests, затем экстраполировать p99 на4000tokens; admission profile и реальный length mix не требуются
- **C.** Одинаковая нагрузка/length mix; end-to-end p99, throughput, errors/rejections и memory
- **D.** Одинаковый length mix, но исключить timeouts/rejections и queue wait; p99 успешного GPU execution достаточен для заявленного end-to-end SLO

Материалы: [pytorch](https://docs.pytorch.org/tutorials/), [tensorflow](https://www.tensorflow.org/tutorials), [yandex-ml](https://education.yandex.ru/handbook/ml).

Основание уровня: Нужно принять платформенное решение по воспроизводимым ресурсным измерениям.

## Excel, Power BI и Tableau

### Стажёр — Excel: взвешенная доля

ID: `research-mc:business-intelligence:Intern` · открытая пара: `research:business-intelligence:Intern`

Excel: A — 10 покупок/20 визитов, B — 90/980. Нужна общая conversion.

**1. Какой расчёт верен?**

- **A.** 50%−90/980≈40.82%
- **B.** SUM(purchases)/SUM(visits)=10%
- **C.** (50%+90/980)/2≈29.59%
- **D.** SUM(purchases)/2=50%

**2. При нулевом общем знаменателе и purchases>visits что делать?**

- **A.** Возвращать 100% при denominator=0
- **B.** Всегда clamp в [0,1], скрывая проблему
- **C.** Заменять denominator на 1 без отдельного статуса
- **D.** Явный missing/error для denominator=0; validation несогласованных counts

Материалы: [excel](https://support.microsoft.com/en-us/excel/), [powerbi](https://learn.microsoft.com/en-us/training/powerplatform/power-bi), [tableau](https://www.tableau.com/learn/training).

Основание уровня: Нужно вычислить и защитить аналитический показатель.

### Junior — Power BI: модель фактов

ID: `research-mc:business-intelligence:Junior` · открытая пара: `research:business-intelligence:Junior`

Power BI: sales(order_id,date_id,product_id,amount), products(product_id,category), calendar(date_id,month).

**1. Какая star schema и measure поддерживают фильтры?**

- **A.** Many-to-many все таблицы, measure COUNT(sales)
- **B.** Связи только между dimensions, без sales
- **C.** SUM(products[product_id]) как выручка
- **D.** Unique dimensions 1→many facts, обычно single direction; SUM(sales[amount])

**2. Дубликат product_id в dimension означает что?**

- **A.** Нарушен ключ стороны 1; требуется исправление модели/данных
- **B.** Корректную dimension историю без дополнительного temporal contract
- **C.** Нужно автоматически включить bidirectional и считать проблему решённой
- **D.** Выручка гарантированно не меняется в любой модели

Материалы: [powerbi](https://learn.microsoft.com/en-us/training/powerplatform/power-bi), [excel](https://support.microsoft.com/en-us/excel/), [tableau](https://www.tableau.com/learn/training).

Основание уровня: Нужно построить модель, меру и проверку кардинальности.

### Middle — Tableau: фильтр и фиксированный знаменатель

ID: `research-mc:business-intelligence:Middle` · открытая пара: `research:business-intelligence:Middle`

Tableau: выбранный месяц, категории с revenue 30 и 70. Нужно долю выбранной категории от всех категорий месяца.

**1. Какой denominator и filter scope дают 30%?**

- **A.** FIXED по месяцу с month в scope/context; category не исключает denominator
- **B.** Обычный SUM после category filter, denominator тоже 30
- **C.** FIXED grand total за все месяцы без month filter
- **D.** SUM revenue выбранной категории / число категорий

**2. Почему 100% после фильтра категории — ошибка данной метрики?**

- **A.** FIXED всегда игнорирует все filters
- **B.** Данные 30 и 70 невозможно агрегировать в Tableau
- **C.** Category filter ограничил и numerator, и denominator
- **D.** Выручка категории выросла до всей рыночной выручки

Материалы: [tableau](https://www.tableau.com/learn/training), [excel](https://support.microsoft.com/en-us/excel/), [powerbi](https://learn.microsoft.com/en-us/training/powerplatform/power-bi).

Основание уровня: Требуется понять вычислительную область и порядок фильтрации.

### Senior — Одна метрика в трёх отчётах

ID: `research-mc:business-intelligence:Senior` · открытая пара: `research:business-intelligence:Senior`

Excel, Power BI, Tableau расходятся в monthly revenue. SQL timestamps UTC, refunds отрицательны, события запаздывают.

**1. Что фиксировать в общем контракте?**

- **A.** Единый SQL query текст, timezone и cutoff получать из локальных настроек Excel/Power BI/Tableau; идентичный SQL гарантирует состав месяца
- **B.** Согласовать округление monthly totals, late events включать только по current ingest date; historical period semantics и FX source не сохранять
- **C.** Timezone/period, currency/FX, refunds, cutoff и semantic version
- **D.** Единая timezone и currency, refunds всегда исключить из одного отчёта и включить в другом; одинаковый display month задаёт согласованную revenue метрику

**2. Месячные суммы совпали. Что ещё проверять?**

- **A.** Только цвет диаграммы
- **B.** Только число колонок отчёта
- **C.** Counts и ID состава, суммы по дням/срезам; компенсирующие ошибки возможны
- **D.** Больше ничего, совпадение суммы доказывает эквивалентность

Материалы: [powerbi](https://learn.microsoft.com/en-us/training/powerplatform/power-bi), [excel](https://support.microsoft.com/en-us/excel/), [tableau](https://www.tableau.com/learn/training).

Основание уровня: Нужно найти семантические расхождения нескольких аналитических систем.

### Lead — Управляемая аналитическая модель

ID: `research-mc:business-intelligence:Lead` · открытая пара: `research:business-intelligence:Lead`

40 отчётов имеют разные active user. Новый semantic contract нужен с сохранением старых quarterly отчётов и row-level access.

**1. Как сохранять историческую семантику?**

- **A.** Version definitions сохранить, но source access и data snapshots брать только текущие; прошлые результаты всегда воспроизводятся на новых данных
- **B.** Versioned definitions/snapshots и lineage; certification привязана к версии
- **C.** Все quarterly отчёты пересчитать по новому active rule и сохранить прежние названия; одинаковый total важнее исторической версии определения
- **D.** Хранить старые screenshots и текущий semantic SQL без входных snapshots; изображения обеспечивают полный reproducible lineage всех агрегатов

**2. Как проверить новый access filter?**

- **A.** Сверить общий total administrator до/после RLS, отдельные authorised cohorts не нужны; сумма доказывает сохранение разрешённого состава
- **B.** Проверить positive access одной роли, negative tenant fixtures не выполнять; RLS автоматически исключает все cross-tenant варианты
- **C.** Снять access filters на время сверки и объявить authorised aggregates доказанными; итоговую permission policy проверить только по UI visibility
- **D.** Golden authorised cohorts, compare IDs/aggregates разрешённых slices и negative access fixtures

Материалы: [powerbi](https://learn.microsoft.com/en-us/training/powerplatform/power-bi), [excel](https://support.microsoft.com/en-us/excel/), [tableau](https://www.tableau.com/learn/training).

Основание уровня: Нужно обеспечить governance с конкретными техническими гарантиями.

## Spark и Airflow: пакетные данные

### Стажёр — Spark: фильтр и агрегат

ID: `research-mc:batch-pipelines:Intern` · открытая пара: `research:batch-pipelines:Intern`

Spark: суммы paid amount по customer_id, NULL policy явная, запись в Parquet по date.

**1. Как выполнить без переноса всего результата в driver?**

- **A.** Только объявить transformations, они сразу сохранят Parquet
- **B.** filter→groupBy/sum→distributed write; write является action
- **C.** collect→Python dict→запись на driver
- **D.** map всех строк в local list до groupBy

**2. Почему небольшой входной batch не гарантирует безопасность collect?**

- **A.** Collect выполняется только на executors
- **B.** Размер driver RAM не относится к результатам запросов
- **C.** Итоговая cardinality/размер output может превысить driver RAM
- **D.** Collect автоматически пишет всё на диск без RAM

Материалы: [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [airflow](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html), [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/).

Основание уровня: Нужно составить распределённое преобразование и объяснить выполнение.

### Junior — Airflow: повторяемая дата

ID: `research-mc:batch-pipelines:Junior` · открытая пара: `research:batch-pipelines:Junior`

Airflow daily partition task упал после половины загрузки. Retry/backfill должны заменить тот же logical interval без дублей.

**1. Какой publish protocol подходит?**

- **A.** Append половины повторно на каждый retry
- **B.** Удалить всю таблицу до чтения данных
- **C.** Записывать напрямую и считать task success после первого файла
- **D.** Staging по run/interval, validation и atomic replace/commit partition

**2. Что брать для даты и XCom?**

- **A.** Data interval из run context; XCom содержит ссылки/counts
- **B.** datetime.now(); XCom содержит весь DataFrame
- **C.** Сегодняшнюю дату для любого backfill; XCom raw bytes
- **D.** Дату первого retry; XCom все CSV строки

Материалы: [airflow](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/).

Основание уровня: Нужно спроектировать идемпотентность и временной контракт DAG.

### Middle — Spark: тяжёлый ключ join

ID: `research-mc:batch-pipelines:Middle` · открытая пара: `research:batch-pipelines:Middle`

Spark join 2 ТБ fact и 30 ГБ dimension; hot key занимает 35% fact. Broadcast невозможен, один reducer 70 минут, прочие 5.

**1. Какая оптимизация соответствует skew?**

- **A.** Broadcast всех 30 ГБ на каждый executor
- **B.** Случайно удалить часть hot-key строк
- **C.** Увеличить partitions, оставив один и тот же hot key без расщепления
- **D.** Hot-key split/salting big side с корректной replication нужного dimension subset

**2. Как проверить отсутствие размножения после salting?**

- **A.** Только число executors
- **B.** Counts и суммы по facts/keys против baseline; ровно ожидаемая match cardinality
- **C.** Только время job стало меньше
- **D.** Только сумма distinct amount

Материалы: [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [airflow](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html), [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/).

Основание уровня: Нужно менять распределённый алгоритм с доказательством эквивалентности.

### Senior — Late data и backfill

ID: `research-mc:batch-pipelines:Senior` · открытая пара: `research:batch-pipelines:Senior`

Витрина пересчитывает последние 7 дней, late events до 30 дней и ретро-справочник. Нужны reproducible monthly close и свежий corrected view.

**1. Какая модель покрывает обе цели?**

- **A.** Отбрасывать все events старше7дней и ретро-справочник, без изменения бизнес-контракта; исходный close считается точным только благодаря фиксированному окну
- **B.** Immutable close snapshot и отдельная corrected projection с версиями inputs
- **C.** Один corrected mutable view с30-day window, monthly close автоматически пересчитывать последней версией; это сохраняет историческую воспроизводимость
- **D.** Immutable close и corrected view, но source dimension брать latest без version; закреплённый fact snapshot достаточен для воспроизведения любого join

**2. Как публиковать backfill и откатывать?**

- **A.** Build полный snapshot, удалить предыдущий до validation и switch; при ошибке rollback заново читает mutable sources без pinning versions
- **B.** Полный version manifest/partition validation, затем atomic pointer switch; rollback на полный snapshot
- **C.** Manifest version и validation каждой partition отдельно; pointer переключать после первой готовой, остальные добавлять по мере окончания backfill
- **D.** Перезаписать старые partitions in place, после failure восстановить только counts; rollback сохраняет согласованность без старого полного snapshot

Материалы: [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [airflow](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html), [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/).

Основание уровня: Нужно согласовать временные контракты и отказоустойчивую публикацию.

### Lead — Общий протокол data products

ID: `research-mc:batch-pipelines:Lead` · открытая пара: `research:batch-pipelines:Lead`

10 DAG публикуют зависимые витрины в разное время. SLA 06:00, backfill год, upstream может отказать.

**1. Как consumer выбирает согласованный срез?**

- **A.** Фиксировать cutoff, разрешать смешанные dependency versions без совместимости; временной cutoff сам доказывает семантический join контракт
- **B.** Pin manifest bundle с immutable snapshot IDs и dependency versions
- **C.** Потребитель берёт latest каждой таблицы с близким publish timestamp; dependency snapshots не нужны, если все jobs прошли в одной календарной дате
- **D.** Manifest фиксирует IDs только terminal витрин, upstream versions заменяются latest; одинаковые row counts гарантируют consistent bundle

**2. Что делать при отсутствующем upstream к SLA?**

- **A.** Block весь daily pipeline на годовой backfill без resource quotas; правильный historical run всегда гарантирует текущийSLA06:00
- **B.** Заменить failed upstream пустым snapshot без failure marker и разрешить downstream; counts могут уменьшиться, но bundle остаётся достоверно свежим
- **C.** Явный stale/failure статус; не публиковать несовместимый bundle; resource admission для backfill
- **D.** К06:00 публиковать готовые новые tables с любыми старыми upstream и статусом fresh; соблюдение SLA важнее явного consistency режима

Материалы: [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [airflow](https://airflow.apache.org/docs/apache-airflow/stable/tutorial/index.html), [pandas](https://pandas.pydata.org/docs/getting_started/intro_tutorials/).

Основание уровня: Нужно построить проверяемые межpipeline гарантии и режим восстановления.

## Kafka и потоковая обработка

### Стажёр — Порядок событий по ключу

ID: `research-mc:streaming:Intern` · открытая пара: `research:streaming:Intern`

Kafka topic имеет 3 partitions. События заказа producer отправляет без key, нужен порядок по заказу.

**1. Какой ключ и область порядка?**

- **A.** Order ID при стабильном partitioning; порядок внутри partition
- **B.** Случайный UUID события; общий порядок topic
- **C.** Timestamp события; общий порядок consumer group
- **D.** Любой key; Kafka гарантирует общий порядок всех partitions

**2. Что даёт consumer group?**

- **A.** Гарантию неизменной partition при любом изменении их количества
- **B.** Распределение partitions между consumers, без общего порядка partitions
- **C.** Автоматическую сортировку всех событий по timestamp
- **D.** Отдельную полную копию topic каждому member

Материалы: [kafka](https://kafka.apache.org/quickstart/), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно применить модель партиционирования к предметному порядку.

### Junior — Commit после записи

ID: `research-mc:streaming:Junior` · открытая пара: `research:streaming:Junior`

Consumer пишет event в PostgreSQL, затем offset. Сбой после SQL commit до offset commit.

**1. Что случится и как обработать?**

- **A.** Событие потеряется обязательно
- **B.** Kafka автоматически откатит PostgreSQL commit
- **C.** Нужно новый event_id на replay
- **D.** Replay; event_id UNIQUE с payload policy в SQL предотвращает повторный эффект

**2. Почему offset до SQL опасен?**

- **A.** Он всегда создаёт два SQL эффекта
- **B.** Он делает PostgreSQL участником Kafka transaction автоматически
- **C.** Он гарантирует exactly-once внешний эффект
- **D.** Сбой между commits оставит offset без SQL эффекта, событие пропущено

Материалы: [kafka](https://kafka.apache.org/quickstart/), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно разобрать два отказных сценария и обеспечить идемпотентность.

### Middle — Event-time окна

ID: `research-mc:streaming:Middle` · открытая пара: `research:streaming:Middle`

Покупки с event_time/ingest_time, lateness до 10 минут. Окна 5 минут, preliminary/final суммы. Event 12:04 приходит в 12:11.

**1. В какое окно относится событие?**

- **A.** В следующее незакрытое окно независимо от event_time
- **B.** [12:00,12:05) по event_time
- **C.** [12:10,12:15) по ingest_time
- **D.** [12:05,12:10) по округлению прихода

**2. Что означает watermark и ограничивает состояние?**

- **A.** Текущие wall-clock часы всегда гарантируют отсутствие поздних событий
- **B.** Watermark автоматически хранит все окна бесконечно
- **C.** Finality определяется первым событием следующего окна
- **D.** Оценка event-time progress с lateness/retention policy; после finality явный correction/drop/side output

Материалы: [kafka](https://kafka.apache.org/quickstart/), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно определить временную семантику результата и поздних данных.

### Senior — CDC и удаление

ID: `research-mc:streaming:Senior` · открытая пара: `research:streaming:Senior`

CDC replay: delete version=12, затем старый upsert version=11. Ранее sink воскресил строку.

**1. Как применять события?**

- **A.** Применять только newer versions пока строка существует; после delete убрать last version, чтобы bootstrap мог повторно создать строку
- **B.** Только более новые версии; сохранить tombstone v12 и отклонить upsert v11
- **C.** Version check для upserts, deletes не хранить после apply; поздний upsert на отсутствующий key применять независимо от прежней delete version
- **D.** Сохранять tombstones, но при replay ordering использовать ingest timestamp; более поздняя доставка upsert означает более свежую бизнес-версию

**2. Одинаковая version, разные payload. Что делать?**

- **A.** Merge поля двух payload произвольно, сохранить прежнюю version; это детерминированно восстановит исходное единичное событие без дополнительного evidence
- **B.** Зафиксировать конфликт/нарушение контракта, не выбирать молча
- **C.** Считать одинаковую version гарантированным дублем, игнорировать отличие payload и не регистрировать нарушение producer contract
- **D.** Выбирать payload с более поздним ingest_time и переписывать same-version state; network ordering всегда разрешает conflicting logical identity

Материалы: [kafka](https://kafka.apache.org/quickstart/), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно доказать консистентность при нескольких режимах доставки.

### Lead — Сквозная гарантия доставки

ID: `research-mc:streaming:Lead` · открытая пара: `research:streaming:Lead`

Kafka transactions обновляют витрину; внешний HTTP notification endpoint не имеет idempotency/status. Требование: ровно одно уведомление.

**1. После timeout после возможного HTTP эффекта какую гарантию можно доказать?**

- **A.** Durable outbox и retry доHTTP200: timeout всегда означает отсутствие эффекта, поэтому внешние дубли невозможны при at-least-once попытках
- **B.** Commit offset доHTTP и никогда не retry uncertain: это даёт exactly-one notification, поскольку повтор устранён независимо от возможной потери
- **C.** Exactly-one внешний эффект недостижим при данных средствах: retry может дублировать, отказ от retry терять
- **D.** Kafka transaction с offset, sink update и outbox гарантирует exactly-one HTTP notification, даже если внешний endpoint не распознаёт operation IDs

**2. Какое изменение контракта помогает разрешить uncertain?**

- **A.** Stable key только в локальной outbox, provider игнорирует его и не даёт status; локальный уникальный ключ уже разрешает lost-response ambiguity
- **B.** Provider receipts без привязки к operation identity, новый key на retry; сверка общего числа уведомлений гарантирует отсутствие individual duplicates
- **C.** Увеличить timeout и хранить outbox до отправки всех TCP bytes, после удалить; успешная транспортная запись доказывает единственный внешний эффект
- **D.** Stable operation key, provider receipts/status и durable outbox/reconciliation

Материалы: [kafka](https://kafka.apache.org/quickstart/), [spark](https://spark.apache.org/docs/latest/sql-getting-started.html), [postgres](https://www.postgresql.org/docs/current/tutorial.html).

Основание уровня: Нужно обосновать предел гарантий и изменить архитектурный контракт.

## Linux и диагностика сети

### Стажёр — Права рабочего файла

ID: `research-mc:systems-networking:Intern` · открытая пара: `research:systems-networking:Intern`

Linux config mode=0640, owner app:ops. Worker состоит в ops; monitor должен получить только чтение без доступа остальных.

**1. Какие права у worker по указанному mode?**

- **A.** Чтение и запись; нет исполнения
- **B.** Только исполнение
- **C.** Нет доступа, поскольку он не owner
- **D.** Чтение; нет записи и исполнения

**2. Как дать только чтение monitor минимально?**

- **A.** chmod 0644
- **B.** chmod 0660 и добавить monitor в ops
- **C.** chmod 0777
- **D.** User ACL read для monitor либо контролируемая группа с нужной политикой

Материалы: [linux](https://missing.csail.mit.edu/), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Основание уровня: Нужно применить модель прав к конкретным пользователям.

### Junior — DNS или TCP

ID: `research-mc:systems-networking:Junior` · открытая пара: `research:systems-networking:Junior`

DNS A=10.0.0.8, ping проходит. TCP SYN на 443 повторяется без SYN-ACK.

**1. Какой вывод допустим?**

- **A.** Приложение точно вернуло HTTP 500
- **B.** TLS сертификат точно просрочен
- **C.** Ping доказывает доступность TCP 443
- **D.** DNS разрешён; TCP handshake не завершён, проверять route/filter/listener и обе стороны

**2. Чем TCP RST отличается от описанного timeout?**

- **A.** Есть явный reachable reject/reset; timeout сам не различает drop и отсутствие ответа
- **B.** RST означает успешный TLS handshake
- **C.** RST и отсутствие SYN-ACK всегда одна и та же причина
- **D.** Timeout доказывает закрытый listener на сервере

Материалы: [linux](https://missing.csail.mit.edu/), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Основание уровня: Нужно выстроить диагностическую последовательность по наблюдениям.

### Middle — Файл удалён, диск полон

ID: `research-mc:systems-networking:Middle` · открытая пара: `research:systems-networking:Middle`

df показывает 100%, du 30%. Приложение удалило log, но продолжает писать в открытый FD.

**1. Что проверить и как освободить место?**

- **A.** Удалить больше имён в каталоге log, открытые FD не важны
- **B.** Truncate все FD процесса, включая БД
- **C.** Перемонтировать filesystem без диагностики
- **D.** lsof +L1/proc FD; согласованный reopen или restart владельца log

**2. Почему после рестарта проблема может вернуться?**

- **A.** Reopen навсегда отключает запись log
- **B.** Ротация без reopen/лимита и прежняя скорость log не исправлены
- **C.** df всегда ошибается после удаления любого файла
- **D.** du учитывает все удалённые открытые файлы

Материалы: [linux](https://missing.csail.mit.edu/), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Основание уровня: Нужно диагностировать состояние ядра и восстановить ресурс безопасно.

### Senior — TCP retransmission и p99

ID: `research-mc:systems-networking:Senior` · открытая пара: `research:systems-networking:Senior`

После увеличения MTU некоторые клиенты не работают, есть retransmits/duplicate ACK, p99 растёт, CPU 30%.

**1. Как проверить PMTU гипотезу?**

- **A.** Проверить packet loss только по одному client capture и увеличить TCP timeout; MTU изменение влияет на latency, но не на доступность отдельных путей
- **B.** Сравнить MSS на server и сделать rollback без сохранения одинаковой нагрузки; совпадение CPU30% до/после доказывает сетевую причинность
- **C.** Проверить только TLS сертификаты и CPU, поскольку успешный маленький ping исключает PMTU black hole для любых packet sizes и client маршрутов
- **D.** MSS/ICMP PTB/fragmentation, sequence ranges с обеих сторон и контролируемый MTU rollback

**2. Почему одного capture недостаточно для вывода о реальной потере?**

- **A.** Если CPU30%, любой retransmit является Wireshark артефактом; дополнительные captures и retransmission metrics для affected clients не нужны
- **B.** Один capture и его timestamp достаточны: packet arrival order всегда совпадает с order на wire, даже при hardware offload и пропущенных frames
- **C.** Capture loss/offload artefacts могут имитировать симптомы; нужны парные наблюдения
- **D.** Duplicate ACK в одном capture однозначно локализует network loss на сервере; capture drops и offload не меняют видимость TCP sequence ranges

Материалы: [linux](https://missing.csail.mit.edu/), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Основание уровня: Требуется причинная диагностика сетевого и прикладного поведения.

### Lead — Надёжность сетевого пути

ID: `research-mc:systems-networking:Lead` · открытая пара: `research:systems-networking:Lead`

Два региона делят DNS provider и VPN. Предлагают третий для 99.95% доступности.

**1. Какую часть риска третий регион сам не устраняет?**

- **A.** Третий регион делает DNS и VPN failures независимыми автоматически, потому что все compute VM находятся на разных физических площадках
- **B.** Общий DNS остаётся риском, общий VPN больше не влияет на journey после добавления VM, даже если routing всех регионов по-прежнему проходит через него
- **C.** Любой локальный power outage одновременно выключит все три региона, но общий control plane не влияет на доступность уже запущенных клиентских маршрутов
- **D.** Общие DNS/control-plane/VPN failure modes

**2. Какой failover тест подтверждает реальный контракт?**

- **A.** Тест полного выключения одного региона и ping другого, без DNS/cache/partial split; успешный ping доказывает99.95% customer journey availability
- **B.** Fault injection DNS без real client cache, считать TTL точной верхней границей failover для всех resolvers и не проверять authority при split
- **C.** Проверить uptime VM и один synthetic route, failover объявить автоматическим; общие dependencies и partial partition не входят в availability model
- **D.** Fault injection DNS/routes/partial split, TTL/cache convergence, authority policy и journey availability

Материалы: [linux](https://missing.csail.mit.edu/), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Основание уровня: Нужно обосновать архитектурное решение через отказные зависимости.

## Docker и Kubernetes

### Стажёр — Контейнер и данные

ID: `research-mc:containers:Intern` · открытая пара: `research:containers:Intern`

Docker uploads в /app/uploads исчезают после удаления контейнера; uploads и secrets не должны попасть в image.

**1. Как сохранить файлы при пересоздании?**

- **A.** Записывать только в writable layer контейнера
- **B.** Добавить EXPOSE /app/uploads
- **C.** Mount named/bind volume на /app/uploads и повторно использовать его
- **D.** Скопировать uploads в Dockerfile при каждом build

**2. Как ограничить build context?**

- **A.** Добавить секрет в ENV image вместо файла
- **B.** Скрыть файлы префиксом точки без .dockerignore
- **C.** .dockerignore для uploads/secrets и Dockerfile без их копирования
- **D.** Удалить volume перед build

Материалы: [docker](https://docs.docker.com/get-started/tutorials/run-an-app/), [kubernetes](https://kubernetes.io/docs/tasks/).

Основание уровня: Нужно реализовать durable хранение и проверить lifecycle контейнера.

### Junior — Readiness и restart loop

ID: `research-mc:containers:Junior` · открытая пара: `research:containers:Junior`

Kubernetes startup 90s, liveness начинается на 10s, pods restart. Общая БД иногда недоступна.

**1. Как разделить probes?**

- **A.** Readiness делает restart, liveness включает traffic
- **B.** Все probes одинаково проверяют общую БД каждую секунду
- **C.** Увеличить replicas, не меняя probes
- **D.** Startup budget≥реальный старт; readiness управляет traffic; liveness выявляет локальное зависание

**2. Почему общая DB outage не всегда должна проваливать liveness?**

- **A.** Liveness failure никогда не перезапускает pod
- **B.** DB outage всегда означает локальную deadlock
- **C.** Startup probe автоматически чинит внешнюю БД
- **D.** Массовые restart не исправляют БД и могут усилить сбой; readiness policy отдельно

Материалы: [kubernetes](https://kubernetes.io/docs/tasks/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Основание уровня: Нужно согласовать три разных health контракта.

### Middle — OOM и CPU throttling

ID: `research-mc:containers:Middle` · открытая пара: `research:containers:Middle`

Pod request=100m/256Mi, limit=500m/512Mi. Burst throttling и OOMKilled, хотя node имеет 8 ГБ свободно.

**1. Почему свободная память node не исключает OOM?**

- **A.** Node свободная память всегда делает OOM ложным событием
- **B.** Cgroup limit pod/container ограничивает память независимо от свободной node RAM
- **C.** Request 256Mi запрещает использовать больше 256Mi
- **D.** CPU limit 500m напрямую задаёт RAM 512Mi

**2. Как проверить изменение resources?**

- **A.** Working set/allocations/throttle metrics и same-load latency/errors, bounded concurrency
- **B.** Повысить request без измерений и считать CPU limit снятым
- **C.** Повысить replicas, сохранив общий memory leak без наблюдения
- **D.** Снять limits без оценки node contention

Материалы: [kubernetes](https://kubernetes.io/docs/tasks/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Основание уровня: Нужно анализировать разные ресурсные ограничения и их последствия.

### Senior — Drain stateful workloads

ID: `research-mc:containers:Senior` · открытая пара: `research:containers:Senior`

Три replicas, PDB minAvailable=2, одна уже not ready. Нужно drain node с worker local WAL.

**1. Что может произойти с voluntary eviction?**

- **A.** PDB позволит eviction, поскольку всего desired replicas3 и minAvailable2; readiness текущей третьей replica не влияет на число разрешённых disruptions
- **B.** PDB сам запустит недостающую replica и перенесёт local WAL перед drain; дополнительная replication/fencing подготовка не требуется
- **C.** Force delete сохраняет смысл PDB и graceful handoff, поскольку Kubernetes обязательно ждёт durable flush любого локального процесса перед удалением
- **D.** Будет блокироваться, пока не восстановлена достаточная availability

**2. Какое условие нужно перед безопасным переносом worker?**

- **A.** Durable/replicated WAL, graceful handoff и fencing; PDB не гарантирует защиту от node crash
- **B.** Readiness restore и PDB достаточно для WAL durability, node crash является involuntary, но PDB всё равно гарантирует сохранность pending операций
- **C.** Реплицировать WAL, но не fencing старого worker; после partial node outage два владельца безопасны, если оба имеют одинаковый log на момент drain
- **D.** Graceful termination с fixed sleep, local WAL удалить после eviction; новый pod восстанавливает state автоматически из Deployment spec без external data

Материалы: [kubernetes](https://kubernetes.io/docs/tasks/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Основание уровня: Нужно обеспечить последовательность обслуживания с состоянием и ограничением доступности.

### Lead — Платформа нескольких арендаторов

ID: `research-mc:containers:Lead` · открытая пара: `research:containers:Lead`

20 команд в shared cluster, burst job вытесняет API. Нужны isolation, supply-chain controls и измеримый SLO.

**1. Какую границу обеспечивают namespaces сами по себе?**

- **A.** Namespace и ResourceQuota гарантируют disk/network latency API; supply-chain доверие автоматически следует из размещения image в том же cluster
- **B.** RBAC внутри namespace ограничивает все runtime parser/network effects, поэтому egress policy, admission и workload resource isolation не нужны
- **C.** Логическую область; нужны RBAC/network/resource/admission controls для требуемой изоляции
- **D.** Namespaces являются полной security/resource boundary; RBAC нужен только для удобства пользователей, network policies и node isolation избыточны

**2. Как проверить достаточность shared cluster?**

- **A.** Проверить CPU contention, остальные shared resources и threat requirements исключить; отдельная граница никогда не нужна при наличии namespaces
- **B.** Noisy-neighbor CPU/memory/disk/network tests и threat requirements; при превышении controls усилить границу
- **C.** ResourceQuota manifests и низкий average CPU доказывают isolation; одновременную disk/network нагрузку измерять отдельно от customer latency не требуется
- **D.** Запустить burst job на пустом cluster, подтвердить её memory bound и считать это доказательством отсутствия noisy-neighbor при20командах

Материалы: [kubernetes](https://kubernetes.io/docs/tasks/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Основание уровня: Нужно выбрать и проверить несколько уровней изоляции общей платформы.

## Terraform и Ansible

### Стажёр — Ansible: повторяемый каталог

ID: `research-mc:infrastructure:Intern` · открытая пара: `research:infrastructure:Intern`

Ansible должен создать /srv/app app:app mode 0750, поставить template config и перезапустить службу только при изменении.

**1. Какой подход идемпотентен?**

- **A.** copy config и unconditional service restart
- **B.** Изменять timestamp config на каждом run
- **C.** file/template modules с mode, notify handler при изменении
- **D.** shell mkdir/chmod/restart без условий в каждом запуске

**2. Что проверяют два одинаковых запуска и изменение template?**

- **A.** Перезапуск никогда не должен происходить даже после изменения
- **B.** Второй без changed; после изменения handler один раз
- **C.** Второй обязан показать changed для доказательства запуска
- **D.** Handler всегда дважды на каждый run

Материалы: [ansible](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html), [terraform](https://developer.hashicorp.com/terraform/tutorials).

Основание уровня: Нужно написать проверяемую конфигурацию с условной реакцией.

### Junior — Terraform: изменение адреса ресурса

ID: `research-mc:infrastructure:Junior` · открытая пара: `research:infrastructure:Junior`

Terraform app_old переименован в app, plan предлагает destroy/create VM, которую нужно сохранить; state remote.

**1. Как сохранить identity?**

- **A.** Применить destroy/create, затем восстановить имя
- **B.** Удалить state и начать заново
- **C.** moved block/state move с locking и backup; проверить no replace plan
- **D.** Только переименовать resource label в HCL

**2. Какой plan допускает продолжение при условии сохранения VM?**

- **A.** Plan с replacement, если display name совпадает
- **B.** Пустой state и create нового ресурса
- **C.** Address move без destroy/create нужной VM и с проверкой прочих изменений
- **D.** Любой plan с тем же provider

Материалы: [terraform](https://developer.hashicorp.com/terraform/tutorials), [ansible](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html).

Основание уровня: Нужно безопасно выполнить эволюцию IaC identity.

### Middle — Разделение config и provisioning

ID: `research-mc:infrastructure:Middle` · открытая пара: `research:infrastructure:Middle`

Terraform VM/security group, Ansible сервис. Secret попадает в state, два operators запускают apply, есть emergency manual drift.

**1. Какой контроль решает concurrency и secret exposure?**

- **A.** Remote locking, scoped/encrypted state, secret refs где возможно и безопасный provisioning pipeline
- **B.** Только sensitive=true, оно удаляет secret из state
- **C.** Локальные state каждого operator без общей блокировки
- **D.** Общий state file без access restrictions

**2. Как реагировать на обнаруженный emergency drift?**

- **A.** Reviewed reconcile/import/config update с владельцем изменения до apply
- **B.** Автоматически перезаписать любую ручную правку без просмотра plan
- **C.** Удалить resource из state, оставив unmanaged навсегда
- **D.** Считать plan ошибочным, поскольку ресурс существует

Материалы: [terraform](https://developer.hashicorp.com/terraform/tutorials), [ansible](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html).

Основание уровня: Нужно согласовать безопасность и управление состоянием двух инструментов.

### Senior — Частичный apply

ID: `research-mc:infrastructure:Senior` · открытая пара: `research:infrastructure:Senior`

Terraform создал сеть и две VM, третья упала; Ansible изменил одну VM. Ресурс мог создаться без записи в state.

**1. Что делать с потенциальным orphan resource?**

- **A.** Повторить apply, Terraform обнаружит любой real resource с тем же display name даже без state record и автоматически сохранит его identity
- **B.** Удалить весь partial stack и state, затем повторить apply; это единственный idempotent recovery, сохранность двух рабочих VM обеспечена provider names
- **C.** Внести предполагаемый ID в state вручную без проверки provider identity, затем skip plan; существование похожего ресурса достаточно для безопасного import
- **D.** Сверить реальную identity, восстановить/import state и проверить plan перед повтором

**2. Как повторить pipeline без разрушения исправных узлов?**

- **A.** Продолжить только последний упавший task без проверки версий configuration; idempotency одного модуля доказывает согласованность всех stages
- **B.** Idempotent stages, versioned config и health-gated rollout; явные rollback boundaries
- **C.** Повторить весь pipeline без reconciliation и health gates; успешный Terraform автоматически откатывает частичные изменения Ansible предыдущего запуска
- **D.** Вернуть Git version Ansible и уничтожить сеть перед повтором, старые working VM сохранятся независимо от network dependencies и provider lifecycle

Материалы: [terraform](https://developer.hashicorp.com/terraform/tutorials), [ansible](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html).

Основание уровня: Нужно восстановить несколько частичных состояний разных систем.

### Lead — Изменение IaC модулей

ID: `research-mc:infrastructure:Lead` · открытая пара: `research:infrastructure:Lead`

30 окружений: Terraform/Ansible v2 меняют subnet layout и secrets format. Доступны два пилота одновременно, outage≤5min.

**1. Что должно быть в плане миграции?**

- **A.** Explicit state mappings, compatibility secrets, versioned modules/roles и reviewed staged plans
- **B.** Version modules/roles закрепить, state mappings не нужны при одинаковом display name; secrets format v2 сразу применить всем старым consumers
- **C.** Сделать reviewed plans двух пилотов, потом обновить остальные latest без locking; успешный pilot доказывает identity сохранность любого environment
- **D.** Сначала contract старого secrets format, затем migrate network и clients; план rollback по Git SHA автоматически восстанавливает old provider resources

**2. Как оценить возможность rollback после создания новых ресурсов?**

- **A.** Git revert modules/roles достаточно: новые ресурсы и записи state автоматически вернут старые identity даже после confirmed data writes в новой схеме
- **B.** Сохранить old state snapshot, force restore поверх нового без real resource audit; state backup одновременно является backup содержимого новых resources
- **C.** Проверить только VM names и outage длительность, новые data/contracts не рассматривать; одинаковые имена доказывают возможность обратного перехода
- **D.** Проверить новые identity/data/contract constraints и trial rollback на пилоте

Материалы: [terraform](https://developer.hashicorp.com/terraform/tutorials), [ansible](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html).

Основание уровня: Нужно управлять миграцией инфраструктурного контракта многих потребителей.

## Prometheus, SLO и диагностика

### Стажёр — Counter после рестарта

ID: `research-mc:observability:Intern` · открытая пара: `research:observability:Intern`

requests_total:100,140,180,5,35 по минутам, процесс рестартовал. Нужны скорость и число активных запросов.

**1. Какой запрос корректно учитывает reset?**

- **A.** sum(requests_total) как скорость
- **B.** rate(requests_total[5m])
- **C.** requests_total−requests_total offset 5m
- **D.** avg_over_time(requests_total[5m])

**2. Какой тип для текущих активных запросов?**

- **A.** Histogram только числа процессов
- **B.** Summary cumulative total завершённых
- **C.** Gauge, увеличивается/уменьшается
- **D.** Counter, уменьшается при завершении

Материалы: [prometheus](https://prometheus.io/docs/tutorials/getting_started/), [kubernetes](https://kubernetes.io/docs/tasks/).

Основание уровня: Нужно связать вид метрики и корректный запрос.

### Junior — Кардинальность label

ID: `research-mc:observability:Junior` · открытая пара: `research:observability:Junior`

HTTP metrics labels user_id/raw URL дают миллионы series и 20 ГБ RAM.

**1. Какая label политика снижает cardinality?**

- **A.** Route template/status/method; user details в scoped traces/logs
- **B.** Hash user_id и оставить raw URL
- **C.** Сохранить user_id, убрать method
- **D.** Добавить random request_id для dedup series

**2. Как считать общий error rate?**

- **A.** Среднее отдельных rates ошибок без знаменателя
- **B.** sum(error_counter)/число instances
- **C.** sum(rate(request_counter))/sum(rate(error_counter))
- **D.** sum(rate(error_counter[window]))/sum(rate(request_counter[window]))

Материалы: [prometheus](https://prometheus.io/docs/tutorials/getting_started/), [kubernetes](https://kubernetes.io/docs/tasks/).

Основание уровня: Нужно оценить и исправить модель данных наблюдаемости.

### Middle — SLO с бюджетом ошибок

ID: `research-mc:observability:Middle` · открытая пара: `research:observability:Middle`

SLO99.9%, 10 млн requests/30d. Error rate за 2h=2%, за 24h=.2%.

**1. Каковы budget и burn rates?**

- **A.** 10000 errors; 20 и 2
- **B.** 100000 errors; 2 и .2
- **C.** 10000 errors; 2 и .2
- **D.** 1000 errors; 200 и 20

**2. Почему CPU alert не заменяет этот SLO?**

- **A.** CPU сигнал причины; SLI — пользовательские исходы, multi-window burn требует своих thresholds
- **B.** CPU=100% всегда означает ровно .1% ошибок
- **C.** CPU=30% доказывает соблюдение SLO
- **D.** Budget вычисляется только по CPU времени

Материалы: [prometheus](https://prometheus.io/docs/tutorials/getting_started/), [kubernetes](https://kubernetes.io/docs/tasks/).

Основание уровня: Нужно выполнить расчёт и определить измеримый сигнал действия.

### Senior — Перцентили нескольких реплик

ID: `research-mc:observability:Senior` · открытая пара: `research:observability:Senior`

Dashboard усредняет p99 gauges replicas; трафик неодинаков, одна replica p99=2s. SLO boundary250ms.

**1. Как получить агрегированный p99 из классического histogram?**

- **A.** Сложить histogram bucket rates без le grouping и затем взять99% от total rate; cumulative buckets эквивалентны отдельным latency samples
- **B.** histogram_quantile(.99,sum by(le)(rate(duration_bucket[window])))
- **C.** Traffic-weighted average replica p99 gauges: веса requests делают quantile линейным и дают точный общий p99 независимо от распределений latency
- **D.** max(replica_p99) всегда равен общему p99; это учитывает проблемную replica и не зависит от её доли traffic среди всех запросов

**2. Что важно для SLO250ms и диагностики tails?**

- **A.** Summary p99 агрегировать по traffic weights, buckets выбирать далеко от250ms; это даёт такую же точность SLO как индивидуальные request measurements
- **B.** Общий histogram p99 достаточно для всех replicas; per-replica tails не нужны даже при сильно разных traffic weights и user routing
- **C.** Два buckets0ms/10s обеспечивают точный p99 около250ms; quantile estimator восстанавливает любой реальный distribution внутри bucket без данных
- **D.** Buckets около250ms и per-replica analysis; summary quantiles обычно не агрегируются

Материалы: [prometheus](https://prometheus.io/docs/tutorials/getting_started/), [kubernetes](https://kubernetes.io/docs/tasks/).

Основание уровня: Нужно понимать и проверять распределённую статистику latency.

### Lead — Единая модель SLO платформы

ID: `research-mc:observability:Lead` · открытая пара: `research:observability:Lead`

20 сервисов считают 99.9% по разным denominators: исключают timeout/429 либо используют health. Journey проходит три сервиса с retries.

**1. Как задать journey SLI?**

- **A.** Journey SLI как average success трёх сервисов, retries включить как отдельные successes; это точно равно доле успешных customer operations
- **B.** Operation IDs и end-to-end success, но timeout и429 исключить из denominator; overload не является failure, поэтому SLO остаётся пользовательским
- **C.** Умножить service SLO без проверки зависимости и populations; одинаковые названия99.9% гарантируют одинаковый journey denominator
- **D.** Logical operation IDs и end-to-end outcomes; attempts отдельно, exclusions явные

**2. Как проверить denominator и alerts?**

- **A.** Golden traces/replay с timeout,429,retry, версии SLI и burn policy
- **B.** Golden successful journeys и health probes достаточно; retries/timeouts/429 можно не replay, поскольку они исключены текущими сервисными dashboards
- **C.** Сверить общий success count без input operation IDs, versions SLI не хранить; совпадение aggregate гарантирует неизменность denominator
- **D.** Проверить alerts только на CPU и synthetic availability; monitor semantics отдельных сервисов автоматически согласуется после одинакового SLO label

Материалы: [prometheus](https://prometheus.io/docs/tutorials/getting_started/), [kubernetes](https://kubernetes.io/docs/tasks/).

Основание уровня: Нужно обеспечить достоверность общей модели надёжности нескольких сервисов.

## Git и доставка изменений

### Стажёр — Изменения и коммит

ID: `research-mc:delivery-git:Intern` · открытая пара: `research:delivery-git:Intern`

Git: app.py modified, config.yml staged, notes.txt untracked. Commit только app.py, остальные правки сохранить.

**1. Какая последовательность подходит?**

- **A.** git clean -fd; git commit
- **B.** git restore --staged config.yml; git add app.py; inspect staged diff; commit
- **C.** git commit -a
- **D.** git reset --hard; git add app.py

**2. Как проверить состав будущего commit?**

- **A.** Только наличие app.py на диске
- **B.** git diff --cached и git status
- **C.** Только git diff без --cached
- **D.** Только git log до нового commit

Материалы: [git](https://git-scm.com/book/en/v2), [fullstack](https://fullstackopen.com/en/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Основание уровня: Нужно применить модель Git без потери чужих изменений.

### Junior — Конфликт merge и проверка

ID: `research-mc:delivery-git:Junior` · открытая пара: `research:delivery-git:Junior`

Git merge: одна ветка добавила минимальную комиссию, другая rounding. Требуется сохранить оба правила, order не уточнён.

**1. Как разрешать conflict?**

- **A.** Удалить функцию, конфликт исчезнет
- **B.** Согласовать order min/round, объединить изменения и проверить fixtures
- **C.** Выбрать ours полностью без изучения theirs
- **D.** Выбрать theirs полностью без изучения ours

**2. Чего недостаточно для expected результата amount=1.01?**

- **A.** Имени ветки с более свежим commit
- **B.** Цвета conflict markers
- **C.** Числа строк функции после merge
- **D.** Не хватает ставки, min и order/rounding contract; уточнить до численного oracle

Материалы: [git](https://git-scm.com/book/en/v2), [fullstack](https://fullstackopen.com/en/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Основание уровня: Нужно восстановить поведение из двух независимых изменений.

### Middle — Один artifact между средами

ID: `research-mc:delivery-git:Middle` · открытая пара: `research:delivery-git:Middle`

Staging и prod image собирают отдельно из одного commit, floating latest даёт разные зависимости.

**1. Как гарантировать promotion проверенного артефакта?**

- **A.** Build once, pinned deps/base, promote immutable digest с provenance
- **B.** Build twice по одинаковому Git SHA и latest deps
- **C.** Продвигать mutable tag latest без digest
- **D.** Сравнить только image name

**2. Как выбрать rollback image?**

- **A.** Пересобрать старый commit с latest
- **B.** Выбрать любой image с похожим tag
- **C.** Скопировать контейнер writable layer на production
- **D.** Сохранённый approved digest; config version учитывается отдельно

Материалы: [git](https://git-scm.com/book/en/v2), [fullstack](https://fullstackopen.com/en/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Основание уровня: Нужно обеспечить воспроизводимость и трассируемость доставки.

### Senior — Canary с необратимой миграцией

ID: `research-mc:delivery-git:Senior` · открытая пара: `research:delivery-git:Senior`

Canary ухудшил p99/errors; новая версия пишет новый формат, миграция уже удалили колонку старого binary.

**1. Почему rollback только binary может не сработать?**

- **A.** Старая версия несовместима с текущей schema/new data; нужен проверенный recovery/forward fix
- **B.** Вернуть old binary и Git migration file, удалённая колонка с данными восстановится автоматически при следующем старом SELECT без дополнительных recovery
- **C.** Rollback binary всегда безопасен, если image digest сохранён; schema и новые rows не относятся к совместимости артефакта приложения
- **D.** Canary10% гарантирует отсутствие incompatible writes в остальных90%, поэтому deleted schema не влияет на old version rollout ни при каких данных

**2. Какая будущая policy предотвращает такое окно?**

- **A.** Сначала удалить old fields, потом обновлять readers/writers; old binary fixture проверять только на empty DB, чтобы избежать irrelevant historical data
- **B.** Expand schema и canary, сразу contract после первого successful request; наличие активных old consumers не влияет на safe rollback window
- **C.** Проверить compile old/new versions и schema syntax, new rows со старым reader не запускать; совпадение типов доказывает runtime data compatibility
- **D.** Expand, совместимые readers/writers и fixtures новых данных со старой версией; contract после retirement

Материалы: [git](https://git-scm.com/book/en/v2), [fullstack](https://fullstackopen.com/en/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Основание уровня: Нужно оценить реальную обратимость и спроектировать безопасную доставку.

### Lead — Контракт выпуска платформы

ID: `research-mc:delivery-git:Lead` · открытая пара: `research:delivery-git:Lead`

12 сервисов выпускаются независимо, shared event schema ломает downstream; полная integration среда дорогая.

**1. Какие тесты закрывают producer-pass/consumer-fail?**

- **A.** Полный happy-path e2e на одном consumer и без compatibility window; остальные downstream считаются covered одинаковым broker transport
- **B.** Consumer-owned fixtures и двусторонние compatibility checks плюс selective integration
- **C.** Producer serialization fixtures и schema syntax; consumer contract tests лишние, потому что все сообщения соответствуют одной опубликованной JSON schema
- **D.** Consumer-owned fixtures только old producer, new schema проверять отдельно у producer; overlap old/new payload semantics не входит в независимый release

**2. Какой canary signal относится к downstream?**

- **A.** Следить за consumer errors, lag исключить из stop gate; быстрый producer ACK доказывает, что backlog не влияет на customer journey
- **B.** Compatibility window закончить сразу после producer deploy, emergency rollback consumer не учитывать; старые messages исчезают из topic автоматически
- **C.** Consumer lag/errors и outcomes при old/new overlap; emergency plan
- **D.** Producer CPU и successful publish counts достаточно: подтверждение broker означает успешную downstream processing и сохранность consumer outcomes

Материалы: [git](https://git-scm.com/book/en/v2), [fullstack](https://fullstackopen.com/en/), [docker](https://docs.docker.com/get-started/tutorials/run-an-app/).

Основание уровня: Нужно согласовать децентрализованную доставку общей системы.

## QA: дизайн тестов и риск

### Стажёр — Границы возраста

ID: `research-mc:test-design:Intern` · открытая пара: `research:test-design:Intern`

Возраст строго integer18…65 inclusive; empty,fraction,string invalid.

**1. Какие expected для 17,18,65,66?**

- **A.** invalid,valid,valid,invalid
- **B.** valid,valid,valid,invalid
- **C.** invalid,invalid,valid,invalid
- **D.** invalid,valid,invalid,invalid

**2. Что добавить к boundaries и внутреннему 30?**

- **A.** Только negative −100
- **B.** Все invalid типы объединить в один тест значения17
- **C.** Отдельные empty,fraction,string cases с expected invalid
- **D.** Только ещё десять integers20…40

Материалы: [atlassian](https://www.atlassian.com/team-playbook), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro).

Основание уровня: Нужно составить компактный набор, способный найти разные дефекты.

### Junior — Таблица скидок

ID: `research-mc:test-design:Junior` · открытая пара: `research:test-design:Junior`

Premium и сумма≥5000 дают10%; promo даёт15% вместо premium, скидки не складываются. Expiry promo не определён.

**1. Premium=true, amount=5000, активный promo: какая скидка?**

- **A.** 15%
- **B.** 25%
- **C.** 10%
- **D.** 0%

**2. Как получить валидный oracle для expired promo?**

- **A.** Уточнить validity/timezone policy; decision table и 4999/5000 после согласования
- **B.** Всегда считать expired активным без уточнения
- **C.** Всегда применять25%
- **D.** Исключить все promo тесты навсегда

Материалы: [atlassian](https://www.atlassian.com/team-playbook), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro).

Основание уровня: Нужно моделировать взаимодействующие правила и выявить пробел требования.

### Middle — Гонки бронирования

ID: `research-mc:test-design:Middle` · открытая пара: `research:test-design:Middle`

API бронирует последнее место; два concurrent users, один retry после timeout.

**1. Как сделать проверку concurrency детерминированной?**

- **A.** Два запроса с одним account без проверки capacity
- **B.** Барьер controlled launch, стабильные operation keys и DB/side-effect oracle
- **C.** Случайный sleep и сравнение только HTTP200
- **D.** 100 последовательных запросов без overlap

**2. Какой invariant нужен помимо HTTP statuses?**

- **A.** Только отсутствие stack trace
- **B.** Только средняя latency двух запросов
- **C.** Occupancy≤capacity, один эффект на key, payload conflict и согласованные ответы
- **D.** Ровно два HTTP200 при последнем месте

Материалы: [atlassian](https://www.atlassian.com/team-playbook), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro).

Основание уровня: Нужно построить проверку инварианта, наблюдаемого через несколько слоёв.

### Senior — Флак в CI

ID: `research-mc:test-design:Senior` · открытая пара: `research:test-design:Senior`

UI suite:4% first-run failures, retry проходит. Общий account и фиксированный wait2s.

**1. Как разделить product/test race?**

- **A.** Controlled timing и screenshots только последнего retry, первую ошибку не сохранять; успешный повтор является достаточным causality evidence
- **B.** Isolated accounts, controlled timings, trace первой ошибки и condition-based waits
- **C.** Увеличить retries, сравнить только final pass и оставить shared account; это отделяет product race, поскольку повтор использует ту же функциональность
- **D.** Изолировать fixtures и заменить2s на20s без condition/assertion checks; исчезновение reported failures доказывает устранение любого product defect

**2. Как проверить, что исправление не скрыло defect?**

- **A.** First-run failure до/после и чувствительность к injected defect
- **B.** Считать final success после пяти retries единственной метрикой; first-run failure и injected defect не нужны после увеличения timeout
- **C.** First-run failure снизился, поэтому убрать assertions, часто ловившие errors; defect injection делать только в happy path без проверки ожидаемого failure
- **D.** Проверить duration suite до/после и меньше screenshots; скорость тестов автоматически подтверждает сохранность detection sensitivity

Материалы: [atlassian](https://www.atlassian.com/team-playbook), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro).

Основание уровня: Нужно доказать улучшение качества проверки, а не снизить видимость failures.

### Lead — Приёмка критичного выпуска

ID: `research-mc:test-design:Lead` · открытая пара: `research:test-design:Lead`

Платёжная миграция UI/API/reconciliation. Три дня, полная regression пять; нужен обоснованный release plan.

**1. Как приоритизировать?**

- **A.** Только полная visual regression, concurrency/retry tests после release; одинаковый интерфейс означает неизменность денежных инвариантов backend
- **B.** Деньги/idempotency/reconciliation invariants, contract+fault integration и выбранные e2e
- **C.** Равномерная выборка10% тестов всех экранов, без fault fixtures; случайность гарантирует покрытие денег и idempotency независимо от risk distribution
- **D.** Все быстрые unit tests без persisted-effect oracle, e2e только login; совпадение UI success достаточно доказать reconciliation и отсутствие duplicates

**2. Что должно ограничивать rollout?**

- **A.** Назвать все риски covered при80% code coverage и stop по CPU; effect correctness не требует отдельных reconciliation thresholds
- **B.** Следить только за HTTP5xx, duplicate/missing payments могут иметь200; отсутствие5xx достаточно для безопасного расширения rollout
- **C.** Явные residual risks, canary money/mismatch metrics и stop thresholds
- **D.** Release по дедлайну и числу green tests, money/mismatch guardrails добавлять позже; остаточные риски исчезают при canary1% автоматически

Материалы: [atlassian](https://www.atlassian.com/team-playbook), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro).

Основание уровня: Нужно принять обоснованное решение о выпуске по неполной, но проверяемой информации.

## Playwright, Selenium и Postman

### Стажёр — Playwright: ожидание результата

ID: `research-mc:test-automation:Intern` · открытая пара: `research:test-automation:Intern`

Playwright Save, сервер100ms…3s, сообщение «Сохранено»; значение должно сохраниться после reload.

**1. Какой тест имеет проверяемый oracle?**

- **A.** Проверить текст до отправки без reload
- **B.** Role locator click, web-first assertion сообщения, reload и assertion значения
- **C.** waitForTimeout(3000) без assertion
- **D.** Проверить только вызов click

**2. Что обеспечивает устойчивость к разной задержке?**

- **A.** Проверка только HTTP request был начат
- **B.** Condition-based web-first expect с разумным timeout и fresh fixture
- **C.** Ровно sleep100ms для всех запусков
- **D.** Случайный sleep0…3s

Материалы: [playwright](https://playwright.dev/docs/intro), [selenium](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/).

Основание уровня: Нужно написать тест UI и проверить серверное сохранение.

### Junior — Selenium: stale element

ID: `research-mc:test-automation:Junior` · открытая пара: `research:test-automation:Junior`

Selenium строка стала stale после сортировки; клик должен попасть в запись со стабильным ID.

**1. Как повторить поиск безопасно?**

- **A.** Выбрать строку по старому index после сортировки
- **B.** Поймать любой Exception и объявить test passed
- **C.** Bounded WebDriverWait с re-find по record ID и clickable, narrow stale retry
- **D.** Повторять click на старом WebElement бесконечно

**2. Какой oracle выявит клик в чужую строку?**

- **A.** После клика проверить record ID открытой детали/изменённого объекта
- **B.** Только отсутствие StaleElementReferenceException
- **C.** Только число кликов
- **D.** Только длина таблицы

Материалы: [selenium](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/), [playwright](https://playwright.dev/docs/intro), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/).

Основание уровня: Нужно реализовать устойчивое ожидание динамического DOM.

### Middle — Postman: цепочка операции

ID: `research-mc:test-automation:Middle` · открытая пара: `research:test-automation:Middle`

Postman POST order→202 operationId→poll ready/failed. Нужны deadline, cleanup, idempotency tests и redacted report.

**1. Как выполнять poll?**

- **A.** Сохранить operationId, bounded GET status до terminal/deadline; не повторять POST на каждом poll
- **B.** Каждый poll новый POST с новым key
- **C.** GET бесконечно до ready, failed игнорировать
- **D.** Считать202 окончательным созданием готового order

**2. Что проверить отдельным idempotency сценарием?**

- **A.** Разный payload с тем же key должен молча создать новый order
- **B.** Полный token print в collection log для отладки
- **C.** Тот же key/payload→тот же эффект; другой payload→conflict; token не попадает в report
- **D.** Новый key на каждый повтор и только HTTP200

Материалы: [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/), [playwright](https://playwright.dev/docs/intro), [selenium](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/).

Основание уровня: Нужно реализовать многошаговый API тест с собственной state machine.

### Senior — Изоляция параллельного browser suite

ID: `research-mc:test-automation:Senior` · открытая пара: `research:test-automation:Senior`

Playwright/Selenium по16 workers делят account/order; delete ломает edit, cleanup удаляет чужие fixtures.

**1. Как изолировать данные?**

- **A.** Случайные sleeps и retry16 workers на одном fixture; временное разнесение гарантирует отсутствие конфликтов удаления и редактирования
- **B.** Run/worker namespace, ownership и TTL lease; reference data read-only
- **C.** Run namespace в названиях, cleanup удаляет все orders общего account; уникальные names исключают cross-worker destructive interference автоматически
- **D.** Разные accounts, но shared editable order и global teardown; data ownership не требуется, если workers запускаются с разными browser contexts

**2. Как убрать abandoned fixtures после crash?**

- **A.** Teardown упавшего worker гарантированно выполнится, TTL/ownership не нужны; trace correlation можно восстановить по одинаковому account
- **B.** Удалить все записи с test prefix после каждого worker crash, даже свежие; общий prefix является достаточным доказательством abandoned статуса
- **C.** Sweep только expired owned leases с trace/run correlation
- **D.** Crash sweep удаляет любые fixtures старше времени старта текущего run, без owner/lease проверки; parallel active runs не могут иметь такие записи

Материалы: [playwright](https://playwright.dev/docs/intro), [selenium](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/).

Основание уровня: Нужно обеспечить lifecycle и независимость распределённого тестового запуска.

### Lead — Контрактные проверки нескольких клиентов

ID: `research-mc:test-automation:Lead` · открытая пара: `research:test-automation:Lead`

Web,Android,partner API один booking backend; UI suite2h, API5min; breaking change должен обнаруживаться≤15min.

**1. Как уложить содержательную проверку в budget?**

- **A.** Запустить первые15min UI suite и считать непройденные consumer paths покрытыми API schema validation, persisted effect tests необязательны
- **B.** Только HTTP200/response types всех consumers, duplicate booking проверять после релиза; успешный transport доказывает предметный эффект
- **C.** Consumer contracts, быстрые concurrency integration и выбранные critical e2e с behavioral oracle
- **D.** Вынести production booking implementation в expected helper, быстрые API tests сравнят тот же алгоритм; это даёт независимый correctness oracle

**2. Как mutation test проверит double-booking detection?**

- **A.** Изменить visual label booking button и убедиться в snapshot failure; это одновременно доказывает detection денежных/ёмкостных duplicates
- **B.** Инъецировать duplicate allocation и убедиться, что capacity/effect oracle падает
- **C.** Добавить double allocation в test expected helper вместе с production mutation; green результат доказывает согласованность suite и нового поведения
- **D.** Инъецировать duplicate allocation, но проверить лишь HTTP200 и отсутствие crash; mutation sensitivity не требует падения oracle состояния

Материалы: [playwright](https://playwright.dev/docs/intro), [selenium](https://www.selenium.dev/documentation/webdriver/getting_started/first_script/), [postman](https://learning.postman.com/docs/tests-and-scripts/write-scripts/intro-to-scripts/).

Основание уровня: Нужно обосновать качество и скорость общей стратегии автоматизации.

## OWASP, Burp Suite и безопасность приложений

### Стажёр — Параметризованный запрос

ID: `research-mc:application-security:Intern` · открытая пара: `research:application-security:Intern`

Python SQL f-string вставляет login. Учебная локальная БД, login может содержать апостроф.

**1. Какое исправление сохраняет значение и структуру запроса?**

- **A.** Base64 login, затем вставить его через f-string
- **B.** Удалить все спецсимволы login, считая это binding
- **C.** Driver parameter binding для values, без интерполяции login
- **D.** Заменить кавычки вручную и оставить f-string

**2. Если пользователь выбирает имя SQL column, чем его ограничить?**

- **A.** Любой column через f-string после trim
- **B.** Экранировать только один апостроф в имени
- **C.** Allowlist допустимых identifiers; value placeholders не заменяют identifiers
- **D.** Передать имя column как value placeholder и считать запрос тем же

Материалы: [portswigger](https://portswigger.net/web-security/all-labs), [owasp](https://owasp.org/projects/webgoat), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Основание уровня: Нужно исправить уязвимый код и доказать поведение тестом.

### Junior — Доступ к чужому объекту

ID: `research-mc:application-security:Junior` · открытая пара: `research:application-security:Junior`

Учебный invoices/{id} проверяет login, два собственных тестовых accounts видят чужие invoices. Auditor имеет grant только своего tenant.

**1. Что исправляет объектную авторизацию?**

- **A.** Сделать invoice IDs длинными и случайными
- **B.** Скрыть ID в UI, endpoint оставить прежним
- **C.** Проверять только JWT signature
- **D.** Server lookup проверяет tenant/owner/explicit role grant, deny by default

**2. Какой negative test нужен auditor?**

- **A.** Только незалогиненный GET
- **B.** Только существующий invoice id одного account
- **C.** Только изменение цвета запрещённой кнопки
- **D.** Auditor tenant A не читает invoice tenant B; разрешённые grants A читаются

Материалы: [portswigger](https://portswigger.net/web-security/all-labs), [owasp](https://owasp.org/projects/webgoat), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Основание уровня: Нужно проверить предметные права на объект при нескольких ролях.

### Middle — SSRF и redirect

ID: `research-mc:application-security:Middle` · открытая пара: `research:application-security:Middle`

Image fetch разрешает hostname, но следует redirect на private IP; DNS может поменяться между check/connect.

**1. Какой контроль закрывает redirect/DNS gap?**

- **A.** Валидировать каждый actual target, redirects, IPv4/IPv6; pin validated resolution и egress controls
- **B.** Проверить строку hostname только до первого запроса
- **C.** Запретить только127.0.0.1, разрешить все IPv6
- **D.** Resolve один раз для check, независимо resolve снова для connect

**2. Какие limits нужны кроме URL policy?**

- **A.** Schemes, time/bytes/decompression/redirect count и bounded local test endpoints
- **B.** Только response Content-Type
- **C.** Только hostname длина
- **D.** Только максимальная длина URL

Материалы: [portswigger](https://portswigger.net/web-security/all-labs), [owasp](https://owasp.org/projects/webgoat), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Основание уровня: Нужно анализировать несколько способов обхода одной сетевой границы.

### Senior — JWT и ротация ключа

ID: `research-mc:application-security:Senior` · открытая пара: `research:application-security:Senior`

JWT key берётся из непроверенного kid URL, aud не проверяется. Нужна bounded rotation без logout всех.

**1. Как выбирать и проверять signing key?**

- **A.** Allowlist alg и registry, aud не проверять между tenants; signature validity доказывает, что token предназначен любому сервису того же issuer
- **B.** Trusted issuer/key registry, allowlisted alg, kid как ID, iss/aud/exp проверяются
- **C.** Проверить iss/aud/exp, key загрузить по любому token kid URL; корректная подпись загруженным ключом подтверждает доверенный issuer автоматически
- **D.** Trusted key registry и exp, allowed alg брать прямо из token header; известный kid гарантирует безопасность любого signing algorithm

**2. После верной подписи что ещё необходимо для invoice?**

- **A.** Проверка tenant/role/object grant; rotation overlap ограничен expiry/revocation policy
- **B.** Signed token с правильным iss даёт любые invoices всех tenants, object grants не нужны; old keys сохранять бессрочно для отсутствия logout
- **C.** Проверить tenant только из query parameter, не из grants; overlap rotation по времени deploy без expiry/revocation constraints достаточен
- **D.** Object grants проверять только frontend, backend signature является полным authorization proof; kid выбирает tenant без trusted mapping

Материалы: [portswigger](https://portswigger.net/web-security/all-labs), [owasp](https://owasp.org/projects/webgoat), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Основание уровня: Нужно спроектировать trust chain и безопасную эволюцию ключей.

### Lead — Изоляция загружаемого контента

ID: `research-mc:application-security:Lead` · открытая пара: `research:application-security:Lead`

Multi-tenant PDF/images preview и public links. Риски parser exploit, decompression, cross-tenant refs и secrets в log.

**1. Какая processing boundary соответствует угрозам?**

- **A.** Isolated parser и quotas, preview link публиковать до ready по opaque ID; секретность URL заменяет tenant authorization и publication gate
- **B.** Sandbox parser без лишнего network/access, resource quotas, tenant storage ACL и ready publication gate
- **C.** Parser sandbox с полным production secret environment и unrestricted network; resource quotas сами предотвращают exfiltration и cross-tenant reads
- **D.** Storage ACL и MIME check, parser в основном API process без CPU/decompression limits; правильное расширение файла доказывает безопасное исполнение

**2. Что должно блокировать release?**

- **A.** Parser fault fixtures и limits, link revoke/log redaction оставить после release; успешная обработка файлов доказывает incident recovery автоматически
- **B.** Проверить только owner positive access и latest browser rendering; attacker/malformed inputs не относятся к функциональному release gate preview сервиса
- **C.** Negative tenant access, parser/resource fault fixtures, link revoke и redacted logs с recovery evidence
- **D.** Dependency scan и один successful PDF, resource/tenant negative tests не блокируют release; opaque URLs достаточны против cross-tenant доступа

Материалы: [portswigger](https://portswigger.net/web-security/all-labs), [owasp](https://owasp.org/projects/webgoat), [wireshark](https://gaia.cs.umass.edu/kurose_ross/wireshark.php).

Основание уровня: Нужно обосновать и проверить системную модель угроз нескольких компонентов.

## UX/UI: исследование, прототип и проверка

### Стажёр — Ошибка в форме приглашения

ID: `research-mc:ux-design:Intern` · открытая пара: `research:ux-design:Intern`

«Пригласить» disabled без объяснения, пока зарплата пуста. 3 из 5 пользователей не отправили приглашение.

**1. Какое изменение проверяет выявленную проблему?**

- **A.** Разрешить отправку некорректной формы без ошибки
- **B.** Добавить tooltip, доступный только hover мыши
- **C.** Видимая причина/связанная ошибка, понятные состояния и клавиатурный путь
- **D.** Только сделать disabled кнопку ярче без объяснения

**2. Что можно утверждать по 3/5?**

- **A.** Проблемы нет, поскольку выборка мала
- **B.** Есть сигнал проблемы в этих сессиях; точная доля всей аудитории не установлена
- **C.** Ровно60% всей аудитории не отправляют
- **D.** Ошибка статистически доказана для любого сегмента

Материалы: [figma](https://www.figma.com/resource-library/getting-started-in-design/), [figma-projects](https://help.figma.com/hc/en-us/sections/13148624530967), [miro](https://miro.com/templates/), [atlassian](https://www.atlassian.com/team-playbook).

Основание уровня: Нужно создать состояния и связать решение с наблюдением.

### Junior — Интервью без наведения

ID: `research-mc:ux-design:Junior` · открытая пара: `research:ux-design:Junior`

Нужно исследовать прекращение подбора после трёх профилей; интервью20min, заметки в FigJam/Miro.

**1. Как заменить «Вам неудобны наши фильтры?»?**

- **A.** Расскажите о последнем подборе: что делали после просмотра профилей и почему остановились?
- **B.** Какие фильтры больше всего раздражают?
- **C.** Наши фильтры удобные, правда?
- **D.** Вы перестали искать из-за плохих фильтров или карточек?

**2. Как сохранять evidence?**

- **A.** Интервьюировать только пользователей, завершивших подбор
- **B.** Цитаты/наблюдения отдельно от гипотез, отмечать противоречия и включать dropouts в recruitment
- **C.** Записывать только подтверждения гипотезы фильтров
- **D.** Все интерпретации записывать как слова респондента

Материалы: [figma](https://www.figma.com/resource-library/getting-started-in-design/), [figma-projects](https://help.figma.com/hc/en-us/sections/13148624530967), [miro](https://miro.com/templates/), [atlassian](https://www.atlassian.com/team-playbook).

Основание уровня: Нужно спроектировать сбор и структуру качественных данных.

### Middle — Конфликт состояний приглашения

ID: `research-mc:ux-design:Middle` · открытая пара: `research:ux-design:Middle`

Экран работодателя pending, кандидат уже accepted на другом устройстве. Offline UI ещё предлагает «Отозвать».

**1. Какой interaction contract предотвращает ложный успех?**

- **A.** Считать локальный pending неизменным до перезапуска
- **B.** Server version/truth, stale/inflight/conflict состояния; не подтверждать отзыв без результата
- **C.** Всегда показывать «Отозвано» сразу после click независимо от server
- **D.** Убрать version, чтобы избежать conflict

**2. Какой prototype test существенен?**

- **A.** Только цвет disabled кнопки
- **B.** Только клик при мгновенном server success
- **C.** Delayed accepted update→offline revoke→conflict; нет ложного success, доступны recovery actions
- **D.** Только screenshot happy path pending

Материалы: [figma](https://www.figma.com/resource-library/getting-started-in-design/), [figma-projects](https://help.figma.com/hc/en-us/sections/13148624530967), [miro](https://miro.com/templates/), [atlassian](https://www.atlassian.com/team-playbook).

Основание уровня: Нужно спроектировать опыт в условиях неполной актуальности данных.

### Senior — Сравнение двух маршрутов

ID: `research-mc:ux-design:Senior` · открытая пара: `research:ux-design:Senior`

A:60s вместо90s, salary errors8% вместо2%. Малые выборки разного опыта.

**1. Что нужно до выбора победителя?**

- **A.** Сравнить среднее время двух малых несопоставимых выборок, выбирать A при60s; errors и опыт пользователей не влияют на доказательство task success
- **B.** Выбрать B по2% errors, не сравнивать severity/task mix; любые различия recruitment компенсируются измерением процентов вместо абсолютных counts
- **C.** Пересчитать время и errors в единый score с произвольными весами, выбрать максимум без uncertainty и согласованных decision criteria
- **D.** Сопоставимые strata/assignment, task success/error severity/time и uncertainty

**2. Как проверить третье решение с staged confirmation?**

- **A.** Задать decision criteria и протестировать то же task/error/time на сопоставимых пользователях
- **B.** Объявить лучшим по макету без теста
- **C.** Измерить только число экранов
- **D.** Не считать errors, потому что есть confirmation

Материалы: [figma](https://www.figma.com/resource-library/getting-started-in-design/), [figma-projects](https://help.figma.com/hc/en-us/sections/13148624530967), [miro](https://miro.com/templates/), [atlassian](https://www.atlassian.com/team-playbook).

Основание уровня: Нужно спроектировать валидное сравнение при конфликтующих результатах.

### Lead — Система сложных состояний

ID: `research-mc:ux-design:Lead` · открытая пара: `research:ux-design:Lead`

Общий candidate selector для6 продуктов: multi-select/search/offline/permissions/keyboard. Есть Figma и кодовый прототип.

**1. Что нельзя доказать только статичным Figma screenshot?**

- **A.** Расположение кнопки на макете
- **B.** Runtime focus/assistive-tech поведение и performance при асинхронных состояниях
- **C.** Наличие нарисованного текста label
- **D.** Выбранный цвет компонента

**2. Как задать release gate компонента?**

- **A.** State matrix и screenshots всех states, runtime AT/keyboard tests не нужны; полнота Figma frames доказывает одинаковое поведение шести products
- **B.** Runtime tests только multi-select happy path, permissions/offline/asynchronous states оставить UI teams; общий contract подтверждён наличием props
- **C.** Representative usability без accessibility checks, focus invariants не фиксировать; высокая average task speed достаточна для release общего selector
- **D.** State/action/permission matrix, selection/focus invariants и representative runtime usability/accessibility tests

Материалы: [figma](https://www.figma.com/resource-library/getting-started-in-design/), [figma-projects](https://help.figma.com/hc/en-us/sections/13148624530967), [miro](https://miro.com/templates/), [atlassian](https://www.atlassian.com/team-playbook).

Основание уровня: Нужно обеспечить и проверить поведенческий стандарт нескольких продуктов.

## Требования, BPMN и UML

### Стажёр — Требование с неясным словом

ID: `research-mc:business-analysis:Intern` · открытая пара: `research:business-analysis:Intern`

Заказчик: «приглашение быстро, зарплата правильно». Пороги latency и политика диапазона не согласованы.

**1. Как сделать требование проверяемым?**

- **A.** Самостоятельно назначить SLA100ms как согласованный
- **B.** Оставить слово «быстро» в acceptance без метрики
- **C.** Проверять только сообщение «Успех»
- **D.** Измеримое поведение/примеры и явные open decisions; пороги согласовать

**2. Что должно быть в traceability?**

- **A.** Только список технологий команды
- **B.** Связь stakeholder rule→acceptance examples→tests, включая invalid range
- **C.** Только номер Jira ticket без expected
- **D.** Только screenshot красивой формы

Материалы: [bpmn](https://camunda.com/bpmn/examples/), [uml](https://www.omg.org/spec/UML/2.5.1/About-UML), [atlassian](https://www.atlassian.com/team-playbook), [miro](https://miro.com/templates/).

Основание уровня: Нужно формализовать запрос и выявить недостающие решения.

### Junior — BPMN: два исхода и таймер

ID: `research-mc:business-analysis:Junior` · открытая пара: `research:business-analysis:Junior`

BPMN approval: accept/reject; без ответа48h escalation, не approval. Возможен late ответ49h.

**1. Какая модель ожидания соответствует взаимоисключающим событиям?**

- **A.** Event-based wait/message versus timer с отдельной escalation ветвью
- **B.** Parallel gateway с одновременными accept и timeout outcomes
- **C.** Таймер автоматически ведёт в accepted
- **D.** XOR только по заранее известному ответу без ожидания события

**2. Что требуется для ответа49h?**

- **A.** Удалить timer из процесса
- **B.** Явное бизнес-правило late response и token traces без двух terminal outcomes
- **C.** Автоматически считать accepted и escalated одновременно
- **D.** Всегда игнорировать поздний ответ как согласованное правило

Материалы: [bpmn](https://camunda.com/bpmn/examples/), [uml](https://www.omg.org/spec/UML/2.5.1/About-UML), [atlassian](https://www.atlassian.com/team-playbook), [miro](https://miro.com/templates/).

Основание уровня: Нужно моделировать процесс и проверить временные альтернативы.

### Middle — UML: платёж с неопределённым исходом

ID: `research-mc:business-analysis:Middle` · открытая пара: `research:business-analysis:Middle`

Платёж timeout после отправки провайдеру. Есть operation key/status API; клиент retry.

**1. Какое состояние после timeout допустимо?**

- **A.** Deleted, чтобы retry создал новую операцию
- **B.** Unknown до reconciliation, не доказанный failed
- **C.** Failed, внешний эффект точно отсутствует
- **D.** Succeeded, поскольку запрос был отправлен

**2. Что связывает state machine и sequence retry?**

- **A.** Тот же operation key, guarded transitions и status lookup, evidence результата
- **B.** Новый key при каждой повторной стрелке sequence
- **C.** Переход unknown→failed только по истечению HTTP timeout
- **D.** Отсутствие persisted state, достаточно diagram

Материалы: [bpmn](https://camunda.com/bpmn/examples/), [uml](https://www.omg.org/spec/UML/2.5.1/About-UML), [atlassian](https://www.atlassian.com/team-playbook), [miro](https://miro.com/templates/).

Основание уровня: Нужно согласовать две модели и проверяемые инварианты операции.

### Senior — Историческое правило доступа

ID: `research-mc:business-analysis:Senior` · открытая пара: `research:business-analysis:Senior`

Контакты доступны после принятия приглашения; отзыв consent должен скрыть контакты, сохранив историю. PDF уже скачан.

**1. Какую модель выбрать?**

- **A.** Оставить export links всегда доступными после первого consent
- **B.** Current consent/access отдельно от immutable history; controlled reads/exports учитывают текущие grants
- **C.** Удалить событие принятия и считать, что его не было
- **D.** Хранить consent только в UI

**2. Какой предел отзыва нужно явно назвать?**

- **A.** Все PDF на любом устройстве система гарантированно удалит
- **B.** История должна исчезнуть у всех участников
- **C.** Отзыв невозможен для любых controlled каналов
- **D.** Внешние скачанные копии не удаляются автоматически; controlled links/cache можно отозвать по контракту

Материалы: [bpmn](https://camunda.com/bpmn/examples/), [uml](https://www.omg.org/spec/UML/2.5.1/About-UML), [atlassian](https://www.atlassian.com/team-playbook), [miro](https://miro.com/templates/).

Основание уровня: Нужно провести сквозной impact analysis нескольких представлений данных.

### Lead — Версионирование бизнес-правил

ID: `research-mc:business-analysis:Lead` · открытая пара: `research:business-analysis:Lead`

Три продукта по-разному трактуют «подтверждённый кандидат». Единый новый контракт не должен переоценивать старые результаты.

**1. Как сохранить старые факты?**

- **A.** Сохранить evidence links без snapshot/version interpretation, заменить все definitions в Confluence; текущий текст восстановит любое прошлое подтверждение
- **B.** Старые results перенести под самый мягкий rule и считать новым подтверждением; одинаковое слово статуса гарантирует equivalence трёх продуктов
- **C.** Versioned rule/evidence snapshots, старую interpretation хранить, новые projections явные
- **D.** Version rules хранить, но legacy results молча пересчитать новым rule; история label остаётся, значит evidence семантика не изменилась

**2. Как доказать совместимость migration?**

- **A.** Trace rule version→examples/tests/evidence; ambiguous legacy не upgrade молча
- **B.** Сверить только количество кандидатов
- **C.** Сверить только display label
- **D.** Считать одинаковый статус доказательством одинакового evidence

Материалы: [bpmn](https://camunda.com/bpmn/examples/), [uml](https://www.omg.org/spec/UML/2.5.1/About-UML), [atlassian](https://www.atlassian.com/team-playbook), [miro](https://miro.com/templates/).

Основание уровня: Нужно управлять общим смысловым контрактом и доказать совместимость.

## Продукт: метрики, экономика и решения

### Стажёр — Экономика заказа

ID: `research-mc:product-management:Intern` · открытая пара: `research:product-management:Intern`

Чек2000₽, variable cost1200₽, payment fee3%, CAC900₽, два заказа на покупателя.

**1. Contribution на заказ и покупателя после CAC?**

- **A.** 680₽ и460₽
- **B.** 740₽ и580₽
- **C.** 800₽ и700₽
- **D.** 740₽ и−320₽

**2. Что ограничивает вывод об окупаемости?**

- **A.** Refunds, repeat horizon/cohort и overhead; contribution не равен net profit компании
- **B.** 580₽ автоматически доказывает прибыль всей фирмы
- **C.** CAC следует ещё раз вычесть из каждого заказа
- **D.** Два заказа гарантируют любой future retention

Материалы: [atlassian](https://www.atlassian.com/team-playbook), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/).

Основание уровня: Нужно выполнить расчёт и ограничить интерпретацию.

### Junior — Метрика приглашений

ID: `research-mc:product-management:Junior` · открытая пара: `research:product-management:Junior`

Sent invitations+40%, accepted меньше. Нужны полезный контакт, anti-spam guardrails и диагностика.

**1. Какая primary metric ближе к ценности?**

- **A.** Unique accepted/relevant contacts на active employer за фиксированный период
- **B.** Число отправленных invitations без dedup
- **C.** Число button clicks в форме отправки
- **D.** Число повторных отправок одному кандидату

**2. Как диагностировать падение?**

- **A.** Удалить жалобы как шум
- **B.** Sent→viewed→accepted funnel, cohorts, denominators/dedup и quality/spam guardrails
- **C.** Считать40% sent достаточным доказательством успеха
- **D.** Смешать периоды до/после без состава employers

Материалы: [atlassian](https://www.atlassian.com/team-playbook), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/).

Основание уровня: Нужно формализовать продуктовый результат и диагностическую систему.

### Middle — Приоритет с неопределённостью

ID: `research-mc:product-management:Middle` · открытая пара: `research:product-management:Middle`

RICE A:reach1000,impact2,confidence.9,effort3. B:5000,1,.3,4; reach B может быть ошибочен в5 раз.

**1. Каковы scores и B при reach25000?**

- **A.** A600,B375; B1875
- **B.** A600,B1250; B6250
- **C.** A1800,B1500; B7500
- **D.** A300,B375; B1875

**2. Какое исследование полезно для решения?**

- **A.** Уточнить reach/impact B и sensitivity при стратегических ограничениях
- **B.** Принять A навсегда, score объективен
- **C.** Увеличить confidence B без evidence
- **D.** Измерять только скорость разработки A

Материалы: [atlassian](https://www.atlassian.com/team-playbook), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/).

Основание уровня: Нужно рассчитать приоритет и найти сведения, меняющие выбор.

### Senior — Рост и каннибализация

ID: `research-mc:product-management:Senior` · открытая пара: `research:product-management:Senior`

Conversion растёт на5% относительно, average ticket падает на8%, traffic одинаков. Variable cost/order фиксирован.

**1. Как меняется revenue/visitor?**

- **A.** −8%, conversion не влияет
- **B.** ×1.05×.92=.966: −3.4%
- **C.** +5−8=−3% точно
- **D.** +5%, ticket не влияет

**2. Как проверить экономический эффект функции?**

- **A.** Contribution/order как primary, число orders/visitor не учитывать; одинаковый traffic гарантирует, что средний заказ выражает весь экономический эффект
- **B.** User-level A/B contribution/visitor с costs, repeats horizon, segments и uncertainty
- **C.** User-level A/B по conversion среди покупателей, variable costs фиксированы и потому отменяются; repeat horizon и contribution denominator не нужны
- **D.** Revenue/visitor и costs измерить, но анализировать только post-treatment buyers; random assignment сохраняет сопоставимость такого выбранного сегмента

Материалы: [atlassian](https://www.atlassian.com/team-playbook), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/).

Основание уровня: Нужно связать метрики и спроектировать причинную экономическую проверку.

### Lead — Решение о портфеле продукта

ID: `research-mc:product-management:Lead` · открытая пара: `research:product-management:Lead`

Budget8 engineer-months: A5 снижает data-loss risk; B3 обещает+4% contribution без теста; C4 новый сегмент с неизвестным спросом.

**1. Какие пары полностью feasible в этом бюджете?**

- **A.** Все три пары
- **B.** Только A+B
- **C.** A+B и B+C
- **D.** Только A+C

**2. Как выбирать portfolio при этих данных?**

- **A.** Выбрать A+B только по RICE, confidence всех проектов принять1; после release измерять лишь выполненные engineer-months, без outcome/risk gates
- **B.** Явные risk constraints и evidence plan, staged spend/stop criteria; единственного численного optimum пока нет
- **C.** Выбрать A+B по точному выдуманному ROI, risk/data-loss и untested4% трактовать как известные суммы; stop criteria задаёт только дедлайн
- **D.** Выбрать B+C, потому что их суммарная cost7 меньше8; неизвестный спрос и проверка contribution не могут изменить оптимальность дешёвого portfolio

Материалы: [atlassian](https://www.atlassian.com/team-playbook), [experimentation](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/), [mit-probability](https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/pages/problem-sets/).

Основание уровня: Нужно принять аргументированное решение при неопределённых целях и ограничении ресурса.

## C/C++, STM32 и реальное время

### Стажёр — C: границы буфера

ID: `research-mc:embedded-firmware:Intern` · открытая пара: `research:embedded-firmware:Intern`

C copy_name(dst,capacity,src="abcd") гарантирует null termination при capacity>0 и признак truncation; буферы не пересекаются.

**1. При capacity=4 что записано и есть ли truncation?**

- **A.** "abc\0"; да
- **B.** "abcd"; нет
- **C.** "abcd\0"; нет
- **D.** "ab\0"; да

**2. Что при capacity=0 и1 для данного непустого src?**

- **A.** 0: null в dst[0]; 1: буква a без null
- **B.** Оба случая обязательно читают dst[0]
- **C.** Оба случая возвращают not truncated
- **D.** 0: no write, truncated; 1: только null, truncated

Материалы: [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html), [ex-c](https://exercism.org/tracks/c/exercises), [ex-cpp](https://exercism.org/tracks/cpp/exercises), [freertos](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/01-Queues).

Основание уровня: Нужно реализовать и проверить память на нескольких границах.

### Junior — UART: частичный пакет

ID: `research-mc:embedded-firmware:Junior` · открытая пара: `research:embedded-firmware:Junior`

STM32 UART: magicAA,length1…32,payload,XOR. DMA даёт любые fragments, возможен garbage.

**1. Как parser обрабатывает length и fragment?**

- **A.** Выделять buffer по непроверенной length без bound
- **B.** При incomplete fragment отбрасывать всю историю всегда
- **C.** Persistent bounded state machine, length validate до buffer writes, продолжать через fragments
- **D.** Каждый DMA callback считать целым кадром

**2. Что проверяют split-every-position и bad-checksum tests?**

- **A.** Только число DMA interrupts
- **B.** State persistence, forward progress и bounded resync без зацикливания
- **C.** Только baud rate настройки
- **D.** Только один полный хороший frame

Материалы: [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html), [ex-c](https://exercism.org/tracks/c/exercises), [ex-cpp](https://exercism.org/tracks/cpp/exercises), [freertos](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/01-Queues).

Основание уровня: Нужно построить полный parser при произвольном разбиении потока.

### Middle — FreeRTOS: priority inversion

ID: `research-mc:embedded-firmware:Middle` · открытая пара: `research:embedded-firmware:Middle`

FreeRTOS: L(priority1) держит mutex, needs2ms CPU. H3 приходит через.5ms и ждёт; M2 требует10ms CPU.

**1. С inheritance когда L завершит оставшиеся1.5ms относительно M?**

- **A.** H сама выполняет critical section L одновременно
- **B.** L теряет mutex сразу при приходе H
- **C.** L получает priority3 и завершает перед M, затем H продолжает
- **D.** M всегда выполняет10ms перед L

**2. Почему binary semaphore не полная замена и что с ISR?**

- **A.** ISR может владеть mutex до следующего interrupt
- **B.** Inheritance решает любую deadlock независимо от lock order
- **C.** Mutex ownership/PI отличаются; ISR не ждёт blocking mutex, использует ISR-safe signaling
- **D.** Любой semaphore автоматически даёт PI; ISR может block

Материалы: [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html), [ex-c](https://exercism.org/tracks/c/exercises), [ex-cpp](https://exercism.org/tracks/cpp/exercises), [freertos](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/01-Queues).

Основание уровня: Нужно рассчитать расписание и применить механизм синхронизации.

### Senior — DMA, кеш и SPI

ID: `research-mc:embedded-firmware:Senior` · открытая пара: `research:embedded-firmware:Senior`

STM32 D-cache+SPI DMA RX: CPU читает старые данные; buffer делит cache line с другой dirty variable.

**1. Как организовать память/ownership?**

- **A.** Dedicated aligned cache-line buffer либо подходящий uncached region, platform DMA cache protocol
- **B.** Volatile buffer и memory barrier, shared dirty cache line invalidate после RX; volatile автоматически сохраняет соседнюю переменную при cache eviction
- **C.** Dedicated alignment, RX после DMA только clean вместо invalidate; dirty CPU cache всегда содержит более свежие принятые DMA bytes
- **D.** Invalidate любую shared line до/после DMA без ownership protocol; alignment address одного buffer достаточно независимо от size и dirty neighbours

**2. Как отличить stale cache от неверной DMA length?**

- **A.** Только увеличить SPI clock
- **B.** Считать любое неверное значение fault DMA controller
- **C.** Golden pattern, контроль length/ownership и cache-disabled/maintenance comparison
- **D.** Только повторный printf того же buffer

Материалы: [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html), [ex-c](https://exercism.org/tracks/c/exercises), [ex-cpp](https://exercism.org/tracks/cpp/exercises), [freertos](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/01-Queues).

Основание уровня: Нужно доказать согласованность через DMA/cache аппаратную границу.

### Lead — Обновление прошивки с power loss

ID: `research-mc:embedded-firmware:Lead` · открытая пара: `research:embedded-firmware:Lead`

Два flash slots, bootloader, signed update, power loss на любом шаге. Новый C++/FreeRTOS application меняет config format.

**1. Как сохранить рабочую загрузку?**

- **A.** Подписанный manifest и CRC, active slot переписывать in place; bootloader два слота восстановит независимо от partial active image и metadata order
- **B.** Verify inactive image, atomic durable boot metadata, probation/watchdog и rollback
- **C.** Писать inactive slot, boot pointer сменить до signature verification; rollback автоматически восстановит metadata при любом power loss между шагами
- **D.** Verify image и atomic slot selection, подтвердить update до первого application boot; watchdog probation не нужен при правильной signature

**2. Что обеспечивает чтение config старой firmware после rollback?**

- **A.** Shadow/versioned config с совместимостью или rollback snapshot до trial migration
- **B.** Два image slots и in-place config rewrite при первом boot; code rollback автоматически возвращает bytes прежних пользовательских настроек
- **C.** Config version хранить, old application не поддерживает new format и backup отсутствует; номер версии сам гарантирует обратную совместимость
- **D.** Переносить config до trial confirmation, старый snapshot удалить сразу; signed update гарантирует successful application startup при любой миграции

Материалы: [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html), [ex-c](https://exercism.org/tracks/c/exercises), [ex-cpp](https://exercism.org/tracks/cpp/exercises), [freertos](https://www.freertos.org/Documentation/02-Kernel/02-Kernel-features/02-Queues-mutexes-and-semaphores/01-Queues).

Основание уровня: Нужно обеспечить жизненный цикл и восстановление программно-аппаратной системы.

## Электроника, PCB и измерения

### Стажёр — Делитель и вход АЦП

ID: `research-mc:embedded-hardware:Intern` · открытая пара: `research:embedded-hardware:Intern`

5V input→ADC3.3V, divider top10k/bottom20k. Нужен nominal output≤3.0V.

**1. Каковы output и Thevenin сопротивление текущего divider?**

- **A.** 1.667V,30kΩ; безопасно
- **B.** 3.333V,30kΩ; безопасно
- **C.** 2.5V,10kΩ; безопасно
- **D.** 3.333V,6.667kΩ; номинально выше3.3V

**2. Какой top при bottom20k подходит номинально и что ещё проверить?**

- **A.** 20k→2.5V; никаких datasheet проверок не требуется
- **B.** 15k→2.857V; tolerance/max input и ADC acquisition impedance
- **C.** 10k→3.333V; только номинал питания
- **D.** 5k→4V; больше headroom

Материалы: [oscilloscope](https://www.tek.com/en/documents/primer/xyzs-oscilloscopes-primer), [kicad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html), [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html).

Основание уровня: Нужно рассчитать цепь и проверить пределы входа.

### Junior — I2C: время нарастания

ID: `research-mc:embedded-hardware:Junior` · открытая пара: `research:embedded-hardware:Junior`

I2C Cbus200pF,3.3V; tr=.8473RC≤300ns, sink≤3mA при VOL=.4V.

**1. Каков допустимый интервал R?**

- **A.** Примерно967…1770Ω
- **B.** Примерно100…4700Ω
- **C.** Примерно1770…4700Ω
- **D.** Примерно967…17700Ω

**2. R=1.5k: tr и ток; как измерять?**

- **A.** ≈254ns и3.3mA; длинный ground lead
- **B.** ≈25.4ns и1.93mA; любой probe loading
- **C.** ≈796ns и.617mA; это1.5k
- **D.** ≈254ns и1.93mA; малой ёмкостью щупа/короткой землёй

Материалы: [oscilloscope](https://www.tek.com/en/documents/primer/xyzs-oscilloscopes-primer), [kicad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html), [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html).

Основание уровня: Нужно совместить два электрических ограничения и проверку измерением.

### Middle — PCB: возвратный ток

ID: `research-mc:embedded-hardware:Middle` · открытая пара: `research:embedded-hardware:Middle`

4-layer PCB: SPI20MHz пересекает ground-plane split, есть ringing, KiCad ERC/DRC чисты.

**1. Какая правка адресует return path?**

- **A.** Увеличить gap plane для лучшей изоляции clock
- **B.** Непрерывная reference plane/корректный return stitching, controlled probe comparison
- **C.** Только изменить silkscreen над clock trace
- **D.** Считать DRC доказательством signal integrity

**2. Почему20MHz недостаточно для оценки spectrum?**

- **A.** Sample rate осциллографа задаёт реальный spectrum платы
- **B.** Fast edge содержит гармоники выше fundamental, edge rate важен
- **C.** Все компоненты spectrum не выше20MHz
- **D.** Только average current определяет ringing

Материалы: [oscilloscope](https://www.tek.com/en/documents/primer/xyzs-oscilloscopes-primer), [kicad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html), [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html).

Основание уровня: Нужно связать физику, проектирование и корректность измерения.

### Senior — Алиасинг диагностического сигнала

ID: `research-mc:embedded-hardware:Senior` · открытая пара: `research:embedded-hardware:Senior`

100kHz сигнал измеряется150kSa/s, нужен также10ns фронт.

**1. Какова наблюдаемая alias frequency?**

- **A.** 100kHz
- **B.** 150kHz
- **C.** 25kHz
- **D.** 50kHz

**2. Что требуется для оценки10ns фронта?**

- **A.** Sample rate чуть выше200kSa/s для100kHz fundamental гарантирует точность10ns фронта независимо от analog bandwidth и probe rise time
- **B.** Bandwidth35MHz автоматически даёт нулевую ошибку10ns edge; system/probe contributions и sampling grid не требуют отдельного error budget
- **C.** Снять alias основной частоты увеличением sample rate, analog bandwidth оставить100kHz; Nyquist fundamental сохраняет все гармоники исходного фронта
- **D.** Bandwidth порядка.35/10ns≈35MHz лишь исходная оценка; учесть probe/system rise time и достаточный sample rate

Материалы: [oscilloscope](https://www.tek.com/en/documents/primer/xyzs-oscilloscopes-primer), [kicad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html), [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html).

Основание уровня: Нужно рассчитать два разных ограничения измерительного тракта.

### Lead — Допуск платы к выпуску

ID: `research-mc:embedded-hardware:Lead` · открытая пара: `research:embedded-hardware:Lead`

STM32+ADC+SPI display PCB: при display update ADC bias3%, требование≤.5%.

**1. Как локализовать причину?**

- **A.** Controlled supply/reference/return/timing measurements и A/B layout/firmware prototypes
- **B.** Увеличить averaging и сравнить RMS noise без bias, display timing не контролировать; меньше noise обязательно устраняет systematic3% смещение
- **C.** Изменить layout сразу по нескольким факторам и подтвердить один room-temperature график; A/B isolation питания/reference/timing не требуется
- **D.** Прогнать ERC/DRC и считать return path правильным, ADC reference не измерять; отсутствие KiCad errors доказывает аналоговую точность платы

**2. Какой release evidence соответствует≤.5%?**

- **A.** Средняя ошибка room-temperature prototype≤.5%, uncertainty и load corners не учитывать; mean подтверждает предел для всех режимов
- **B.** Снижение peak-to-peak noise и nominal ADC bits достаточно; systematic offset не входит в допуск измерения если кривая стала ровнее
- **C.** Только calibration в одном режиме, temperature/display transitions не проверять; одна correction coefficient гарантирует worst-case≤.5%
- **D.** Error budget с uncertainty, temperature/load corners и измерениями худшего режима

Материалы: [oscilloscope](https://www.tek.com/en/documents/primer/xyzs-oscilloscopes-primer), [kicad](https://docs.kicad.org/9.0/en/getting_started_in_kicad/getting_started_in_kicad.html), [stm32](https://www.st.com/content/st_com/en/support/learning/stm32-moocs.html).

Основание уровня: Нужно принять инженерное решение по проверенному бюджету ошибки системы.
