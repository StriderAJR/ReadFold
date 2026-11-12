import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncTransport, UserOperation } from '../domain/user-state';
import { LocalRepository, reduceOperations } from '../infrastructure/local/repository';
import { retryDelay, SyncEngine } from './sync';

const repositories: LocalRepository[] = [];
function repository() {
  const repo = new LocalRepository(`test-${crypto.randomUUID()}`);
  repositories.push(repo);
  return repo;
}
afterEach(async () => {
  for (const repo of repositories.splice(0)) {
    await repo.db.delete();
  }
  vi.restoreAllMocks();
});
function transport(overrides: Partial<SyncTransport> = {}): SyncTransport {
  return { push: vi.fn(async () => {}), pull: vi.fn(async (cursor) => ({ operations: [], cursor })), ...overrides };
}

describe('local persistence and reconciliation', () => {
  it('orders offset timestamps chronologically with locale-independent ID ties', async () => {
    const repo = repository();
    const base = {
      id: 'first',
      ownerId: 'a',
      deviceId: 'test',
      entityKind: 'learning' as const,
      entityId: 'neko',
      payload: { status: 'learning' },
      createdAt: '2026-11-12T12:00:00+05:00',
    };
    const later = { ...base, id: 'second', payload: { status: 'known' }, createdAt: '2026-11-12T10:00:00Z' };
    await repo.importData('a', { version: 1, operations: [later, base] });
    expect((await repo.getOperations('a')).map((operation) => operation.id)).toEqual(['first', 'second']);
    const tied = [
      { ...base, id: 'z', payload: { status: 'known' } },
      { ...base, id: 'a' },
    ];
    expect(reduceOperations(tied).learning.neko).toBe('known');
  });
  it('automatic encounters never downgrade explicit learning across devices', async () => {
    const repo = repository();
    await repo.record('a', 'learning', 'neko', { status: 'known' });
    await repo.record('a', 'learning', 'neko', { status: 'encountered', automatic: true });
    expect(reduceOperations(await repo.getOperations('a')).learning.neko).toBe('known');
    await repo.record('a', 'learning', 'neko', { status: 'encountered' });
    expect(reduceOperations(await repo.getOperations('a')).learning.neko).toBe('encountered');
    await expect(repo.record('a', 'learning', 'neko', { status: 'known', automatic: true })).rejects.toThrow();
  });
  it('rejects oversized or invalid operations atomically without poisoning outbox', async () => {
    const repo = repository();
    await expect(repo.record('a', 'learning', 'x'.repeat(513), { status: 'known' })).rejects.toThrow();
    await expect(repo.record('a', 'review', 'word', { rating: 'good', note: 'x'.repeat(48 * 1024) })).rejects.toThrow();
    await expect(repo.record('a', 'review', 'word', { rating: 'good', invalid: Number.NaN })).rejects.toThrow();
    const operation = await repo.record('a', 'learning', 'word', { status: 'known' });
    await expect(
      repo.importData('a', { version: 1, operations: [{ ...operation, deviceId: 'x'.repeat(129) }] }),
    ).rejects.toThrow();
    await expect(
      repo.importData('a', { version: 1, operations: [{ ...operation, id: 'x'.repeat(129) }] }),
    ).rejects.toThrow();
    expect(await repo.getOperations('a')).toEqual([operation]);
    expect(await repo.getOutbox('a')).toMatchObject([{ id: operation.id }]);
  });

  it('keeps sequential intent order across clock rollback and independent connections', async () => {
    const repo = repository();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const first = await repo.record('a', 'learning', 'word', { status: 'known' });
    const secondTab = new LocalRepository(repo.db.name);
    try {
      const second = await secondTab.record('a', 'learning', 'word', { status: 'learning' });
      vi.spyOn(Date, 'now').mockReturnValue(500);
      const third = await repo.record('a', 'learning', 'word', { status: 'mastered' });
      expect(Date.parse(second.createdAt)).toBe(Date.parse(first.createdAt) + 1);
      expect(Date.parse(third.createdAt)).toBe(Date.parse(second.createdAt) + 1);
      expect(reduceOperations(await repo.getOperations('a')).learning.word).toBe('mastered');
    } finally {
      secondTab.db.close();
    }
  });

  it('reduces prototype-like entity IDs without inherited objects or prototype mutation', async () => {
    const repo = repository();
    for (const id of ['constructor', '__proto__', 'toString']) {
      await repo.record('a', 'reading', id, { sentenceId: 'sentence', position: 1 });
      await repo.record('a', 'learning', id, { status: 'known' });
    }
    const state = reduceOperations(await repo.getOperations('a'));
    expect(Object.getPrototypeOf(state.readings)).toBeNull();
    expect(Object.getPrototypeOf(state.learning)).toBeNull();
    for (const id of ['constructor', '__proto__', 'toString']) {
      expect(state.readings[id].sentenceIds).toEqual(['sentence']);
      expect(state.learning[id]).toBe('known');
    }
  });

  it('upgrades v1 without changing pending operation IDs or account cursor', async () => {
    const name = `migration-${crypto.randomUUID()}`;
    const previous = new Dexie(name);
    previous.version(1).stores({
      operations: 'id, ownerId, [ownerId+entityKind+entityId]',
      outbox: 'id, ownerId, nextAttemptAt',
      metadata: 'key',
      cache: 'id',
      diagnostics: '++id, createdAt',
    });
    const operation: UserOperation = {
      id: crypto.randomUUID(),
      ownerId: 'a',
      deviceId: 'd',
      entityKind: 'learning',
      entityId: 'word',
      payload: { status: 'known' },
      createdAt: new Date().toISOString(),
    };
    await previous.table('operations').add(operation);
    await previous.table('outbox').add({ id: operation.id, ownerId: 'a', attempts: 3, nextAttemptAt: 123 });
    await previous.table('metadata').put({ key: 'cursor:a', value: '5' });
    await previous.table('diagnostics').add({ code: 'sync_failed', createdAt: Date.now() });
    previous.close();
    const repo = new LocalRepository(name);
    repositories.push(repo);
    expect(await repo.getOperations('a')).toEqual([operation]);
    expect(await repo.getOutbox('a')).toEqual([{ id: operation.id, ownerId: 'a', attempts: 3, nextAttemptAt: 123 }]);
    expect(await repo.getCursor('a')).toBe(5);
    expect(await repo.exportDiagnostics()).toMatchObject([{ category: 'sync', level: 'error', count: 1 }]);
  });

  it('bounds and redacts diagnostics and aggregates category/level counts', async () => {
    const repo = repository();
    for (let i = 0; i < 102; i++) {
      await repo.diagnostic('sync_failed', 503);
    }
    await repo.diagnostic('private-message-token@example.test', 12345);
    const diagnostics = await repo.exportDiagnostics();
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.at(-1)).toMatchObject({ code: 'other', category: 'other', level: 'error' });
    expect(JSON.stringify(diagnostics)).not.toContain('private-message');
    expect(await repo.diagnosticSummary()).toEqual({ 'sync:error:sync_failed': 102, 'other:error:other': 1 });
  });

  it('expires diagnostics after seven days, sanitizes legacy stored fields, and leaves operations intact', async () => {
    const repo = repository();
    const operation = await repo.record('a', 'review', 'word', { rating: 'good' });
    await repo.diagnostic('sync_failed', 503);
    await repo.db.diagnostics.add({
      code: 'secret@example.test',
      category: 'other',
      level: 'error',
      count: 1,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      status: 12345,
    });
    const exported = await repo.exportDiagnostics();
    expect(JSON.stringify(exported)).not.toContain('secret');
    expect(exported.at(-1)).toMatchObject({ code: 'other', status: undefined });
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);
    expect(await repo.exportDiagnostics()).toEqual([]);
    expect(await repo.db.diagnostics.count()).toBe(0);
    expect(await repo.getOperations('a')).toEqual([operation]);
    expect(await repo.getOutbox('a')).toMatchObject([{ id: operation.id }]);
  });

  it('retains at most 100 distinct diagnostic aggregates', async () => {
    const repo = repository();
    for (let status = 100; status < 205; status++) {
      await repo.diagnostic('sync_failed', status);
    }
    expect(await repo.exportDiagnostics()).toHaveLength(100);
  });

  it('rejects arbitrary review fields and exponent expansion before committing anything', async () => {
    const repo = repository();
    await expect(repo.record('a', 'review', 'word', { rating: 'good', dueAt: 1e300 })).rejects.toThrow();
    await expect(repo.record('a', 'review', 'word', { rating: 'good', extra: [1e300] })).rejects.toThrow();
    await expect(repo.record('a', 'learning', 'word', { status: 'known', extra: 'unexpected' })).rejects.toThrow();
    expect(await repo.getOutbox('a')).toEqual([]);
    expect(await repo.getOperations('a')).toEqual([]);
  });

  it('rolls back the operation if outbox persistence fails', async () => {
    const repo = repository();
    vi.spyOn(repo.db.outbox, 'add').mockRejectedValueOnce(new Error('quota'));
    await expect(repo.record('guest', 'learning', 'word', { status: 'known' })).rejects.toThrow('quota');
    expect(await repo.getOperations('guest')).toEqual([]);
  });

  it('isolates owners and explicitly copies guest history once, keeping the original', async () => {
    const repo = repository();
    await repo.record('guest', 'review', 'word', { rating: 'good' });
    await repo.record('account-b', 'learning', 'other', { status: 'known' });
    expect(await repo.getOperations('account-a')).toHaveLength(0);
    await repo.mergeGuest('account-a');
    await repo.mergeGuest('account-a');
    expect(await repo.getOperations('account-a')).toHaveLength(1);
    expect(await repo.getOperations('guest')).toHaveLength(1);
    expect(await repo.getOperations('account-b')).toHaveLength(1);
    expect(await repo.getOutbox('account-a')).toHaveLength(1);
    await repo.importData('account-a', await repo.exportData('account-a'));
    expect(await repo.getOperations('account-a')).toHaveLength(1);
  });

  it('serializes simultaneous guest merges from independent connections', async () => {
    const repo = repository();
    await repo.record('guest', 'review', 'word', { rating: 'good' });
    const secondTab = new LocalRepository(repo.db.name);
    try {
      await Promise.all([repo.mergeGuest('a'), secondTab.mergeGuest('a')]);
      expect(await repo.getOperations('a')).toHaveLength(1);
      expect(await secondTab.getOutbox('a')).toHaveLength(1);
    } finally {
      secondTab.db.close();
    }
  });

  it('validates the whole import before writing and preserves cursor after rejected remote rows', async () => {
    const repo = repository();
    const operation = await repo.record('a', 'favorite', 'book', { active: true });
    await expect(repo.importData('a', { version: 1, operations: [operation, { invalid: true }] })).rejects.toThrow();
    expect(await repo.getOperations('a')).toHaveLength(1);
    await expect(repo.receive('a', [{ ...operation, ownerId: 'b' }], 12)).rejects.toThrow('Owner mismatch');
    expect(await repo.getCursor('a')).toBe(0);
    await repo.receive('a', [{ ...operation, payload: { active: true } }], 2);
    expect(await repo.getCursor('a')).toBe(2);
    expect(await repo.getCursor('b')).toBe(0);
  });

  it('reduces conflicts deterministically, preserves reviews and read set, distinguishes last from maximum', async () => {
    const base: UserOperation = {
      id: '1',
      ownerId: 'a',
      deviceId: 'd',
      entityId: 'book/ch',
      entityKind: 'reading',
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: { sentenceId: 's9', position: 9 },
    };
    const operations: UserOperation[] = [
      base,
      { ...base, id: '2', payload: { sentenceId: 's2', position: 2 } },
      { ...base, id: '3', entityKind: 'review', payload: { rating: 'again' } },
      { ...base, id: '4', entityKind: 'review', payload: { rating: 'good' } },
      { ...base, id: '5', entityKind: 'learning', payload: { status: 'known' } },
      { ...base, id: '6', entityKind: 'learning', payload: { status: 'learning' } },
    ];
    const result = reduceOperations(operations);
    expect(result).toEqual(reduceOperations([...operations].reverse()));
    expect(result.readings['book/ch']).toMatchObject({ position: 2, maxPosition: 9, sentenceIds: ['s9', 's2'] });
    expect(result.reviews).toHaveLength(2);
    expect(result.learning['book/ch']).toBe('learning');
  });
});

