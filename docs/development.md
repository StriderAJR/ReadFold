# Локальная разработка

Требуется Node.js 22.12+ либо 24 LTS и npm. На Windows убедитесь, что `node --version` запускает
реальный runtime, а не неактивный nvm shim. В данной сессии использован установленный Node 24.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

В `.env.local` разрешены только публичный URL Supabase и publishable key. Без них работает гостевой
режим. Серверные секреты не нужны для сборки. `.sensitive/` и `.env.local` игнорируются Git.

```sh
npm run typecheck
npm run lint
npm test
npm run test:sql
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E используют production preview, отдельный browser context и локальные данные, без реального OAuth.
Offline проверяется после загрузки service worker. `npm run test:sql` применяет миграцию и SQL-проверки
в изолированном PostgreSQL/WASM (PGlite) с минимальной auth-schema для двух тестовых пользователей.
Это не обращается к удалённой базе. Дополнительно проверяйте реальный Supabase в тестовом окружении;
SQL fixtures не запускать на production аккаунтах.

Перед изменениями читать AGENTS.md, проверять status/diff. Существующая агентская конфигурация
сохранена. Применимые роли: data, sync, backend, frontend, testing, reviewer. Независимые границы
описаны в [implementation-plan.md](implementation-plan.md); правила — [agent-workflow.md](agent-workflow.md).
