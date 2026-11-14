# Развёртывание

## Основной процесс: локальная сборка → docs → GitHub Pages

Приложение собирается и проверяется на компьютере владельца; GitHub получает готовые статические файлы.
Адрес сохраняется: `https://striderajr.github.io/ReadFold/`. Подключать новый хостинг не требуется.
GitHub Actions для сборки приложения не нужен; доступность самого Pages deployment при ограничениях
аккаунта проверяется отдельно, как описано ниже.

В корне проекта, с Node.js 24 и npm:

```powershell
npm ci
npx playwright install chromium
npm run publish:docs
```

Перед сборкой настроить локальный `.env.local` по `.env.example`: `VITE_SUPABASE_URL` и
`VITE_SUPABASE_PUBLISHABLE_KEY`. Оба параметра публичные и попадут в браузерную сборку.
Серверные ключи, service_role, пароль базы и Telegram-токен в `VITE_*` не помещать.
`.env.local` и `.sensitive/` не копируются в сайт и не коммитятся.

`publish:docs` выполняет TypeScript, lint, Vitest, проверки публикации, локальные SQL-проверки,
production build и Playwright E2E (на Windows установленный Chrome, в CI Chromium).
Сборка создаётся в `dist` с base строго `/ReadFold/`; E2E использует preview-порт 4173.
SQL-проверки не применяют миграцию к production. После успешных проверок готовый сайт переносится в `docs/`,
включая `.nojekyll`. Команда готовит локальные изменения; commit, push и удалённую публикацию она не выполняет.
Для отдельной сборки без подготовки `docs/`: `npm run build`.

Перед заменой существующих файлов создаётся резервная копия вне публикуемого каталога:
`.local-tools/pages-backups/<timestamp>/` с манифестом. Владение сгенерированными файлами учитывается
в `docs/.readfold-publish.json`; при обновлении удаляются только ранее учтённые файлы сборки.
Каталог `docs/` целиком не удаляется, Markdown-документация сохраняется.
Юридические HTML, иконка бренда и `googlef53875cf353db667.html` включаются из `dist_public/`; прежние версии остаются
в локальной резервной копии. Корневые `PRIVACY.md` и `TERMS.md` сохраняются.
Не удалять backup до проверки релиза; при проблеме остановить публикацию и сравнить файлы с копией.

## Публикация подготовленного docs

1. Проверить `git status`, текущую ветку и `git diff`. Для текущего репозитория ожидается `master`;
   не переключать ветку поверх пользовательских изменений автоматически.
2. Проверить подготовленные изменения и резервную копию. Отдельно согласовать commit и push.
3. В GitHub Settings → Pages выбрать Source → Deploy from a branch, Branch → `master`, Folder → `/docs`.
   Если такой источник уже выбран, сохранить его. Не выбирать GitHub Actions как обязательный источник.
4. После разрешённого push проверить статус Pages deployment и фактическое обновление
   `https://striderajr.github.io/ReadFold/`.
5. Проверить обновление `/ReadFold/#/library`, загрузку главы, privacy/terms/verification,
   вход/выход Google и GitHub, синхронизацию, затем offline-открытие ранее загруженной главы.

HashRouter не требует серверного SPA fallback. Регистр `/ReadFold/` существенен.
Локальная успешная сборка не подтверждает, что GitHub уже опубликовал новую версию.

### Ограничения GitHub и .nojekyll

