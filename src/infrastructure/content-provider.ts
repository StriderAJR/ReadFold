import { z } from 'zod';
import { catalogSchema, chapterSchema, dictionarySchema, validateChapterReferences } from '../domain/content';
import { canonicalEntityId } from '../domain/entity-id-migration';
import { kanaToRomaji } from '../domain/kana';
import { local } from '../application/runtime';

type JsonRecord = Record<string, unknown>;
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
}
export const contentProvider = {
  catalog: () => load('books/catalog.json', catalogSchema),
  dictionary: () => load('books/dictionary.json', dictionarySchema, migrateCachedDictionary),
  chapter: async (path: string) => {
    if (!/^books\/[a-zA-Z0-9/_-]+\.json$/.test(path)) {
      throw new Error('Invalid chapter path');
    }
    const [books, dictionary] = await Promise.all([
      load('books/catalog.json', catalogSchema),
      load('books/dictionary.json', dictionarySchema, migrateCachedDictionary),
    ]);
    const chapter = await load(path, chapterSchema, (input) => migrateCachedChapter(input, dictionary));
    const book = books.find((item) => item.id === chapter.bookId);
    if (!book) {
      throw new Error('Unknown book');
    }
    validateChapterReferences(chapter, book, dictionary);
    return chapter;
  },
};
