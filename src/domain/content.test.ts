import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogSchema, chapterSchema, dictionarySchema, grammarSchema, kanjiSchema, validateChapterReferences } from './content';

const read = (path: string): unknown => JSON.parse(readFileSync(`public/${path}`, 'utf8'));

describe('book format', () => {
  it('provides mnemonic component meanings and validates their correspondence', () => {
    const dictionary = dictionarySchema.parse(read('books/dictionary.json'));
    const entries = new Map(dictionary.kanji.map((kanji) => [kanji.character, kanji]));
    for (const kanji of dictionary.kanji) {
      expect(kanji.mnemonic).toBeTruthy();
      expect(kanji.mnemonic).not.toMatch(/^(Вспомни образы|Начертание)/);
      expect(new Set(kanji.components).size).toBe(kanji.components.length);
      expect(Object.keys(kanji.componentMeanings ?? {}).sort()).toEqual([...kanji.components].sort());
      expect(kanji.on.length + kanji.kun.length).toBeGreaterThan(0);
      for (const component of kanji.components) {
        expect(entries.has(component)).toBe(true);
      }
      expect(kanjiSchema.safeParse({ ...kanji, componentMeanings: undefined, mnemonic: undefined }).success).toBe(true);
    }
    const kanji = dictionary.kanji[0];
    expect(kanjiSchema.safeParse({ ...kanji, componentMeanings: {} }).success).toBe(false);
    expect(kanjiSchema.safeParse({ ...kanji, componentMeanings: { ...kanji.componentMeanings, unknown: 'образ' } }).success)
      .toBe(false);
    expect(kanjiSchema.safeParse({ ...kanji, componentMeanings: { ...kanji.componentMeanings, 十: '' } }).success)
      .toBe(false);
  });

  it('provides grammar example display layers and rejects malformed ruby', () => {
    const dictionary = dictionarySchema.parse(read('books/dictionary.json'));
    for (const grammar of dictionary.grammar) {
      for (const example of grammar.examples) {
        for (const field of ['hiragana', 'romaji', 'literal', 'natural'] as const) {
          expect(example[field]).toBeTruthy();
        }
        expect(example.segments?.map((segment) => segment.text).join('')).toBe(example.text);
        expect(example.segments?.some((segment) => segment.reading)).toBe(true);
      }
    }
    const grammar = dictionary.grammar[0];
    expect(grammarSchema.safeParse({ ...grammar, examples: [{ text: '猫。', translation: 'Кошка.' }] }).success).toBe(true);
    grammar.examples[0].segments = [{ text: '違', reading: 'ちが' }];
    expect(grammarSchema.safeParse(grammar).success).toBe(false);
  });

  it('validates all shipped chapters and dictionary references', () => {
    const catalog = catalogSchema.parse(read('books/catalog.json'));
    const dictionary = dictionarySchema.parse(read('books/dictionary.json'));
    const demoBook = catalog.find((book) => book.id === 'demo');
    expect(demoBook?.chapters).toHaveLength(2);
    for (const book of catalog) {
      for (const metadata of book.chapters) {
        const chapter = chapterSchema.parse(read(metadata.path));
        expect(() => validateChapterReferences(chapter, book, dictionary)).not.toThrow();
        for (const sentence of chapter.paragraphs.flatMap((paragraph) => paragraph.sentences)) {
          if (book.id === 'demo') {
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
    }
  });

  it('links every kanji in the Apothecary Diaries chapter to a detailed card', () => {
    const dictionary = dictionarySchema.parse(read('books/dictionary.json'));
    const chapter = chapterSchema.parse(read('books/apothecary-diaries/chapter-1.json'));
    const entries = new Map(dictionary.kanji.map((entry) => [entry.character, entry]));
    for (const sentence of chapter.paragraphs.flatMap((paragraph) => paragraph.sentences)) {
      const characters = [...new Set([...sentence.text].filter((character) => /[\u3400-\u9fff]/u.test(character)))];
      const referenced = sentence.kanjiIds.map((id) => dictionary.kanji.find((entry) => entry.id === id));
      expect(referenced.map((entry) => entry?.character)).toEqual(characters);
      for (const character of characters) {
        const entry = entries.get(character);
        expect(entry).toBeDefined();
        expect(entry?.meanings.length).toBeGreaterThan(0);
        expect(entry?.on.length || entry?.kun.length).toBeTruthy();
        expect(entry?.components).not.toContain(character);
        expect(entry?.mnemonic).toBeTruthy();
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

  it('rejects missing, unreadable, duplicate, and cyclic kanji components', () => {
    const dictionary = dictionarySchema.parse(read('books/dictionary.json'));
    const entry = dictionary.kanji.find((kanji) => kanji.components.length > 0)!;
    const invalid = structuredClone(dictionary);
    const target = invalid.kanji.find((kanji) => kanji.id === entry.id)!;
    target.components = ['\uE000'];
    target.componentMeanings = { '\uE000': 'неизвестная часть' };
    expect(dictionarySchema.safeParse(invalid).success).toBe(false);
    target.components = [target.character];
    target.componentMeanings = { [target.character]: 'сам' };
    expect(dictionarySchema.safeParse(invalid).success).toBe(false);
    target.components = [];
    target.componentMeanings = {};
    target.on = [];
    target.kun = [];
    expect(dictionarySchema.safeParse(invalid).success).toBe(false);
    target.on = entry.on;
    target.kun = entry.kun;
    invalid.kanji.push({ ...target, id: 'kanji.duplicate' });
    expect(dictionarySchema.safeParse(invalid).success).toBe(false);
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
