import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { servicesForClient } from './index';
import type { UserOperation } from '../../domain/user-state';

function fixture() {
  const rpc = vi.fn().mockResolvedValue({ data: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', error: null });
  const unsubscribe = vi.fn();
  let listener: (event: string, session: { user: { id: string } } | null) => void = () => {};
  const sdk = {
    rpc,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'auth-id' } } }, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn((callback: typeof listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe } } };
      }),
    },
  };
  const services = servicesForClient(sdk as unknown as SupabaseClient, 'https://example.test/ReadFold/');
  return {
    sdk,
    services,
    unsubscribe,
    emit: (session: { user: { id: string } } | null) => {
      sdk.auth.getSession.mockResolvedValue({ data: { session }, error: null });
      listener('SIGNED_IN', session);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Supabase service adapters', () => {
  it('honors transport Retry-After seconds and dates', async () => {
    const { sdk } = fixture();
    for (const retryAfter of ['120', 'Thu, 12 Nov 2026 18:00:00 GMT']) {
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'Rate limited' }, status: 429, retryAfter });
      const adapter = servicesForClient(sdk as unknown as SupabaseClient, 'https://example.test/', undefined, rpc);
      await expect(adapter.transport.pull(0)).rejects.toMatchObject({ status: 429, retryAfter });
    }
  });
  it('restores separate app and auth identities using the authenticated RPC', async () => {
    const { services, sdk } = fixture();
    await expect(services.auth.restore()).resolves.toEqual({
      appUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      authUserId: 'auth-id',
    });
    expect(sdk.rpc).toHaveBeenCalledWith('ensure_app_user');
    await services.auth.signIn('github');
    expect(sdk.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: { redirectTo: 'https://example.test/ReadFold/' },
    });
  });

  it('propagates restore, sign-in, sign-out and transport failures', async () => {
    const { services, sdk } = fixture();
    const error = new Error('Unavailable');
    sdk.auth.getSession.mockResolvedValue({ data: { session: null }, error });
    sdk.auth.signInWithOAuth.mockResolvedValue({ error });
    sdk.auth.signOut.mockResolvedValue({ error });
    sdk.rpc.mockResolvedValue({ data: null, error });
    await expect(services.auth.restore()).rejects.toBe(error);
    await expect(services.auth.signIn('google')).rejects.toBe(error);
    await expect(services.auth.signOut()).rejects.toBe(error);
    await expect(services.transport.pull(0)).rejects.toThrow('Unavailable');
    await expect(services.transport.push([{} as UserOperation])).rejects.toThrow('Unavailable');
  });

  it('defers auth RPCs, ignores stale sessions, and unsubscribes', async () => {
    vi.useFakeTimers();
    const { services, sdk, emit, unsubscribe } = fixture();
    const callback = vi.fn();
    const stop = services.auth.subscribe(callback);
    emit({ user: { id: 'old-auth' } });
    emit(null);
    expect(sdk.rpc).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(callback).toHaveBeenCalledExactlyOnceWith(null);
    emit({ user: { id: 'new-auth' } });
    stop();
    await vi.runAllTimersAsync();
    expect(sdk.rpc).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('handles subscription RPC errors without unhandled rejection', async () => {
    vi.useFakeTimers();
    const { services, sdk, emit } = fixture();
    sdk.rpc.mockResolvedValue({ data: null, error: new Error('Unavailable') });
    const callback = vi.fn();
    const onError = vi.fn();
    services.auth.subscribe(callback, onError);
    emit({ user: { id: 'auth-id' } });
    await vi.runAllTimersAsync();
    expect(callback).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('preserves the matching account offline across restore and subscription', async () => {
    vi.useFakeTimers();
    const { services, sdk, emit } = fixture();
    const previous = await services.auth.restore();
    sdk.rpc.mockResolvedValue({ data: null, error: { message: 'Offline' }, status: 0 });
    await expect(services.auth.restore()).resolves.toEqual(previous);
    const callback = vi.fn();
    const onError = vi.fn();
    services.auth.subscribe(callback, onError);
    emit({ user: { id: 'auth-id' } });
    await vi.runAllTimersAsync();
    expect(callback).toHaveBeenCalledExactlyOnceWith(previous);
    emit({ user: { id: 'different-account' } });
    await vi.runAllTimersAsync();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith(null);
    expect(onError).toHaveBeenCalledOnce();
    sdk.rpc.mockResolvedValue({ data: null, error: { message: 'Forbidden' }, status: 403 });
    await expect(services.auth.restore()).rejects.toMatchObject({ status: 403 });
  });

  it('clears a restored account before a different account lookup fails', async () => {
    vi.useFakeTimers();
    const { services, sdk, emit } = fixture();
    await services.auth.restore();
    const callback = vi.fn();
    const onError = vi.fn();
    services.auth.subscribe(callback, onError);
    sdk.rpc.mockResolvedValue({ data: null, error: { message: 'Offline' }, status: 0 });
    emit({ user: { id: 'different-account' } });
    await vi.runAllTimersAsync();
    expect(callback).toHaveBeenCalledExactlyOnceWith(null);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('restores persisted nonsecret identity and tolerates disabled browser storage', async () => {
    const { sdk } = fixture();
    const storage = { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() };
    const first = servicesForClient(sdk as unknown as SupabaseClient, 'https://example.test/', storage);
    const expected = await first.auth.restore();
    expect(storage.setItem).toHaveBeenCalledWith('readfold.identity:auth-id', expected?.appUserId);
    storage.getItem.mockReturnValue(expected?.appUserId);
    sdk.rpc.mockResolvedValue({ data: null, error: { message: 'Offline' }, status: 0 });
    const second = servicesForClient(sdk as unknown as SupabaseClient, 'https://example.test/', storage);
    await expect(second.auth.restore()).resolves.toEqual(expected);
    storage.getItem.mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    await expect(second.auth.restore()).resolves.toEqual(expected);
    const uncached = servicesForClient(sdk as unknown as SupabaseClient, 'https://example.test/', storage);
    await expect(uncached.auth.restore()).rejects.toThrow('Offline');
    sdk.rpc.mockResolvedValue({ data: expected?.appUserId, error: null });
    storage.setItem.mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    await expect(second.auth.restore()).resolves.toEqual(expected);
  });

  it.each([false, true])('does not cache a stale RPC identity after an account switch (ABA: %s)', async (aba) => {
    vi.useFakeTimers();
    const { sdk, emit } = fixture();
    const storage = { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() };
    const services = servicesForClient(sdk as unknown as SupabaseClient, 'https://example.test/', storage);
    services.auth.subscribe(vi.fn());
    let finishRpc: (value: { data: string; error: null }) => void = () => {};
    sdk.rpc.mockReturnValueOnce(
      new Promise<{ data: string; error: null }>((resolve) => {
        finishRpc = resolve;
      }),
    );
    const restoring = services.auth.restore();
    await Promise.resolve();
    expect(sdk.rpc).toHaveBeenCalledOnce();
    emit({ user: { id: 'account-b' } });
    if (aba) {
      emit({ user: { id: 'auth-id' } });
    }
    const rejection = expect(restoring).rejects.toThrow('Authentication changed');
    finishRpc({ data: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', error: null });
    await rejection;
    expect(storage.setItem).not.toHaveBeenCalled();
    emit({ user: { id: 'auth-id' } });
    sdk.rpc.mockResolvedValue({ data: null, error: { message: 'Offline' }, status: 0 });
    await expect(services.auth.restore()).rejects.toThrow('Offline');
  });

  it('checks the current SDK account before using an offline identity cache without auth events', async () => {
    const { services, sdk } = fixture();
    await services.auth.restore();
    let finishRpc: (value: { data: null; error: { message: string }; status: number }) => void = () => {};
    sdk.rpc.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRpc = resolve;
      }),
    );
    const restoring = services.auth.restore();
    await Promise.resolve();
    sdk.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'account-b' } } }, error: null });
    const rejection = expect(restoring).rejects.toThrow('Authentication changed');
    finishRpc({ data: null, error: { message: 'Offline' }, status: 0 });
    await rejection;
  });

  it('rejects invalid cursors and malformed remote operations', async () => {
    const { services, sdk } = fixture();
    await expect(services.transport.pull(-1)).rejects.toThrow('Invalid sync cursor');
    expect(sdk.rpc).not.toHaveBeenCalled();
    sdk.rpc.mockResolvedValue({ data: { cursor: 1, operations: [{ entityKind: 'admin' }] }, error: null });
    await expect(services.transport.pull(0)).rejects.toThrow();
    sdk.rpc.mockResolvedValue({ data: { cursor: 1, operations: [] }, error: null });
    await expect(services.transport.pull(2)).rejects.toThrow('backwards');
    sdk.rpc.mockResolvedValue({ data: { cursor: 2, operations: [] }, error: null });
    await expect(services.transport.pull(2)).resolves.toEqual({ cursor: 2, operations: [] });
  });

  it('maps HTTP status and rate-limit delay and chunks large outboxes', async () => {
    const { services, sdk } = fixture();
    sdk.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Rate limited' }, status: 429 });
    await expect(services.transport.pull(0)).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    sdk.rpc.mockResolvedValue({ data: null, error: null, status: 204 });
    const operations = Array.from({ length: 21 }, (_, i) => ({ id: String(i) }) as UserOperation);
    await services.transport.push(operations);
    expect(sdk.rpc.mock.calls.slice(1).map((call) => call[1].p_operations.length)).toEqual([10, 10, 1]);
  });

  it('accepts imported ISO timestamps with timezone offsets without rewriting them', async () => {
    const { services, sdk } = fixture();
    const operation: UserOperation = {
      id: 'offset-operation',
      ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deviceId: 'device',
      entityKind: 'favorite',
      entityId: 'book',
      payload: { active: true },
      createdAt: '2026-11-12T12:00:00.000+05:00',
    };
    sdk.rpc.mockResolvedValue({ data: { operations: [operation], cursor: 1 }, error: null });
    await expect(services.transport.pull(0)).resolves.toEqual({ operations: [operation], cursor: 1 });
  });
});
