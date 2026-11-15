# ReadFold

**From guided reading to fluent reading.**

Изучение японского через чтение с русским разбором. Приложение работает в гостевом режиме;
Google/GitHub через Supabase добавляют синхронизацию между устройствами.

## Запуск

Node.js 22.12+ / 24 LTS, npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Откройте `http://localhost:5173/ReadFold/`. Параметры Supabase необязательны для гостевого режима.
На Windows `run-local.bat` запускает сервер и открывает браузер; остановка — Ctrl+C в его окне.
В `.env.local` укажите только `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`.
Секреты OAuth, service_role и пароль PostgreSQL не используются frontend.

## Реализованные возможности

- Каталог, избранное, недавнее чтение, главы и восстановление позиции.
- Подробный, адаптивный и непрерывный режимы; независимые ruby/furigana, хирагана, ромадзи,
  буквальный/литературный перевод и разбор слов/кандзи/грамматики.
- Оригинальный CC0-рассказ из двух глав, стабильные ID, строгие Zod-схемы и ленивые JSON.
- Отдельные словарные карточки и переходы к вхождениям в тексте.
- Задания на значение, чтение, письменный перевод, кандзи и грамматику; история и интервальные повторения.
- IndexedDB/Dexie: атомарный журнал и outbox, миграции, импорт/экспорт выбранного владельца,
  явный перенос гостевых данных, изолированная локальная диагностика.
- Supabase PKCE, отдельный application UUID, SQL RLS, идемпотентные RPC и повторные попытки синхронизации.
- Production service worker для повторного открытия приложения и загруженных материалов без сети.
- Локальная сборка в `docs/` для GitHub Pages; ручной heartbeat с необязательными Telegram-уведомлениями.

## Проверка

```sh
npm run typecheck
npm run lint
npm test
npm run test:deployment
npm run test:sql
npm run build
npx playwright install chromium
npm run test:e2e
```

На Windows E2E по умолчанию использует установленный Google Chrome; в CI — Playwright Chromium.
Playwright запускает production preview. Реальный OAuth не выполняется в CI: адаптер покрыт моками SDK.
SQL/RLS-проверки запускаются локально в PGlite с минимальной auth-schema, без доступа к production.
Это не заменяет проверку настроек реального Supabase.

## TODO
- английский язык интерфейса и перевода (для англоговорящих пользователей)
- добавить поддержку: корейского, китайского и английского языков для изучения

## Документация

[Архитектура](.agents/architecture.md) · [Модель данных](.agents/data-model.md) · [Формат книг](.agents/book-format.md) ·
[Синхронизация](.agents/sync.md) · [Безопасность](.agents/security.md) · [Разработка](.agents/development.md) ·
[План и зависимости](.agents/implementation-plan.md)
