import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AppIdentity, AuthService, RemotePage, SyncTransport, UserOperation } from '../../domain/user-state';

const remotePageSchema = z.object({
  operations: z
    .array(
      z
        .object({
          id: z.string().min(1).max(128),
          ownerId: z.string().uuid(),
          deviceId: z.string().min(1).max(128),
          entityKind: z.enum(['reading', 'learning', 'preferences', 'favorite', 'review']),
          entityId: z.string().min(1).max(512),
          payload: z.record(z.unknown()),
          createdAt: z.string().datetime({ offset: true }),
        })
        .strict(),
    )
    .max(100),
  cursor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
  status?: number;
  retryAfter?: string | null;
}
type SyncRpc = (name: 'push_operations' | 'pull_operations', parameters: Record<string, unknown>) => Promise<RpcResult>;
function syncError(error: { message: string }, status?: number, retryAfter?: string | null): Error {
  // PostgREST exposes HTTP status on the response rather than on the error object.
  return Object.assign(new Error(error.message), {
    status: status || undefined,
    retryAfter: retryAfter ?? (status === 429 ? 60 : undefined),
  });
}

export function servicesForClient(
  client: SupabaseClient,
  redirectTo: string,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
  syncRpc?: SyncRpc,
): { auth: AuthService; transport: SyncTransport } {
  const identityCache = new Map<string, string>();
  let resolvedAuthUserId: string | null = null;
  let authRevision = 0;
  function assertRevision(expected: number) {
    if (expected !== authRevision) {
      throw new Error('Authentication changed during identity lookup');
    }
  }
  function readCached(authUserId: string): AppIdentity | null {
    let appUserId = identityCache.get(authUserId);
    try {
      appUserId ??= (storage ?? globalThis.localStorage)?.getItem(`readfold.identity:${authUserId}`) ?? undefined;
    } catch {
      /* Browser storage may be disabled; the in-memory cache remains usable. */
    }
    if (!appUserId || !z.string().uuid().safeParse(appUserId).success) {
      return null;
    }
    identityCache.set(authUserId, appUserId);
    return { appUserId, authUserId };
  }
  async function identity(authUserId: string, expectedRevision: number): Promise<AppIdentity> {
    assertRevision(expectedRevision);
    const { data, error, status } = await client.rpc('ensure_app_user');
    assertRevision(expectedRevision);
    // The SDK may send its current token rather than the session that started this lookup.
    const { data: current, error: sessionError } = await client.auth.getSession();
    assertRevision(expectedRevision);
    if (sessionError) {
      throw sessionError;
    }
    if (current.session?.user.id !== authUserId) {
      throw new Error('Authentication changed during identity lookup');
    }
    if (error) {
      const transient = !status || status === 408 || status === 429 || status >= 500;
      const cached = transient ? readCached(authUserId) : null;
      if (cached) {
        return cached;
      }
      throw syncError(error, status);
    }
    if (!z.string().uuid().safeParse(data).success) {
      throw new Error('Invalid application identity response');
    }
    identityCache.set(authUserId, data as string);
    try {
      (storage ?? globalThis.localStorage)?.setItem(`readfold.identity:${authUserId}`, data as string);
    } catch {
      /* Identity persistence must not prevent a valid login. */
    }
    return { appUserId: data, authUserId };
  }

  const auth: AuthService = {
    async restore() {
      const expectedRevision = authRevision;
      const { data, error } = await client.auth.getSession();
      assertRevision(expectedRevision);
      if (error) {
        throw error;
      }
      const restored = data.session ? await identity(data.session.user.id, expectedRevision) : null;
      assertRevision(expectedRevision);
      resolvedAuthUserId = restored?.authUserId ?? null;
      return restored;
    },
    async signIn(provider) {
      const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) {
        throw error;
      }
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) {
        throw error;
      }
    },
    subscribe(callback, onError?: (error: unknown) => void) {
      let active = true;
      let revision = 0;
      let lastDeliveredAuthId = resolvedAuthUserId;
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const expectedRevision = ++authRevision;
        const current = ++revision;
        // Supabase auth callbacks hold an internal lock; run RPCs after the callback returns.
        setTimeout(() => {
          if (!active || current !== revision) {
            return;
          }
          if (!session) {
            lastDeliveredAuthId = null;
            resolvedAuthUserId = null;
            callback(null);
            return;
          }
          if (lastDeliveredAuthId && lastDeliveredAuthId !== session.user.id) {
            // Never retain account A while the SDK is already authenticated as account B.
            lastDeliveredAuthId = null;
            resolvedAuthUserId = null;
            callback(null);
          }
          void identity(session.user.id, expectedRevision)
            .then((value) => {
              if (active && current === revision) {
                lastDeliveredAuthId = value.authUserId;
                resolvedAuthUserId = value.authUserId;
                callback(value);
              }
            })
            .catch((error: unknown) => {
              if (active && current === revision) {
                onError?.(error);
              }
            });
        }, 0);
      });
      return () => {
        active = false;
        revision++;
        data.subscription.unsubscribe();
      };
    },
  };

  const callSync: SyncRpc =
    syncRpc ??
    (async (name, parameters) => {
      const { data, error, status } = await client.rpc(name, parameters);
      return { data, error, status };
    });
  const transport: SyncTransport = {
    async push(operations: UserOperation[]) {
      if (!operations.length) {
        return;
      }
      let batch: UserOperation[] = [];
      let bytes = 2;
      const flush = async () => {
        const { error, status, retryAfter } = await callSync('push_operations', { p_operations: batch });
        if (error) {
          throw syncError(error, status, retryAfter);
        }
        batch = [];
        bytes = 2;
      };
      for (const operation of operations) {
        // Leave headroom for PostgreSQL JSONB whitespace and numeric normalization.
        const size = new TextEncoder().encode(JSON.stringify(operation)).length;
        if (size > 131072) {
          throw Object.assign(new Error('Operation too large'), { status: 413 });
        }
        // Ten valid envelopes fit below the server's 1 MiB JSONB cap, even after numeric expansion.
        if (batch.length && (batch.length >= 10 || bytes + size > 262144)) {
          await flush();
        }
        batch.push(operation);
        bytes += size + 1;
      }
      if (batch.length) {
        await flush();
      }
    },
    async pull(cursor: number): Promise<RemotePage> {
      if (!Number.isSafeInteger(cursor) || cursor < 0) {
        throw new Error('Invalid sync cursor');
      }
      const { data, error, status, retryAfter } = await callSync('pull_operations', { p_cursor: cursor });
      if (error) {
        throw syncError(error, status, retryAfter);
      }
      const page = remotePageSchema.parse(data);
      if (page.cursor < cursor) {
        throw new Error('Synchronization cursor moved backwards');
      }
      return page;
    },
  };
  return { auth, transport };
}

export function createSupabaseServices(): { auth: AuthService; transport: SyncTransport } | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return null;
  }
  const client = createClient(url, key, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const syncRpc: SyncRpc = async (name, parameters) => {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) {
      throw syncError({ message: 'Authentication required' }, 401);
    }
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parameters),
      signal: AbortSignal.timeout(30_000),
    });
    return {
      data: response.ok && response.status !== 204 ? await response.json() : null,
      error: response.ok ? null : { message: 'Synchronization request failed' },
      status: response.status,
      retryAfter: response.headers.get('Retry-After'),
    };
  };
  return servicesForClient(client, new URL(import.meta.env.BASE_URL, window.location.origin).href, undefined, syncRpc);
}
