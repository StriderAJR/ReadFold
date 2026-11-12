import 'fake-indexeddb/auto';
import { afterAll, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({
  push: vi.fn(),
  pull: vi.fn(async (cursor: number) => ({ operations: [], cursor })),
}));
vi.mock('../infrastructure/supabase', () => ({ createSupabaseServices: () => ({ transport, auth: {} }) }));
import { local, synchronize, useSession } from './runtime';

afterAll(async () => {
  await local.db.delete();
});
describe('sync consent', () => {
  it('never uploads pending edits when the persisted sync preference is disabled', async () => {
    useSession.getState().setSession({ appUserId: 'owner', authUserId: 'auth' });
    await local.record('owner', 'learning', 'neko', { status: 'known' });
    await local.record('owner', 'preferences', 'reader', { syncEnabled: false });
    await synchronize();
    expect(transport.push).not.toHaveBeenCalled();
    expect(transport.pull).not.toHaveBeenCalled();
    expect(await local.getOutbox('owner')).toHaveLength(2);
  });
});
