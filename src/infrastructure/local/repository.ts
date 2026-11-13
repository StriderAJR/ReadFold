import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import { defaultPreferences, type EntityKind, type LearningStatus, type UserOperation } from '../../domain/user-state';

export const GUEST_OWNER = 'guest';
const preferencesSchema = z
  .object({
    language: z.enum(['ru', 'en']),
    theme: z.enum(['light', 'dark', 'system']),
    fontSize: z.number().finite().min(10).max(80),
    readingFontSize: z.number().finite().min(10).max(80),
    translationFontSize: z.number().finite().min(10).max(80),
    wordsFontSize: z.number().finite().min(10).max(80),
    kanjiFontSize: z.number().finite().min(10).max(80),
    grammarFontSize: z.number().finite().min(10).max(80),
    lineHeight: z.number().finite().min(1).max(4),
    width: z.number().finite().min(200).max(2000),
    mode: z.enum(['detailed', 'adaptive', 'continuous']),
    canvasMode: z.boolean(),
    furigana: z.boolean(),
    furiganaSeparateLine: z.boolean(),
    hiragana: z.boolean(),
    hiraganaSeparateLine: z.boolean(),
    romaji: z.boolean(),
    romajiSeparateLine: z.boolean(),
    literal: z.boolean(),
    literalSeparateLine: z.boolean(),
    natural: z.boolean(),
    naturalSeparateLine: z.boolean(),
    words: z.boolean(),
    kanji: z.boolean(),
    grammar: z.boolean(),
    adaptiveHideKnown: z.boolean(),
    syncEnabled: z.boolean(),
    dailyReviewLimit: z.number().int().min(1).max(1000),
  })
  .partial()
  .strict();
const payloadSchemas = {
  reading: z
    .object({
      sentenceId: z.string().min(1).max(512),
      position: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      bookId: z.string().max(512).optional(),
      chapterId: z.string().max(512).optional(),
    })
    .strict(),
  learning: z
    .object({ status: z.enum(['encountered', 'learning', 'known', 'mastered']), automatic: z.boolean().optional() })
    .strict()
    .refine((payload) => !payload.automatic || payload.status === 'encountered'),
  favorite: z.object({ active: z.boolean() }).strict(),
  review: z
    .object({
      rating: z.enum(['again', 'hard', 'good', 'easy']),
      reviewedAt: z.string().datetime({ offset: true }).optional(),
      correct: z.boolean().optional(),
      taskId: z.string().max(512).optional(),
      repetitions: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
      intervalDays: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
      dueAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    })
    .strict(),
  preferences: preferencesSchema,
};
const operationSchema = z
  .object({
    id: z.string().min(1).max(128),
    ownerId: z.string().min(1),
    deviceId: z.string().min(1).max(128),
    entityKind: z.enum(['reading', 'learning', 'preferences', 'favorite', 'review']),
    entityId: z.string().min(1).max(512),
    payload: z.record(z.string(), z.unknown()),
    createdAt: z.string().max(64).datetime({ offset: true }),
  })
  .strict()
  .superRefine((operation, context) => {
    const result = payloadSchemas[operation.entityKind].safeParse(operation.payload);
    if (!result.success) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['payload'], message: 'Invalid operation payload' });
    }
    if (!isJson(operation.payload) || new TextEncoder().encode(JSON.stringify(operation.payload)).length > 48 * 1024) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload'],
        message: 'Invalid or oversized JSON payload',
      });
    }
  });

function isJson(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object' || seen.has(value)) {
    return false;
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    return false;
  }
  seen.add(value);
  const valid = Object.values(value).every((entry) => isJson(entry, seen));
  seen.delete(value);
  return valid;
}
const exportSchema = z.object({ version: z.literal(1), operations: z.array(operationSchema).max(100_000) }).strict();
export interface OutboxEntry {
  id: string;
  ownerId: string;
  attempts: number;
  nextAttemptAt: number;
}
interface Metadata {
  key: string;
  value: string;
}
interface CacheEntry {
  id: string;
  json: unknown;
  updatedAt: number;
}
export type DiagnosticReason =
  | 'authentication'
  | 'permission'
  | 'conflict'
  | 'rate_limit'
  | 'bad_request'
  | 'server'
  | 'network'
  | 'unknown';
