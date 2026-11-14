import { z } from 'zod';
import {
  catalogSchema,
  chapterSchema,
  dictionarySchema,
  grammarShardSchema,
  kanjiShardSchema,
  dictionaryIndexSchema,
  occurrenceShardSchema,
  validateChapterReferences,
  wordShardSchema,
  type DictionaryEntries,
  type DictionaryEntry,
  type DictionaryIndex,
  type DictionaryKind,
  type OccurrenceLocation,
} from '../domain/content';
import { canonicalEntityId } from '../domain/entity-id-migration';
import { kanaToRomaji } from '../domain/kana';
import { local } from '../application/runtime';

type JsonRecord = Record<string, unknown>;
const loadedContent = new Map<string, unknown>();
const inFlightContent = new Map<string, Promise<unknown>>();
const asRecord = (value: unknown): JsonRecord | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : undefined;
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function migrateCachedDictionary(input: unknown): unknown {
  const dictionary = asRecord(input);
  if (!dictionary || dictionary.schemaVersion !== 1) {
    return input;
  }
  const mapIds = (values: unknown) => asArray(values).map((value) => typeof value === 'string' ? canonicalEntityId(value) : value);
  return {
    ...dictionary,
    schemaVersion: 2,
    words: asArray(dictionary.words).map((entry) => ({ ...asRecord(entry), id: canonicalEntityId(String(asRecord(entry)?.id ?? '')) })),
    kanji: asArray(dictionary.kanji).map((entry) => ({
      ...asRecord(entry),
      id: canonicalEntityId(String(asRecord(entry)?.id ?? '')),
      wordIds: mapIds(asRecord(entry)?.wordIds),
    })),
    grammar: asArray(dictionary.grammar).map((entry) => ({
      ...asRecord(entry),
      id: canonicalEntityId(String(asRecord(entry)?.id ?? '')),
      relatedIds: mapIds(asRecord(entry)?.relatedIds),
    })),
  };
}

function cachedReading(surface: string, segments: unknown, fallback: string): string {
  const parts = asArray(segments).map(asRecord).filter((segment): segment is JsonRecord => Boolean(segment));
  for (let start = 0; start < parts.length; start += 1) {
    let text = '';
    let reading = '';
    for (let end = start; end < parts.length && text.length <= surface.length; end += 1) {
      const segment = parts[end];
      const segmentText = typeof segment.text === 'string' ? segment.text : '';
      text += segmentText;
      reading += typeof segment.reading === 'string' ? segment.reading : segmentText;
      if (text === surface) {
        return reading;
      }
      if (!surface.startsWith(text)) {
        break;
      }
    }
  }
  return fallback;
}

function migrateCachedChapter(input: unknown, dictionaryInput: unknown): unknown {
  const chapter = asRecord(input);
  if (!chapter || chapter.schemaVersion !== 1) {
    return input;
  }
  const dictionary = asRecord(migrateCachedDictionary(dictionaryInput));
  const words = asArray(dictionary?.words).map(asRecord).filter((word): word is JsonRecord => Boolean(word));
  const grammar = asArray(dictionary?.grammar).map(asRecord).filter((item): item is JsonRecord => Boolean(item));
  return {
    ...chapter,
    schemaVersion: 2,
    paragraphs: asArray(chapter.paragraphs).map((paragraph) => {
      const paragraphRecord = asRecord(paragraph) ?? {};
      return {
        ...paragraphRecord,
        sentences: asArray(paragraphRecord.sentences).map((sentence) => {
          const sentenceRecord = asRecord(sentence) ?? {};
          const oldWords = asArray(sentenceRecord.words);
          const roles = asRecord(sentenceRecord.grammarRoles) ?? {};
          return {
            ...sentenceRecord,
            wordOccurrences: oldWords.map((occurrence) => {
              const item = asRecord(occurrence) ?? {};
              const wordId = typeof item.wordId === 'string' ? canonicalEntityId(item.wordId) : '';
              const word = words.find((candidate) => candidate.id === wordId);
              const surface = typeof item.surface === 'string' ? item.surface : '';
              const fallback = word?.reading;
              const hiragana = cachedReading(surface, sentenceRecord.segments, typeof fallback === 'string' ? fallback : surface);
              return {
                ...item,
                wordId,
                hiragana,
                romaji: surface === word?.dictionaryForm && typeof word.romaji === 'string'
                  ? word.romaji
                  : kanaToRomaji(hiragana),
              };
            }),
            kanjiIds: asArray(sentenceRecord.kanjiIds).map((id) => typeof id === 'string' ? canonicalEntityId(id) : id),
            grammarOccurrences: asArray(sentenceRecord.grammarIds).map((id) => {
              const grammarId = typeof id === 'string' ? canonicalEntityId(id) : '';
              const definition = grammar.find((item) => item.id === grammarId);
              const role = typeof roles[String(id)] === 'string' ? roles[String(id)] : definition?.explanation;
              return { grammarId, role: typeof role === 'string' && role.length ? role : 'Контекстная роль не сохранена в старом кеше.' };
            }),
          };
        }),
      };
    }),
  };
}

