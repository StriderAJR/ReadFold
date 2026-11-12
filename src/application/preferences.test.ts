import { describe, expect, it } from 'vitest';
import { defaultPreferences } from '../domain/user-state';
import { reduceOperations } from '../infrastructure/local/repository';
import type { UserOperation } from '../domain/user-state';
describe('independent reader preferences', () => {
  it('retains independent layers and reading mode without changing position', () => {
    const reading: UserOperation = { id: '1', ownerId: 'guest', deviceId: 'test', entityKind: 'reading',
      entityId: 'demo/chapter', payload: { sentenceId: 's2', position: 1 }, createdAt: '2026-11-12T10:00:00Z' };
    const preferences: UserOperation = { ...reading, id: '2', entityKind: 'preferences', entityId: 'reader',
      payload: { furigana: false, romaji: true, mode: 'continuous' }, createdAt: '2026-11-12T10:00:01Z' };
    const reduced = reduceOperations([reading, preferences]);
    expect(reduced.preferences.furigana).toBe(false);
    expect(reduced.preferences.romaji).toBe(true);
    expect(reduced.preferences.natural).toBe(defaultPreferences.natural);
    expect(reduced.readings['demo/chapter'].sentenceId).toBe('s2');
  });
});
