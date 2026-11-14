import { useMutation, useQuery } from '@tanstack/react-query';
import { defaultPreferences, type EntityKind, type ReaderPreferences } from '../domain/user-state';
import { reduceOperations } from '../infrastructure/local/repository';
import { contentProvider } from '../infrastructure/content-provider';
import { local, refreshUserData, synchronize, syncEngine, useSession, useLocalFailure } from './runtime';
import { z } from 'zod';
import type { BookMetadata, Chapter, DictionaryKind, Sentence } from '../domain/content';

export const preferencesSchema = z.object({
  language: z.enum(['ru', 'en']),
  theme: z.enum(['light', 'dark', 'system']),
  fontSize: z.number().min(16).max(42),
  readingFontSize: z.number().min(10).max(32),
  translationFontSize: z.number().min(10).max(32),
  cardScalePercent: z.number().int().min(70).max(150),
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
  translationsSeparateLine: z.boolean(),
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
  if (typeof input.cardScalePercent !== 'number' && typeof input.cardFontSize === 'number') {
    result.cardScalePercent = Math.min(150, Math.max(70, Math.round((input.cardFontSize / 16) * 100)));
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
export const useDictionaryIndex = () => useQuery({ queryKey: ['dictionary-index'], queryFn: contentProvider.dictionaryIndex });
export const useDictionary = (enabled = true) => useQuery({
  queryKey: ['dictionary'],
  queryFn: contentProvider.dictionary,
  enabled,
});
export const useDictionarySection = (kind: DictionaryKind) => useQuery({
  queryKey: ['dictionary', kind],
  queryFn: () => contentProvider.dictionarySection(kind),
});
export const useDictionaryEntity = (id: string, enabled = true) => useQuery({
  queryKey: ['dictionary-entity', id],
  queryFn: () => contentProvider.dictionaryEntity(id),
  enabled: enabled && Boolean(id),
});
export const useDictionaryEntities = (ids: readonly string[] | undefined, enabled = true) => {
  const uniqueIds = [...new Set(ids ?? [])].sort();
  return useQuery({
    queryKey: ['dictionary-entities', uniqueIds],
    queryFn: () => contentProvider.dictionaryEntities(uniqueIds),
    enabled: enabled && uniqueIds.length > 0,
  });
};
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
      const [books, locations] = await Promise.all([contentProvider.catalog(), contentProvider.occurrences(id)]);
      const occurrences: { book: BookMetadata; chapter: Chapter; sentence: Sentence }[] = [];
      const chapterPaths = [...new Set(locations.map((location) => location.chapterPath))];
      const chapters = await Promise.all(chapterPaths.map(async (path) => {
        try {
          return [path, await contentProvider.chapter(path)] as const;
        } catch {
          return [path, null] as const;
        }
      }));
      const chaptersByPath = new Map(chapters);
      for (const location of locations) {
        const book = books.find((entry) => entry.id === location.bookId);
        const chapter = chaptersByPath.get(location.chapterPath);
        const sentence = chapter?.paragraphs.flatMap((paragraph) => paragraph.sentences)
          .find((entry) => entry.id === location.sentenceId);
        if (book && chapter && sentence) {
          occurrences.push({ book, chapter, sentence });
        }
      }
      return { occurrences, partial: occurrences.length < locations.length };
    },
  });
}
