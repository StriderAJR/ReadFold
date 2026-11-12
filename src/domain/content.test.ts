import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogSchema, chapterSchema, dictionarySchema, validateChapterReferences } from './content';

const read = (path: string): unknown => JSON.parse(readFileSync(`public/${path}`, 'utf8'));

describe('book format', () => {
  it('validates all shipped chapters and dictionary references', () => {
    const catalog = catalogSchema.parse(read('books/catalog.json'));
    const dictionary = dictionarySchema.parse(read('books/dictionary.json'));
    expect(catalog).toHaveLength(1);
    expect(catalog[0].chapters).toHaveLength(2);
    for (const book of catalog) {
      for (const metadata of book.chapters) {
        const chapter = chapterSchema.parse(read(metadata.path));
        expect(() => validateChapterReferences(chapter, book, dictionary)).not.toThrow();
        for (const sentence of chapter.paragraphs.flatMap((paragraph) => paragraph.sentences)) {
          expect(sentence.segments.some((segment) => segment.reading)).toBe(true);
          const characters = [...sentence.text].filter((character) => /\p{Script=Han}/u.test(character));
          const referenced = dictionary.kanji.filter((entry) => sentence.kanjiIds.includes(entry.id));
          expect(characters.every((character) => referenced.some((entry) => entry.character === character))).toBe(true);
          expect(sentence.words.every((word) => sentence.text.includes(word.surface))).toBe(true);
          expect(sentence.words.every((word) => word.role && word.role !== 'член предложения')).toBe(true);
          expect(Object.keys(sentence.grammarRoles ?? {}).sort()).toEqual([...sentence.grammarIds].sort());
        }
      }
    }
  });

  it('rejects unexpected fields, duplicate IDs, unsafe paths and malformed ruby', () => {
    const catalog = catalogSchema.parse(read('books/catalog.json'));
    expect(catalogSchema.safeParse([...catalog, catalog[0]]).success).toBe(false);
    expect(catalogSchema.safeParse([{ ...catalog[0], unexpected: true }]).success).toBe(false);
    const book = structuredClone(catalog[0]);
    book.chapters[0].path = '../private.json';
    expect(catalogSchema.safeParse([book]).success).toBe(false);
    const chapter = chapterSchema.parse(read(catalog[0].chapters[0].path));
    chapter.paragraphs[0].sentences[0].segments[0].text = '違';
    expect(chapterSchema.safeParse(chapter).success).toBe(false);
  });

  it('rejects unknown and duplicate dictionary references', () => {
    const catalog = catalogSchema.parse(read('books/catalog.json'));
    const dictionary = dictionarySchema.parse(read('books/dictionary.json'));
    const chapter = chapterSchema.parse(read(catalog[0].chapters[0].path));
    chapter.paragraphs[0].sentences[0].words[0].wordId = 'unknown';
    expect(() => validateChapterReferences(chapter, catalog[0], dictionary)).toThrow('Unknown dictionary reference');
    dictionary.kanji[0].wordIds.push('missing');
    expect(dictionarySchema.safeParse(dictionary).success).toBe(false);
    dictionary.words.push(dictionary.words[0]);
    expect(dictionarySchema.safeParse(dictionary).success).toBe(false);
  });

  it('rejects collisions between dictionary types', () => {
    const dictionary = dictionarySchema.parse(read('books/dictionary.json'));
    const ids = [...dictionary.words, ...dictionary.kanji, ...dictionary.grammar].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    dictionary.kanji[0].id = dictionary.words[0].id;
    expect(dictionarySchema.safeParse(dictionary).success).toBe(false);
    dictionary.kanji[0].id = 'kanji.unique';
    dictionary.grammar[0].id = dictionary.words[0].id;
    dictionary.grammar.forEach((entry) => {
      entry.relatedIds = [];
    });
    expect(dictionarySchema.safeParse(dictionary).success).toBe(false);
  });

  it('requires supported metadata versions and checks contextual grammar role keys', () => {
    const catalog = catalogSchema.parse(read('books/catalog.json'));
    expect(catalogSchema.safeParse([{ ...catalog[0], schemaVersion: 2 }]).success).toBe(false);
    const withoutVersion: Record<string, unknown> = { ...catalog[0] };
    delete withoutVersion.schemaVersion;
    expect(catalogSchema.safeParse([withoutVersion]).success).toBe(false);
    const chapter = chapterSchema.parse(read(catalog[0].chapters[0].path));
    chapter.paragraphs[0].sentences[0].grammarRoles = { 'grammar.unknown': 'неизвестная роль' };
    expect(chapterSchema.safeParse(chapter).success).toBe(false);
  });
});
