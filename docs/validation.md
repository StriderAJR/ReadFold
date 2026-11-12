# Проверка реализации — 12 ноября 2026

Ветка master, remote StriderAJR/ReadFold. Использованы существующие роли data, sync, backend,
frontend, testing, reviewer, до трёх субагентов одновременно. Конфигурация агентов сохранена.

## Автоматически

- TypeScript strict typecheck и ESLint, включая обязательные фигурные скобки.
- 55 Vitest unit/integration-тестов: внешние схемы/ID/ruby, задания, расписание, preferences,
  транзакции, Dexie migration, outbox, retry, idempotency, conflicts, guest merge, account state,
  запрет upload при отключённой синхронизации, защита явного знания от поздней автоматической встречи.
  Дополнительно: timestamp offsets и locale-independent порядок, смена A → B и A → B → A в Auth.
  Импорт одной гостевой копии на независимых устройствах получает одинаковые ID, изменённое содержимое
  под прежним ID отклоняется атомарно; одинаковые исходные ID разных владельцев не смешиваются.
- SQL migration + user_isolation.sql в изолированном PostgreSQL/WASM (PGlite): RLS двух пользователей,
  RPC ownership, повторная доставка, невалидные payload/dates, запрет прямой записи и anonymous доступа.
- Production build с `/ReadFold/`, HashRouter и service worker. Vendor chunks разделены.
- 9 Playwright E2E в установленном Chrome: библиотека/книга/глава, прямой sentence route,
  сохранение/восстановление позиции, три режима и слои, словарные вхождения, результат задания,
  backup export/import, mobile navigation, offline shell/чтение/сохранение, adaptive manual reveal.
- Visual smoke: desktop 1440px, mobile 390px и dark settings. JS page errors отсутствуют;
  reader не переполняет ширину viewport. Снимки находятся в игнорируемом test-results/visual.
- SHA256 Google verification совпадает в docs и public; исходные docs HTML сохранены.
- Игнорирование `.sensitive/`, `.env.local`, test-results и отсутствие серверных credentials в исходниках.
- Воспроизводимая установка `npm ci --offline` из уже загруженного кэша прошла, затем повторены сборка/E2E.
- Heartbeat mock smoke: healthy → failure → repeated failure → recovery, два уведомления без спама;
  реальные Telegram-сообщения не отправлялись. Publishable key передаётся только как apikey, не Bearer JWT.

## Внешние сервисы

Публичные OAuth authorize endpoints Supabase возвращают 302 к accounts.google.com и github.com.
Это проверка конфигурации провайдеров, а не завершённый интерактивный login.

Удалённая миграция `202611120001_user_sync` применена 12 ноября 2026 к `kkmuehzkvmbmnkzwfxfa`
с явного разрешения владельца. Использован предоставленный CA, TLS-проверка не ослаблялась.
После применения read-only проверки подтвердили RLS обеих таблиц, две ownership policy,
отсутствие прямых INSERT/UPDATE/DELETE для authenticated, закрытые anonymous private RPC и внутренние
SQL helpers. Публичный REST heartbeat вернул 200/true; anonymous чтение user_operations — 401.
Содержимое пользовательских записей не читалось, fixture-пользователи/записи на live не создавались.

Новая сборка не опубликована; push и переключение Pages не выполнялись. Владелец должен настроить
Actions variables/Secrets, Pages source и OAuth redirect allowlist по deployment.md. Telegram optional.

## Ограничения проверки

Нет нагрузки на реальный PostgreSQL с параллельными подключениями; доказательство порядка cursor
основано на per-owner FOR UPDATE и локальных SQL-проверках. Реальный OAuth login, logout/refresh
провайдеров и end-to-end multi-device sync не прогонялись интерактивно: база подготовлена,
для полного сценария нужны реальные тестовые аккаунты и два браузера/устройства.
Маленькая оригинальная библиотека не проходила редактуру носителем японского языка.
