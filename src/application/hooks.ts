import { useMutation, useQuery } from '@tanstack/react-query';
import { defaultPreferences, type EntityKind, type ReaderPreferences } from '../domain/user-state';
import { reduceOperations } from '../infrastructure/local/repository';
import { contentProvider } from '../infrastructure/content-provider';
import { local, refreshUserData, synchronize, syncEngine, useSession, useLocalFailure } from './runtime';
import { z } from 'zod';
import type { BookMetadata, Chapter, Sentence } from '../domain/content';

export const preferencesSchema = z.object({
  language: z.enum(['ru', 'en']),
  theme: z.enum(['light', 'dark', 'system']),
  fontSize: z.number().min(16).max(42),
  readingFontSize: z.number().min(10).max(32),
  translationFontSize: z.number().min(10).max(32),
  wordsFontSize: z.number().min(10).max(32),
  kanjiFontSize: z.number().min(10).max(32),
  grammarFontSize: z.number().min(10).max(32),
  lineHeight: z.number().min(1.4).max(3),
  width: z.number().min(480).max(1100),
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
  dailyReviewLimit: z.number().int().min(1).max(100),
});
export function safePreferences(input: Record<string, unknown>): ReaderPreferences {
  const result = { ...defaultPreferences };
  for (const key of Object.keys(defaultPreferences) as (keyof ReaderPreferences)[]) {
    const parsed = preferencesSchema.shape[key].safeParse(input[key]);
    if (parsed.success) {
      Object.assign(result, { [key]: parsed.data });
    }
  }
  return result;
}
export function useUserData() {
  const identity = useSession((state) => state.identity);
  const owner = identity?.appUserId ?? 'guest';
  const query = useQuery({
    queryKey: ['user', owner],
    queryFn: async () => {
      const operations = await local.getOperations(owner);
      return { ...reduceOperations(operations), operations };
    },
  });
  const mutate = useMutation({
    mutationFn: async (input: { kind: EntityKind; id: string; payload: Record<string, unknown> }) => {
      await local.record(owner, input.kind, input.id, input.payload);
      useLocalFailure.getState().setFailed(false);
      await refreshUserData();
      if (safePreferences(query.data?.preferences ?? {}).syncEnabled) {
        void synchronize().catch(() => undefined);
      }
    },
    onError: () => {
      useLocalFailure.getState().setFailed(true);
      void local.diagnostic('storage_failed').catch(() => undefined);
    },
  });
  return {
    ...query,
    owner,
    preferences: safePreferences(query.data?.preferences ?? {}),
    save: mutate.mutateAsync,
    saving: mutate.isPending,
    saveError: mutate.error,
  };
}
export function useSyncInfo() {
  const identity = useSession((state) => state.identity);
  const owner = identity?.appUserId ?? 'guest';
  const query = useQuery({
    queryKey: ['sync', owner],
    refetchInterval: 3000,
    queryFn: async () => {
      const pending = (await local.getOutbox(owner)).length;
      const enabled = reduceOperations(await local.getOperations(owner)).preferences.syncEnabled;
      const status = !navigator.onLine
        ? 'offline'
        : !identity
          ? 'guest'
          : !enabled
            ? 'paused'
            : syncEngine?.status === 'auth-required' ||
                syncEngine?.status === 'conflict' ||
                syncEngine?.status === 'retrying'
              ? 'syncError'
              : pending
                ? 'pending'
                : 'synced';
      return { pending, status };
    },
  });
  return query.data ?? { pending: 0, status: 'loading' };
}
export const useCatalog = () => useQuery({ queryKey: ['catalog'], queryFn: contentProvider.catalog });
export const useDictionary = () => useQuery({ queryKey: ['dictionary'], queryFn: contentProvider.dictionary });
export const useChapter = (path: string | undefined) =>
  useQuery({
    queryKey: ['chapter', path],
    queryFn: () => contentProvider.chapter(path!),
    enabled: Boolean(path),
  });

export function useOccurrences(kind: 'words' | 'kanji' | 'grammar', id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['occurrences', kind, id],
    enabled,
    queryFn: async () => {
      const books = await contentProvider.catalog();
      const occurrences: { book: BookMetadata; chapter: Chapter; sentence: Sentence }[] = [];
      let partial = false;
      for (const book of books) {
        for (const metadata of book.chapters) {
          try {
            const chapter = await contentProvider.chapter(metadata.path);
            for (const sentence of chapter.paragraphs.flatMap((paragraph) => paragraph.sentences)) {
              const matches =
                kind === 'words'
                  ? sentence.words.some((word) => word.wordId === id)
                  : kind === 'kanji'
                    ? sentence.kanjiIds.includes(id)
                    : sentence.grammarIds.includes(id);
              if (matches) {
                occurrences.push({ book, chapter, sentence });
              }
            }
          } catch {
            partial = true;
          }
        }
      }
      return { occurrences, partial };
    },
  });
}