export interface Diagnostic {
  id?: number;
  code: string;
  status?: number;
  reason?: DiagnosticReason;
  createdAt: number;
  category: 'sync' | 'storage' | 'import' | 'cache' | 'other';
  level: 'error' | 'warning' | 'info';
  count: number;
  lastSeen: number;
}
const diagnosticCodes = ['sync_failed', 'import_failed', 'cache_failed', 'storage_failed'];
const diagnosticLifetime = 7 * 24 * 60 * 60 * 1000;
function diagnosticReason(code: string, status?: number): DiagnosticReason {
  if (!code.startsWith('sync_')) {
    return 'unknown';
  }
  if (status === 401) {
    return 'authentication';
  }
  if (status === 403) {
    return 'permission';
  }
  if (status === 409) {
    return 'conflict';
  }
  if (status === 429) {
    return 'rate_limit';
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return 'bad_request';
  }
  if (status !== undefined && status >= 500) {
    return 'server';
  }
  if (status === undefined) {
    return 'network';
  }
  return 'unknown';
}
function sanitizeDiagnostic(entry: Partial<Diagnostic>): Diagnostic {
  const code = diagnosticCodes.includes(entry.code ?? '') ? entry.code! : 'other';
  const category: Diagnostic['category'] = code.startsWith('sync_')
    ? 'sync'
    : code.startsWith('import_')
      ? 'import'
      : code.startsWith('cache_')
        ? 'cache'
        : code.startsWith('storage_')
          ? 'storage'
          : 'other';
  const status =
    Number.isInteger(entry.status) && entry.status !== undefined && entry.status >= 100 && entry.status <= 599
      ? entry.status
      : undefined;
  const level = entry.level === 'info' || entry.level === 'warning' ? entry.level : 'error';
  const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt! : 0;
  const lastSeen = Number.isFinite(entry.lastSeen) ? entry.lastSeen! : createdAt;
  const count = Number.isSafeInteger(entry.count) && entry.count! > 0 ? entry.count! : 1;
  const reason =
    entry.reason &&
    ['authentication', 'permission', 'conflict', 'rate_limit', 'bad_request', 'server', 'network', 'unknown'].includes(
      entry.reason,
    )
      ? entry.reason
      : diagnosticReason(code, status);
  return { code, category, status, reason, level, createdAt, lastSeen, count };
}

export class LocalDatabase extends Dexie {
  operations!: Table<UserOperation, string>;
  outbox!: Table<OutboxEntry, string>;
  metadata!: Table<Metadata, string>;
  cache!: Table<CacheEntry, string>;
  diagnostics!: Table<Diagnostic, number>;
  constructor(name = 'readfold') {
    super(name);
    this.version(1).stores({
      operations: 'id, ownerId, [ownerId+entityKind+entityId]',
      outbox: 'id, ownerId, nextAttemptAt',
      metadata: 'key',
      cache: 'id',
      diagnostics: '++id, createdAt',
    });
    this.version(2)
      .stores({ diagnostics: '++id, createdAt, category, level' })
      .upgrade(async (transaction) => {
        await transaction
          .table('diagnostics')
          .toCollection()
          .modify((entry: Record<string, unknown>) => {
            entry.category = 'other';
            entry.level = 'error';
          });
      });
    this.version(3)
      .stores({ diagnostics: '++id, createdAt, category, level, lastSeen' })
      .upgrade(async (transaction) => {
        await transaction
          .table('diagnostics')
          .toCollection()
          .modify((entry: Partial<Diagnostic>) => {
            Object.assign(entry, sanitizeDiagnostic(entry));
          });
      });
  }
}

export class LocalRepository {
  readonly db: LocalDatabase;
  constructor(name?: string) {
    this.db = new LocalDatabase(name);
  }

  async getOperations(ownerId: string): Promise<UserOperation[]> {
    return (await this.db.operations.where('ownerId').equals(ownerId).toArray()).sort(compareOperations);
  }

  async record(
    ownerId: string,
    entityKind: EntityKind,
    entityId: string,
    payload: Record<string, unknown>,
  ): Promise<UserOperation> {
    return this.db.transaction('rw', this.db.operations, this.db.outbox, this.db.metadata, async () => {
      const existing = await this.db.metadata.get('deviceId');
      const deviceId = existing?.value ?? crypto.randomUUID();
      if (!existing) {
        await this.db.metadata.put({ key: 'deviceId', value: deviceId });
      }
      const lastTime = Number((await this.db.metadata.get(`clock:${deviceId}`))?.value ?? 0);
      const timestamp = Math.max(Date.now(), lastTime + 1);
      const operation = operationSchema.parse({
        id: crypto.randomUUID(),
        ownerId,
        deviceId,
        entityKind,
        entityId,
        payload,
        createdAt: new Date(timestamp).toISOString(),
      });
      await this.db.operations.add(operation);
      await this.db.outbox.add({ id: operation.id, ownerId, attempts: 0, nextAttemptAt: 0 });
      await this.db.metadata.put({ key: `clock:${deviceId}`, value: String(timestamp) });
      return operation;
    });
  }

