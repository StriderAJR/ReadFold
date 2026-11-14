import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogSchema, chapterSchema, dictionaryIndexSchema, kanjiShardSchema } from '../domain/content';

const cache = new Map<string, unknown>();
vi.mock('../application/runtime', () => ({
  local: {
    getCache: async (path: string) => cache.get(path),
    setCache: async (path: string, value: unknown) => { cache.set(path, value); },
  },
}));

import { contentProvider } from './content-provider';

const read = (path: string): unknown => JSON.parse(readFileSync(`.local-tools/content/${path}`, 'utf8'));

afterEach(() => {
  vi.unstubAllGlobals();
  cache.clear();
});

describe('published content provider', () => {
  it('loads only cards needed by a chapter instead of the full dictionary', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const path = new URL(String(input), 'http://readfold.test').pathname.replace(/^\/ReadFold\//, '').replace(/^\//, '');
      requested.push(path);
      return new Response(JSON.stringify(read(path)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const chapter = await contentProvider.chapter('books/demo/chapter-1.json');
    const index = dictionaryIndexSchema.parse(read('ja/dictionary/index.json'));
    const sourceChapter = chapterSchema.parse(read('books/demo/chapter-1.json'));
    const pending = sourceChapter.paragraphs.flatMap((paragraph) => paragraph.sentences.flatMap((sentence) => [
      ...sentence.wordOccurrences.map((entry) => entry.wordId),
      ...sentence.kanjiIds,
      ...sentence.grammarOccurrences.map((entry) => entry.grammarId),
    ]));
    const cardFiles = new Set<string>();
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      const reference = index.byId[id];
      expect(reference).toBeDefined();
      cardFiles.add(reference.file);
      if (reference.kind === 'kanji') {
        const shard = kanjiShardSchema.parse(read(reference.file));
        const entry = shard.entries.find((item) => item.id === id);
        pending.push(...(entry?.components ?? []).map((component) => `ja:kanji:${component}`));
      }
    }

    expect(chapter.id).toBe('demo.chapter-1');
    expect(requested).toContain('books/catalog.json');
    expect(requested).toContain('ja/dictionary/index.json');
    expect(requested).toContain('books/demo/chapter-1.json');
    expect(new Set(requested.filter((path) => path.startsWith('ja/dictionary/') && path !== 'ja/dictionary/index.json'))).toEqual(cardFiles);
    expect(requested).not.toContain('books/dictionary.json');
    expect(cardFiles.size).toBeLessThan(Object.values(index.sections).flat().length);
  });

  it('opens every generated chapter through the runtime provider', async () => {
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const path = new URL(String(input), 'http://readfold.test').pathname.replace(/^\/ReadFold\//, '').replace(/^\//, '');
      return new Response(JSON.stringify(read(path)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const catalog = catalogSchema.parse(read('books/catalog.json'));
    let chapterCount = 0;
    for (const book of catalog) {
      for (const metadata of book.chapters) {
        const chapter = await contentProvider.chapter(metadata.path);
        expect(chapter.id).toBe(metadata.id);
        expect(chapter.bookId).toBe(book.id);
        chapterCount += 1;
      }
    }
    expect(chapterCount).toBe(3);
  });
});
