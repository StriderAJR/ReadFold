# Дополнительные варианты публикации и heartbeat

Основной процесс — [локальная сборка и публикация готового docs](deployment.md).
Следующие варианты необязательны; они не означают, что текущий хостинг уже изменён.

## GitHub Actions после восстановления доступа

`.github/workflows/pages.yml` может собирать и публиковать приложение после восстановления доступа
к Actions и проверки ограничений аккаунта. Файл workflow не подтверждает доступность runners.
Repository Actions variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (оба публичные).
Серверные credentials не добавлять в клиентскую сборку.

Workflow запускается только вручную (`workflow_dispatch`), чтобы не создавать неудачные запуски при каждом push.
Выполняет npm ci, TypeScript, lint, Vitest, проверки публикации, локальные SQL-проверки, build и Chromium E2E.
Публикуется `dist`, base `/ReadFold/`.
Deployment использует `pages:write` / `id-token:write`.
Только при выборе этого варианта переключить Settings → Pages → Source → GitHub Actions.
Commit и push требуют отдельного указания владельца.

## Другой статический хостинг, если Pages блокирует deployment

Требуется отдельный выбор владельца. Пример — Cloudflare Pages Direct Upload без подключения GitHub.
Это запасной путь; доступность аккаунта Cloudflare не проверена, сайт не создан.
Для него нужна отдельная сборка с base `/` и service worker с тем же base. Текущий `dist` рассчитан
на `/ReadFold/` и не должен переноситься в корень другого сайта без такой подготовки.

Cloudflare dashboard: Workers & Pages → Create application → Get started → Drag and drop your files.
Загрузить заранее проверенную папку сайта либо ZIP с `index.html` в корне, выбрать имя и Deploy site.
Полученный адрес имеет вид `https://<project>.pages.dev/`. Публиковать только статику, без Functions,
`_worker.js` и серверного runtime. Для следующего релиза: Create a new deployment → Production.
Dashboard принимает до 1000 файлов, максимум 25 MiB на файл. Direct Upload нельзя переключить
на Git integration без нового проекта.
Источник: [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

Запросы к статическим ресурсам Pages бесплатны и не ограничены по числу запросов;
Functions тарифицируются отдельно: [Cloudflare pricing](https://developers.cloudflare.com/pages/functions/pricing/).
Перед выбором сверить [лимиты](https://developers.cloudflare.com/pages/platform/limits/) и условия аккаунта.

При смене origin обновить Supabase Site URL и точный Redirect URL; существующий callback
Google/GitHub в Supabase `/auth/v1/callback` сохраняется, OAuth приложения пересоздавать не нужно.
Старый GitHub URL автоматически не перенаправится. До переезда экспортировать через настройки
локальные данные отдельно для гостя и каждого аккаунта; IndexedDB и несинхронизированные изменения
не переносятся между origin автоматически. На новом адресе войти в прежний аккаунт и импортировать
его копию, явно выбрать владельца для гостевой копии. Проверить данные перед удалением старой копии.
При прежнем Supabase-проекте и аккаунте облачные данные сохраняют user UUID.

## Heartbeat через Actions

`.github/workflows/heartbeat.yml` оставлен только для ручного запуска, timeout 3 минуты.
Автоматическое расписание отключено; при недоступных Actions workflow не работает.
Ручной локальный запуск описан в [deployment.md](deployment.md).

Actions Secrets: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`; необязательные `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`. Используется publishable key, не service_role. RPC heartbeat делает минимальный
безопасный запрос; проверяются HTTP и тело ответа. Telegram сообщает о смене состояния и восстановлении.
Состояние сохраняется в Actions cache без токенов. При сбросе/eviction кэша возможны повторные уведомления;
гарантии exactly-once нет. Отсутствие Telegram не блокирует deployment.

Успешный heartbeat не гарантирует предотвращение pause Supabase Free.
