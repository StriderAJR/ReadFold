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
npm run content:build
npm run test:content
npm run content:entity -- ja:word:朝
npm run typecheck
npm run lint
npm test
npm run test:deployment
npm run test:sql
npm run build
npx playwright install chromium
npm run test:e2e
```

`content:build` собирает JSON из редактируемого `content/ja/` в `.local-tools/content/` для dev-сервера и проверяет всю коллекцию;
`test:content` дополнительно проверяет генератор, а `content:entity` печатает карточку по ID и связанные
вхождения. Запускай сборщик после редактирования исходников; не меняй сгенерированные файлы `.local-tools/content/` и `dist/`
вручную. `npm run build` и `npm run dev` запускают его автоматически.

E2E используют production preview, отдельный browser context и локальные данные, без реального OAuth.
Offline проверяется после загрузки service worker. `npm run test:sql` применяет миграцию и SQL-проверки
в изолированном PostgreSQL/WASM (PGlite) с минимальной auth-schema для двух тестовых пользователей.
Это не обращается к удалённой базе. Дополнительно проверяйте реальный Supabase в тестовом окружении;
SQL fixtures не запускать на production аккаунтах.

Перед изменениями читать AGENTS.md, проверять status/diff. Существующая агентская конфигурация
сохранена. Применимые роли: data, sync, backend, frontend, testing, reviewer. Независимые границы
описаны в [implementation-plan.md](implementation-plan.md); правила — [agent-workflow.md](agent-workflow.md).

Для выпуска через существующий GitHub Pages: `npm run publish:docs`. Команда последовательно выполняет
все проверки и production build (контент генерируется прямо в `dist/`), затем безопасно обновляет `docs/`. Markdown не удаляется; заменяемые
HTML сохраняются в `.local-tools/pages-backups/`. Commit и push выполняются отдельно по указанию владельца.
Подробности и ограничения биллинга: [deployment.md](deployment.md).