`.nojekyll` сообщает Pages, что файлы уже собраны и Jekyll не нужен.
[GitHub changelog от 8 июля 2024](https://github.blog/changelog/2024-07-08-pages-legacy-worker-sunset/)
описывал прямую публикацию с `.nojekyll` при недоступных Actions.
При этом [актуальная документация Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
указывает, что deployment выполняется workflow, включая публикацию предварительно собранной ветки.
Поэтому локальная сборка и `master/docs` — выбранный рабочий процесс, но гарантировать обход
блокировки биллинга конкретного аккаунта нельзя. Требуется фактический push и проверка deployment
с разрешения владельца. Если GitHub блокирует и этот путь, локальная сборка остаётся готовой;
дополнительные варианты описаны в [github-actions-fallback.md](github-actions-fallback.md).

## Supabase и OAuth

Frontend остаётся на прежнем origin и base, поэтому перенос локальных данных и смена OAuth-адреса не нужны.
Существующие Google/GitHub OAuth приложения повторно не создаются. В Auth → URL Configuration:

- Site URL: `https://striderajr.github.io/ReadFold/`.
- Redirect URLs: `https://striderajr.github.io/ReadFold/`, `http://localhost:5173/ReadFold/`,
  `http://127.0.0.1:5173/ReadFold/` при локальной разработке.

Callback провайдеров — существующий Supabase `/auth/v1/callback`. Приложение вычисляет redirect из origin
и base сборки; браузер использует PKCE и publishable key. Google Testing требует заранее добавленных
test users. Дополнительные scopes не нужны. Mock-тесты OAuth не заменяют live-проверку провайдеров.

Миграция `supabase/migrations/202611120001_user_sync.sql` транзакционная, создаёт таблицы/RPC/RLS.
Она не является повторяемой и в текущем production уже применена — см. запись ниже.
Обновление frontend не требует повторной миграции. Для новой базы применение согласуется отдельно
после проверки конфликтующих таблиц. Не заменять существующие данные и не запускать isolation-тест
на production. Все таблицы пользовательских данных закрыты от anonymous роли.

`npm run test:sql` проверяет SQL локально. Файл `supabase/tests/user_isolation.sql` можно отдельно запускать
в тестовой базе с Supabase auth schema; проверки исполняются в транзакции с rollback.
Клиент не получает серверные credentials и не обходит RLS.

## Heartbeat

Heartbeat необязателен для публикации frontend. Ручной запуск: `npm run heartbeat:local`.
Команда читает публичные параметры Supabase из `.env.local`. Для необязательных Telegram-уведомлений
скопировать `.env.heartbeat.example` в `.env.heartbeat.local` и заполнить локально.
Также поддерживаются переменные окружения `SUPABASE_URL` и `SUPABASE_PUBLISHABLE_KEY`.
Не записывать секреты в команду, документацию или frontend env; использовать безопасно настроенное окружение.
Локальное состояние хранится в `.heartbeat-state/`, поэтому запускать из корня проекта.
Расписание не устанавливается; сохранённый workflow Actions запускается только вручную.
Вариант Actions описан в [github-actions-fallback.md](github-actions-fallback.md).

RPC выполняет минимальный запрос с publishable key. Heartbeat не гарантирует предотвращение pause
Supabase Free; `pg_cron` внутри той же базы не заменяет независимую внешнюю проверку доступности.
Локальный планировщик и новый внешний сервис мониторинга этим процессом не настраиваются.

## Offline и обновления

Service worker создаётся после production build. Кэш оболочки версионируется хешем assets, старые версии
удаляются при активации. Новый worker ожидает закрытия старых вкладок; пользовательские операции хранятся
в IndexedDB независимо. Книгу нужно открыть онлайн до offline-чтения. Новые главы требуют сети.
Перед важным обновлением рекомендуется скачать резервную копию пользовательских данных через настройки.

## Фактическое состояние

Подготовка локальной сборки не означает публикацию. Commit, push, изменение Settings → Pages и проверка
нового deployment выполняются отдельно с разрешения владельца. При блокировке аккаунта успешный
удалённый deployment не подтверждён. Юридические документы и Google verification сохраняются.

Миграция `202611120001_user_sync` применена к проекту `kkmuehzkvmbmnkzwfxfa` 12 ноября 2026
с явного разрешения владельца, транзакционно, с CA-сертификатом и полной проверкой TLS.
SQL соответствует коммиту `13de7a5`. Подтверждены RLS/ownership policies, запреты private RPC/direct writes
для неподходящих ролей, публичный heartbeat и 401 для anonymous data read. Live fixtures не создавались.
Миграция выполнена напрямую через PostgreSQL, не через Supabase CLI; CLI migration history не заполнялась.
Не запускайте SQL повторно. При переходе на CLI сначала согласуйте его историю с уже существующей схемой.
Сертификат для будущих подключений хранится локально в `.sensitive/prod-ca-2021.crt`, вне Git.
Фактические проверки перечислены в [validation.md](validation.md).