async function load<T>(path: string, schema: z.ZodType<T>, migrateCached?: (input: unknown) => unknown): Promise<T> {
  if (loadedContent.has(path)) {
    return schema.parse(loadedContent.get(path));
  }
  const existing = inFlightContent.get(path);
  if (existing) {
    return schema.parse(await existing);
  }
  const request = (async (): Promise<unknown> => {
  const cached = await local.getCache(path);
  const parsed = schema.safeParse(migrateCached ? migrateCached(cached) : cached);
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    if (parsed.success) {
      return parsed.data;
    }
    throw error;
  }
  if (!response.ok) {
    if (parsed.success) {
      return parsed.data;
    }
    throw new Error(`Content unavailable: ${response.status}`);
  }
  const result = schema.parse(await response.json());
  await local.setCache(path, result);
  return result;
  })();
  inFlightContent.set(path, request);
  try {
    const result = await request;
    loadedContent.set(path, result);
    return schema.parse(result);
  } finally {
    inFlightContent.delete(path);
  }
}

function emptyEntries(): DictionaryEntries {
  return { words: [], kanji: [], grammar: [] };
}

async function loadShard(kind: DictionaryKind, path: string): Promise<DictionaryEntry[]> {
  if (kind === 'words') {
    return (await load(path, wordShardSchema)).entries;
  }
  if (kind === 'kanji') {
    return (await load(path, kanjiShardSchema)).entries;
  }
  return (await load(path, grammarShardSchema)).entries;
}

async function collectEntries(ids: readonly string[], index: DictionaryIndex): Promise<DictionaryEntries> {
  const results = emptyEntries();
  const seen = new Set<string>();
  let pending = [...new Set(ids)];
  while (pending.length) {
    const batch = pending.filter((id) => !seen.has(id));
    pending = [];
    if (!batch.length) {
      break;
    }
    const grouped = new Map<string, { kind: DictionaryKind; ids: string[] }>();
    for (const id of batch) {
      const reference = index.byId[id];
      if (!reference) {
        throw new Error(`Unknown dictionary ID: ${id}`);
      }
      const group = grouped.get(reference.file) ?? { kind: reference.kind, ids: [] };
      if (group.kind !== reference.kind) {
        throw new Error(`Dictionary shard kind mismatch: ${reference.file}`);
      }
      group.ids.push(id);
      grouped.set(reference.file, group);
    }
    const loaded = await Promise.all([...grouped].map(async ([path, group]) => ({
      path,
      group,
      entries: await loadShard(group.kind, path),
    })));
    for (const { path, group, entries } of loaded) {
      for (const id of group.ids) {
        const entry = entries.find((candidate) => candidate.id === id);
        if (!entry) {
          throw new Error(`Dictionary index points to a shard without ${id}: ${path}`);
        }
        seen.add(id);
        if (group.kind === 'words' && 'dictionaryForm' in entry) {
          results.words.push(entry);
        } else if (group.kind === 'kanji' && 'character' in entry) {
          results.kanji.push(entry);
          for (const component of entry.components) {
            pending.push(`ja:kanji:${component}`);
          }
        } else if (group.kind === 'grammar' && 'relatedIds' in entry) {
          results.grammar.push(entry);
        } else {
          throw new Error(`Dictionary entry kind mismatch: ${id}`);
        }
      }
    }
  }
  return results;
}

async function loadLegacyDictionary(): Promise<DictionaryEntries> {
  const dictionary = await load('books/dictionary.json', dictionarySchema, migrateCachedDictionary);
  return { words: dictionary.words, kanji: dictionary.kanji, grammar: dictionary.grammar };
}

async function loadIndexOrLegacy(): Promise<{ index: DictionaryIndex | null; legacy: DictionaryEntries | null }> {
  try {
    return { index: await load('ja/dictionary/index.json', dictionaryIndexSchema), legacy: null };
  } catch {
    return { index: null, legacy: await loadLegacyDictionary() };
  }
}

