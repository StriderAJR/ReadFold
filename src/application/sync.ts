import type { SyncTransport } from '../domain/user-state';
import { GUEST_OWNER, LocalRepository } from '../infrastructure/local/repository';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'auth-required' | 'conflict' | 'retrying';
export interface SyncFailure {
  status?: number;
  retryAfter?: string | number;
}

export function retryDelay(attempt: number, retryAfter?: string | number, now = Date.now()): number {
  const seconds = typeof retryAfter === 'number' ? retryAfter : Number(retryAfter);
  if (retryAfter !== undefined && Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  if (typeof retryAfter === 'string') {
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.max(0, date - now);
    }
  }
  return Math.min(300_000, 1000 * 2 ** Math.min(attempt, 8)) * (0.75 + Math.random() * 0.5);
}

export class SyncEngine {
  status: SyncStatus = 'idle';
  private running = new Map<string, Promise<void>>();
  constructor(
    private repository: LocalRepository,
    private transport: SyncTransport,
  ) {}

  sync(ownerId: string): Promise<void> {
    if (ownerId === GUEST_OWNER) {
      return Promise.resolve();
    }
    const existing = this.running.get(ownerId);
    if (existing) {
      return existing;
    }
    const task = this.withLock(ownerId).finally(() => {
      this.running.delete(ownerId);
    });
    this.running.set(ownerId, task);
    return task;
  }

  private async withLock(ownerId: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request(`readfold-sync:${ownerId}`, () => this.run(ownerId));
    } else {
      await this.run(ownerId);
    }
  }

  private async run(ownerId: string): Promise<void> {
    this.status = 'syncing';
    const entries = (await this.repository.getOutbox(ownerId)).filter((entry) => entry.nextAttemptAt <= Date.now());
    let pending = entries;
    try {
      if (entries.length) {
        const ids = new Set(entries.map((entry) => entry.id));
        const operations = (await this.repository.getOperations(ownerId)).filter((operation) => ids.has(operation.id));
        await this.transport.push(operations);
        await this.repository.acknowledge(entries.map((entry) => entry.id));
        pending = [];
      }
      let cursor = await this.repository.getCursor(ownerId);
      // The remote contract returns a bounded page and its last ledger sequence.
      for (;;) {
        const page = await this.transport.pull(cursor);
        if (!Number.isSafeInteger(page.cursor) || page.cursor < cursor) {
          throw new Error('Invalid remote cursor');
        }
        await this.repository.receive(ownerId, page.operations, page.cursor);
        if (page.cursor === cursor || page.operations.length === 0) {
          break;
        }
        cursor = page.cursor;
      }
      this.status = (await this.repository.getOutbox(ownerId)).length ? 'retrying' : 'synced';
    } catch (error: unknown) {
      const failure = typeof error === 'object' && error !== null ? (error as SyncFailure) : {};
      const status = failure.status;
      this.status =
        status === 401 || status === 403
          ? 'auth-required'
          : status === 409
            ? 'conflict'
            : status === undefined
              ? 'offline'
              : 'retrying';
      const attempt = Math.max(0, ...pending.map((entry) => entry.attempts));
      await this.repository.retry(pending, retryDelay(attempt, failure.retryAfter));
      await this.repository.diagnostic('sync_failed', status);
    }
  }
}
