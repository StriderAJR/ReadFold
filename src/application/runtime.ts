import { QueryClient } from '@tanstack/react-query';
import { LocalRepository, GUEST_OWNER, reduceOperations } from '../infrastructure/local/repository';
import { createSupabaseServices } from '../infrastructure/supabase';
import { SyncEngine } from './sync';
import { create } from 'zustand';
import type { AppIdentity } from '../domain/user-state';
import { liveQuery } from 'dexie';

export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60_000 } } });
export const local = new LocalRepository();
export const services = createSupabaseServices();
export const syncEngine = services ? new SyncEngine(local, services.transport) : null;
interface SessionState {
  identity: AppIdentity | null;
  ready: boolean;
  error: boolean;
  setSession: (identity: AppIdentity | null, error?: boolean) => void;
}
export const useSession = create<SessionState>((set) => ({
  identity: null,
  ready: false,
  error: false,
  setSession: (identity, error = false) => set({ identity, ready: true, error }),
}));
export const useLocalFailure = create<{ failed: boolean; setFailed: (failed: boolean) => void }>((set) => ({
  failed: false,
  setFailed: (failed) => set({ failed }),
}));
export function currentOwner() {
  return useSession.getState().identity?.appUserId ?? GUEST_OWNER;
}
export async function refreshUserData() {
  await queryClient.invalidateQueries({ queryKey: ['user'] });
}
export async function synchronize() {
  const identity = useSession.getState().identity;
  if (identity && syncEngine) {
    const state = reduceOperations(await local.getOperations(identity.appUserId));
    if (!state.preferences.syncEnabled || useSession.getState().identity?.appUserId !== identity.appUserId) {
      return 'disabled';
    }
    await syncEngine.sync(identity.appUserId);
    await refreshUserData();
    return syncEngine.status;
  }
  return 'guest';
}

liveQuery(() => local.db.operations.count()).subscribe({
  next: () => {
    void refreshUserData();
  },
  error: () => {
    void local.diagnostic('storage_failed').catch(() => undefined);
  },
});
