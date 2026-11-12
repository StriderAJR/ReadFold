# Развёртывание

## GitHub Pages

1. Сохранить пользовательские изменения и отдельно подготовить commit/push. Эта реализация их не выполняет.
2. В Settings → Pages переключить Source с Deploy from a branch (`master/docs`) на GitHub Actions
   только после проверки собранного приложения. До этого существующие HTML в docs продолжают работать.
3. Repository Actions variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (оба публичные).
4. `.github/workflows/pages.yml`: npm ci → types → lint → Vitest → build → Chromium E2E → upload/deploy.
   Pull request только проверяет, без публикации. Actions deployment использует pages:write/id-token:write.
5. URL `https://striderajr.github.io/ReadFold/`; Vite base строго `/ReadFold/`. Внутренние ссылки hash-based,
   например `/ReadFold/#/library`. Обновление такого адреса не требует серверного SPA fallback.

Vite копирует privacy.html, terms.html и googlef53875cf353db667.html из public в корень dist.
Google verification сохранён без изменений. Старые docs-файлы и корневые юридические документы сохраняются.

## Supabase

Миграция `supabase/migrations/202611120001_user_sync.sql` транзакционная, создаёт новые таблицы/RPC/RLS.
Она не является повторяемой: один раз применить через SQL Editor или Supabase CLI migrations после
проверки отсутствия конфликтующих таблиц. Не заменять существующие данные и не запускать isolation-тест
на production. Все таблицы пользовательских данных закрыты от anonymous роли.

Существующие Google/GitHub OAuth приложения повторно не создаются. В Auth → URL Configuration:

- Site URL: `https://striderajr.github.io/ReadFold/`
- Redirect URLs: `https://striderajr.github.io/ReadFold/`, `http://localhost:5173/ReadFold/`,
  `http://127.0.0.1:5173/ReadFold/` (при локальной разработке).

Callback провайдеров — существующий Supabase `/auth/v1/callback`. Браузер использует PKCE и только
publishable key. Google Testing требует заранее добавленных test users. Не включать дополнительные scopes.

SQL проверки `supabase/tests/user_isolation.sql` запускать отдельно в тестовой базе с Supabase auth schema.
Они исполняются в транзакции с rollback. Mock-тесты OAuth не заменяют проверку настроек провайдера.

## Heartbeat

`.github/workflows/heartbeat.yml` запускается ежедневно в 06:17 UTC и вручную, timeout 3 минуты.
Actions Secrets: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`; необязательные `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`. Ключ publishable, не service_role. RPC heartbeat делает минимальный безопасный запрос.
HTTP/body result проверяются. Telegram отправляет изменение состояния и восстановление; state хранится
в Actions cache, без токенов. При сбросе/eviction кэша возможен повтор уведомления; гарантии exactly-once нет.
Отсутствие Telegram не блокирует deployment. Heartbeat не гарантирует предотвращение pause Supabase Free.

## Offline и обновления

Service worker создаётся после production build. Кэш оболочки версионируется хешем assets, старые версии
удаляются при активации. Новый worker ожидает закрытия старых вкладок; пользовательские операции хранятся
в IndexedDB независимо. Книгу нужно открыть онлайн до offline-чтения. Новые главы требуют сети.

## Фактическое состояние этой реализации

Workflow подготовлен локально; промежуточные коммиты создаются по указанию владельца.
Push, переключение Pages и публикация новой сборки не выполнялись.
Миграция `202611120001_user_sync` применена к проекту `kkmuehzkvmbmnkzwfxfa` 12 ноября 2026
с явного разрешения владельца, транзакционно, с CA-сертификатом и полной проверкой TLS.
SQL соответствует коммиту `13de7a5`. Подтверждены RLS/ownership policies, запреты private RPC/direct writes
для неподходящих ролей, публичный heartbeat и 401 для anonymous data read. Live fixtures не создавались.
Миграция выполнена напрямую через PostgreSQL, не через Supabase CLI; CLI migration history не заполнялась.
Не запускайте SQL повторно. При переходе на CLI сначала согласуйте его историю с уже существующей схемой.
Сертификат для будущих подключений хранится локально в `.sensitive/prod-ca-2021.crt`, вне Git.
Фактические проверки перечислены в [validation.md](validation.md).
