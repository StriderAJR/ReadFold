import { z } from 'zod';
import { catalogSchema, chapterSchema, dictionarySchema, validateChapterReferences } from '../domain/content';
import { local } from '../application/runtime';

async function load<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const cached = await local.getCache(path);
  const parsed = schema.safeParse(cached);
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
  dictionary: () => load('books/dictionary.json', dictionarySchema),
  chapter: async (path: string) => {
    if (!/^books\/[a-zA-Z0-9/_-]+\.json$/.test(path)) {
      throw new Error('Invalid chapter path');
    }
    const [chapter, books, dictionary] = await Promise.all([
      load(path, chapterSchema),
      load('books/catalog.json', catalogSchema),
      load('books/dictionary.json', dictionarySchema),
    ]);
    const book = books.find((item) => item.id === chapter.bookId);
    if (!book) {
      throw new Error('Unknown book');
    }
    validateChapterReferences(chapter, book, dictionary);
    return chapter;
  },
};