  getOutbox(ownerId: string): Promise<OutboxEntry[]> {
    return this.db.outbox.where('ownerId').equals(ownerId).toArray();
  }

  async acknowledge(ids: string[]): Promise<void> {
    await this.db.outbox.bulkDelete(ids);
  }

  async retry(entries: OutboxEntry[], delayMs: number): Promise<void> {
    await this.db.transaction('rw', this.db.outbox, async () => {
      for (const entry of entries) {
        if (await this.db.outbox.get(entry.id)) {
          await this.db.outbox.put({ ...entry, attempts: entry.attempts + 1, nextAttemptAt: Date.now() + delayMs });
        }
      }
    });
  }

  async exportData(ownerId: string) {
    return { version: 1 as const, operations: await this.getOperations(ownerId) };
  }

  async importData(ownerId: string, data: unknown): Promise<void> {
    z.string().min(1).parse(ownerId);
    const parsed = exportSchema.parse(data);
    // Web Crypto must finish before opening an IndexedDB transaction.
    const imports = await Promise.all(
      parsed.operations.map(async (operation) => {
        const identity = JSON.stringify([ownerId, operation.ownerId, operation.id]);
        const digest =
          operation.ownerId === ownerId
            ? undefined
            : await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
        const id =
          digest === undefined
            ? operation.id
            : `copy.${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
        return { operation, id, key: `import:${identity}` };
      }),
    );
    await this.db.transaction('rw', this.db.operations, this.db.outbox, this.db.metadata, async () => {
      for (const imported of imports) {
        const { operation, key } = imported;
        // Imported data is explicitly copied into the selected owner, never moved.
        const mapping = await this.db.metadata.get(key);
        const legacy = mapping ? undefined : await this.db.metadata.get(`import:${ownerId}:${operation.id}`);
        const id = mapping?.value ?? legacy?.value ?? imported.id;
        const copied = { ...operation, id, ownerId };
        const existing = await this.db.operations.get(id);
        if ((mapping || legacy) && !existing) {
          throw new Error('Missing imported operation');
        }
        if (existing) {
          if (!sameOperation(existing, copied)) {
            throw new Error('Operation collision');
          }
          await this.db.metadata.put({ key, value: id });
          continue;
        }
        await this.db.operations.add(copied);
        await this.db.outbox.add({ id, ownerId, attempts: 0, nextAttemptAt: 0 });
        await this.db.metadata.put({ key, value: id });
      }
    });
  }

  async mergeGuest(ownerId: string): Promise<void> {
    if (ownerId === GUEST_OWNER) {
      throw new Error('An account owner is required');
    }
    await this.importData(ownerId, await this.exportData(GUEST_OWNER));
  }

  async getCursor(ownerId: string): Promise<number> {
    return Number((await this.db.metadata.get(`cursor:${ownerId}`))?.value ?? 0);
  }

  async setCursor(ownerId: string, cursor: number): Promise<void> {
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      throw new Error('Invalid cursor');
    }
    await this.db.metadata.put({ key: `cursor:${ownerId}`, value: String(cursor) });
  }

  async receive(ownerId: string, operations: UserOperation[], cursor: number): Promise<void> {
    const parsed = z.array(operationSchema).parse(operations);
    if (parsed.some((operation) => operation.ownerId !== ownerId)) {
      throw new Error('Owner mismatch');
    }
    await this.db.transaction('rw', this.db.operations, this.db.metadata, async () => {
      for (const operation of parsed) {
        const existing = await this.db.operations.get(operation.id);
        if (existing && !sameOperation(existing, operation)) {
          throw new Error('Operation collision');
        }
        if (!existing) {
          await this.db.operations.add(operation);
        }
      }
      await this.setCursor(ownerId, cursor);
    });
  }

  async diagnostic(code: string, status?: number, level: Diagnostic['level'] = 'error'): Promise<void> {
    await this.db.transaction('rw', this.db.diagnostics, async () => {
      await this.cleanupDiagnostics();
      const safe = sanitizeDiagnostic({ code, status, level, createdAt: Date.now(), lastSeen: Date.now(), count: 1 });
      const existing = await this.db.diagnostics
        .filter((entry) => entry.code === safe.code && entry.status === safe.status && entry.level === safe.level)
        .first();
      if (existing?.id !== undefined) {
        await this.db.diagnostics.update(existing.id, { count: existing.count + 1, lastSeen: Date.now() });
      } else {
        await this.db.diagnostics.add(safe);
      }
      const overflow = (await this.db.diagnostics.count()) - 100;
      if (overflow > 0) {
        const keys = await this.db.diagnostics.orderBy('lastSeen').limit(overflow).primaryKeys();
        await this.db.diagnostics.bulkDelete(keys);
      }
    });
  }

  async getCache(key: string): Promise<unknown> {
    return (await this.db.cache.get(key))?.json;
  }
  async setCache(key: string, data: unknown): Promise<void> {
    await this.db.cache.put({ id: key, json: data, updatedAt: Date.now() });
  }
  private async cleanupDiagnostics(): Promise<void> {
    await this.db.diagnostics
      .where('lastSeen')
      .below(Date.now() - diagnosticLifetime)
      .delete();
  }

  async exportDiagnostics(): Promise<Diagnostic[]> {
    await this.cleanupDiagnostics();
    return (await this.db.diagnostics.toArray()).map(sanitizeDiagnostic);
  }

  async diagnosticSummary(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const entry of await this.exportDiagnostics()) {
      const key = `${entry.category}:${entry.level}:${entry.code}`;
      counts[key] = (counts[key] ?? 0) + entry.count;
    }
    return counts;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sameOperation(a: UserOperation, b: UserOperation): boolean {
  return (
    canonical({ ...a, createdAt: Date.parse(a.createdAt) }) === canonical({ ...b, createdAt: Date.parse(b.createdAt) })
  );
}

function compareOperations(a: UserOperation, b: UserOperation): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function reduceOperations(operations: UserOperation[]) {
  const state = {
    preferences: { ...defaultPreferences },
    readings: Object.create(null) as Record<
      string,
      {
        sentenceIds: string[];
        sentenceId: string;
        position: number;
        maxPosition: number;
        updatedAt: string;
      }
    >,
    learning: Object.create(null) as Record<string, LearningStatus>,
    favorites: [] as string[],
    reviews: [] as UserOperation[],
  };
  const sorted = [...new Map(operations.map((operation) => [operation.id, operation])).values()].sort(
    compareOperations,
  );
  for (const operation of sorted) {
    const payload = operation.payload;
    switch (operation.entityKind) {
      case 'reading': {
        const reading = state.readings[operation.entityId] ?? {
          sentenceIds: [],
          sentenceId: '',
          position: 0,
          maxPosition: 0,
          updatedAt: operation.createdAt,
        };
        if (typeof payload.sentenceId === 'string') {
          if (!reading.sentenceIds.includes(payload.sentenceId)) {
            reading.sentenceIds.push(payload.sentenceId);
          }
          reading.sentenceId = payload.sentenceId;
        }
        if (typeof payload.position === 'number' && Number.isFinite(payload.position)) {
          reading.position = payload.position;
          reading.maxPosition = Math.max(reading.maxPosition, payload.position);
        }
        reading.updatedAt = operation.createdAt;
        state.readings[operation.entityId] = reading;
        break;
      }
      case 'learning': {
        if (payload.automatic === true && state.learning[operation.entityId]) {
          break;
        }
        if (['encountered', 'learning', 'known', 'mastered'].includes(String(payload.status))) {
          state.learning[operation.entityId] = payload.status as LearningStatus;
        }
        break;
      }
      case 'favorite': {
        if (payload.active === true && !state.favorites.includes(operation.entityId)) {
          state.favorites.push(operation.entityId);
        } else if (payload.active === false) {
          state.favorites = state.favorites.filter((id) => id !== operation.entityId);
        }
        break;
      }
      case 'preferences': {
        for (const key of Object.keys(defaultPreferences) as (keyof typeof defaultPreferences)[]) {
          if (typeof payload[key] === typeof defaultPreferences[key]) {
            Object.assign(state.preferences, { [key]: payload[key] });
          }
        }
        break;
      }
      case 'review': {
        state.reviews.push(operation);
        break;
      }
    }
  }
  return state;
}