describe('sync failure and recovery', () => {
  it('keeps a confirmed push acknowledged if pull fails and retries pull without resending', async () => {
    const repo = repository();
    await repo.record('a', 'review', 'word', { rating: 'good' });
    const remote = transport({
      pull: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ operations: [], cursor: 0 }),
    });
    const engine = new SyncEngine(repo, remote);
    await engine.sync('a');
    expect(await repo.getOutbox('a')).toHaveLength(0);
    expect(engine.status).toBe('offline');
    await engine.sync('a');
    expect(remote.push).toHaveBeenCalledTimes(1);
    expect(engine.status).toBe('synced');
  });

  it('only acknowledges the pushed snapshot while a new edit arrives in flight', async () => {
    const repo = repository();
    const first = await repo.record('a', 'learning', 'word', { status: 'known' });
    const remote = transport({
      push: async (operations) => {
        expect(operations.map((operation) => operation.id)).toEqual([first.id]);
        await repo.record('a', 'learning', 'word', { status: 'learning' });
      },
    });
    await new SyncEngine(repo, remote).sync('a');
    expect(await repo.getOutbox('a')).toHaveLength(1);
    expect(await repo.getOperations('a')).toHaveLength(2);
  });

  it.each([401, 403, 409, 429, 503])(
    'retains immutable operations on HTTP %s and recovers after retry',
    async (status) => {
      const repo = repository();
      const operation = await repo.record('a', 'review', 'word', { rating: 'good' });
      const push = vi.fn().mockRejectedValueOnce({ status, retryAfter: 0 }).mockResolvedValue(undefined);
      const engine = new SyncEngine(repo, transport({ push }));
      await engine.sync('a');
      expect(await repo.getOutbox('a')).toMatchObject([{ id: operation.id, attempts: 1 }]);
      await engine.sync('a');
      expect(await repo.getOutbox('a')).toEqual([]);
      expect(await repo.getOperations('a')).toEqual([operation]);
      expect(engine.status).toBe('synced');
    },
  );

  it('persists backoff across repository restart and does not push before it is due', async () => {
    const repo = repository();
    await repo.record('a', 'review', 'word', { rating: 'good' });
    const push = vi.fn().mockRejectedValue({ status: 429, retryAfter: 60 });
    await new SyncEngine(repo, transport({ push })).sync('a');
    const reopened = new LocalRepository(repo.db.name);
    try {
      await new SyncEngine(reopened, transport({ push })).sync('a');
      expect(push).toHaveBeenCalledTimes(1);
      expect((await reopened.getOutbox('a'))[0].nextAttemptAt).toBeGreaterThan(Date.now());
    } finally {
      reopened.db.close();
    }
  });

  it('replays canonical remote rows and persists each page with its cursor', async () => {
    const repo = repository();
    const local = await repo.record('a', 'favorite', 'book', { active: true });
    const pull = vi
      .fn()
      .mockResolvedValueOnce({ operations: [local], cursor: 4 })
      .mockResolvedValueOnce({ operations: [], cursor: 4 });
    await new SyncEngine(repo, transport({ pull })).sync('a');
    expect(await repo.getOperations('a')).toHaveLength(1);
    expect(await repo.getCursor('a')).toBe(4);
    expect(pull).toHaveBeenLastCalledWith(4);
  });

  it('supports Retry-After seconds and dates', () => {
    expect(retryDelay(5, '30')).toBe(30_000);
    expect(retryDelay(5, 'Thu, 01 Jan 2026 00:01:00 GMT', Date.parse('2026-01-01T00:00:00Z'))).toBe(60_000);
  });
});