export const contentProvider = {
  catalog: () => load('books/catalog.json', catalogSchema),
  dictionaryIndex: () => load('ja/dictionary/index.json', dictionaryIndexSchema),
  dictionary: async () => {
    const { index, legacy } = await loadIndexOrLegacy();
    if (legacy) {
      return dictionarySchema.parse({ schemaVersion: 2, ...legacy });
    }
    const sections = await Promise.all((['words', 'kanji', 'grammar'] as const).map(async (kind) => ({
      kind,
      entries: (await Promise.all(index!.sections[kind].map((path) => loadShard(kind, path)))).flat(),
    })));
    const dictionary = emptyEntries();
    for (const { kind, entries } of sections) {
      if (kind === 'words') {
        dictionary.words = entries.filter((entry) => 'dictionaryForm' in entry);
      } else if (kind === 'kanji') {
        dictionary.kanji = entries.filter((entry) => 'character' in entry);
      } else {
        dictionary.grammar = entries.filter((entry) => 'relatedIds' in entry);
      }
    }
    return dictionarySchema.parse({ schemaVersion: 2, ...dictionary });
  },
  dictionarySection: async (kind: DictionaryKind) => {
    const { index, legacy } = await loadIndexOrLegacy();
    if (legacy) {
      return legacy[kind];
    }
    return (await Promise.all(index!.sections[kind].map((path) => loadShard(kind, path)))).flat();
  },
  dictionaryEntity: async (id: string): Promise<DictionaryEntry> => {
    const entries = await contentProvider.dictionaryEntities([id]);
    const entry = [...entries.words, ...entries.kanji, ...entries.grammar].find((candidate) => candidate.id === id);
    if (!entry) {
      throw new Error(`Unknown dictionary ID: ${id}`);
    }
    return entry;
  },
  dictionaryEntities: async (ids: readonly string[]): Promise<DictionaryEntries> => {
    const { index, legacy } = await loadIndexOrLegacy();
    if (legacy) {
      const wanted = new Set(ids);
      return {
        words: legacy.words.filter((entry) => wanted.has(entry.id)),
        kanji: legacy.kanji.filter((entry) => wanted.has(entry.id)),
        grammar: legacy.grammar.filter((entry) => wanted.has(entry.id)),
      };
    }
    return collectEntries(ids, index!);
  },
  occurrences: async (id: string): Promise<OccurrenceLocation[]> => {
    const { index, legacy } = await loadIndexOrLegacy();
    if (legacy) {
      const books = await contentProvider.catalog();
      const locations: OccurrenceLocation[] = [];
      for (const book of books) {
        for (const chapter of book.chapters) {
          const loaded = await contentProvider.chapter(chapter.path);
          for (const sentence of loaded.paragraphs.flatMap((paragraph) => paragraph.sentences)) {
            if (sentence.wordOccurrences.some((entry) => entry.wordId === id) ||
              sentence.kanjiIds.includes(id) || sentence.grammarOccurrences.some((entry) => entry.grammarId === id)) {
              locations.push({ bookId: book.id, chapterId: loaded.id, chapterPath: chapter.path, sentenceId: sentence.id });
            }
          }
        }
      }
      return locations;
    }
    const reference = index!.byId[id];
    if (!reference) {
      throw new Error(`Unknown dictionary ID: ${id}`);
    }
    const shard = await load(reference.occurrencesFile, occurrenceShardSchema);
    return shard.byId[id] ?? [];
  },
  chapter: async (path: string) => {
    if (!/^books\/[a-zA-Z0-9/_-]+\.json$/.test(path)) {
      throw new Error('Invalid chapter path');
    }
    const [books, { index, legacy }, cachedLegacyDictionary] = await Promise.all([
      load('books/catalog.json', catalogSchema),
      loadIndexOrLegacy(),
      local.getCache('books/dictionary.json').catch(() => undefined),
    ]);
    const chapter = await load(path, chapterSchema, (input) => migrateCachedChapter(input, legacy ?? cachedLegacyDictionary));
    const book = books.find((item) => item.id === chapter.bookId);
    if (!book) {
      throw new Error('Unknown book');
    }
    const references = [...new Set(chapter.paragraphs.flatMap((paragraph) => paragraph.sentences.flatMap((sentence) => [
      ...sentence.wordOccurrences.map((entry) => entry.wordId),
      ...sentence.kanjiIds,
      ...sentence.grammarOccurrences.map((entry) => entry.grammarId),
    ])))];
    const dictionary = legacy
      ? { words: legacy.words, kanji: legacy.kanji, grammar: legacy.grammar }
      : await collectEntries(references, index!);
    validateChapterReferences(chapter, book, dictionary);
    return chapter;
  },
};
