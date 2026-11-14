import { z } from 'zod';

const idSchema = z.string().min(1).max(512).regex(/^[^\s\p{Cc}/\\?#%]+$/u);
const wordIdSchema = idSchema.regex(/^ja:word:.+$/u, 'Expected ja:word:<lemma> ID');
const kanjiIdSchema = idSchema.refine((value) => value.startsWith('ja:kanji:') && [...value.slice('ja:kanji:'.length)].length === 1, 'Expected ja:kanji:<character> ID');
const grammarIdSchema = idSchema.regex(/^ja:grammar:.+$/u, 'Expected ja:grammar:<topic> ID');
const textSchema = z.string().min(1);
const uniqueIds = (items: readonly { id: string }[]) => new Set(items.map((item) => item.id)).size === items.length;
const chapterMetadataSchema = z
  .object({
    id: idSchema,
    title: textSchema,
    path: z.string().regex(/^books\/[a-z0-9/-]+\.json$/),
    sentenceCount: z.number().int().positive(),
  })
  .strict();

export const bookMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: idSchema,
    title: textSchema,
    translatedTitle: textSchema.optional(),
    author: textSchema,
    description: textSchema,
    originalLanguage: textSchema,
    translationLanguage: textSchema,
    difficulty: textSchema,
    tags: z.array(textSchema),
    cover: textSchema,
    license: textSchema,
    source: textSchema,
    chapters: z.array(chapterMetadataSchema).min(1).refine(uniqueIds, 'Duplicate chapter IDs'),
  })
  .strict();
export const catalogSchema = z.array(bookMetadataSchema).refine(uniqueIds, 'Duplicate book IDs');
export const wordSchema = z
  .object({
    id: wordIdSchema,
    surface: textSchema,
    dictionaryForm: textSchema,
    reading: textSchema,
    romaji: textSchema,
    partOfSpeech: textSchema,
    meanings: z.array(textSchema).min(1),
  })
  .strict();
export const kanjiSchema = z
  .object({
    id: kanjiIdSchema,
    character: z.string().refine((value) => [...value].length === 1, 'Expected one character'),
    meanings: z.array(textSchema).min(1),
    on: z.array(textSchema),
    kun: z.array(textSchema),
    components: z.array(textSchema),
    componentMeanings: z.record(textSchema, textSchema).optional(),
    wordIds: z.array(wordIdSchema),
    mnemonic: textSchema.optional(),
  })
  .strict()
  .refine((kanji) => !kanji.componentMeanings || (
    kanji.components.every((component) => Object.hasOwn(kanji.componentMeanings ?? {}, component)) &&
    Object.keys(kanji.componentMeanings).every((component) => kanji.components.includes(component))
  ), { message: 'Component meanings must match visual components', path: ['componentMeanings'] });
export const grammarSchema = z
  .object({
    id: grammarIdSchema,
    title: textSchema,
    explanation: textSchema,
    examples: z.array(z.object({
      text: textSchema,
      translation: textSchema,
      hiragana: textSchema.optional(),
      romaji: textSchema.optional(),
      literal: textSchema.optional(),
      natural: textSchema.optional(),
      segments: z.array(z.object({ text: textSchema, reading: textSchema.optional() }).strict()).min(1).optional(),
    }).strict().refine((example) => !example.segments || (
      example.segments.map((segment) => segment.text).join('') === example.text
    ), { message: 'Segments must reproduce example text', path: ['segments'] })).min(1),
    relatedIds: z.array(grammarIdSchema),
  })
  .strict();
export const dictionarySchema = z
  .object({
    schemaVersion: z.literal(2),
    words: z.array(wordSchema),
    kanji: z.array(kanjiSchema),
    grammar: z.array(grammarSchema),
  })
  .strict()
  .superRefine((dictionary, context) => {
    if (!uniqueIds([...dictionary.words, ...dictionary.kanji, ...dictionary.grammar])) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Dictionary IDs must be globally unique' });
    }
    for (const kind of ['words', 'kanji', 'grammar'] as const) {
      if (!uniqueIds(dictionary[kind])) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [kind], message: 'Duplicate dictionary IDs' });
      }
    }
    const wordIds = new Set(dictionary.words.map((word) => word.id));
    const grammarIds = new Set(dictionary.grammar.map((grammar) => grammar.id));
    const kanjiByCharacter = new Map(dictionary.kanji.map((kanji) => [kanji.character, kanji]));
    if (kanjiByCharacter.size !== dictionary.kanji.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['kanji'], message: 'Duplicate kanji characters' });
    }
    dictionary.kanji.forEach((kanji, index) => {
      if (kanji.wordIds.some((id) => !wordIds.has(id))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['kanji', index, 'wordIds'], message: 'Unknown word' });
      }
      if (kanji.on.length === 0 && kanji.kun.length === 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['kanji', index], message: 'Kanji reading is required' });
      }
      for (const component of kanji.components) {
        if (!kanjiByCharacter.has(component)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['kanji', index, 'components'], message: `Unknown component ${component}` });
        }
      }
    });
    const visited = new Set<string>();
    const active = new Set<string>();
    const visit = (character: string): void => {
      if (active.has(character)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['kanji'], message: `Cyclic kanji components at ${character}` });
        return;
      }
      if (visited.has(character)) {
        return;
      }
      active.add(character);
      for (const component of kanjiByCharacter.get(character)?.components ?? []) {
        if (kanjiByCharacter.has(component)) {
          visit(component);
        }
      }
      active.delete(character);
      visited.add(character);
    };
    for (const character of kanjiByCharacter.keys()) {
      visit(character);
    }
    dictionary.grammar.forEach((grammar, index) => {
      if (grammar.relatedIds.some((id) => !grammarIds.has(id))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['grammar', index, 'relatedIds'],
          message: 'Unknown grammar',
        });
      }
    });
  });
export const sentenceSchema = z
  .object({
    id: idSchema,
    text: textSchema,
    segments: z.array(z.object({ text: textSchema, reading: textSchema.optional() }).strict()).min(1),
    hiragana: textSchema,
    romaji: textSchema,
    literal: textSchema,
    natural: textSchema,
    wordOccurrences: z
      .array(
        z
          .object({
            wordId: wordIdSchema,
            surface: textSchema,
            hiragana: textSchema,
            romaji: textSchema,
            meaning: textSchema,
            inflection: textSchema.optional(),
            role: textSchema.optional(),
          })
          .strict(),
      )
      .min(1),
    kanjiIds: z.array(kanjiIdSchema),
    grammarOccurrences: z.array(z.object({ grammarId: grammarIdSchema, role: textSchema }).strict()),
  })
  .strict()
  .refine((sentence) => sentence.segments.map((segment) => segment.text).join('') === sentence.text, {
    message: 'Segments must reproduce sentence text',
    path: ['segments'],
  })
  .refine((sentence) => uniqueIds(sentence.kanjiIds.map((id) => ({ id }))), {
    message: 'Duplicate kanji references',
    path: ['kanjiIds'],
  });
export const chapterSchema = z
  .object({
    schemaVersion: z.literal(2),
    id: idSchema,
    bookId: idSchema,
    title: textSchema,
    paragraphs: z.array(z.object({ id: idSchema, sentences: z.array(sentenceSchema).min(1) }).strict()).min(1),
  })
  .strict()
  .superRefine((chapter, context) => {
    if (!uniqueIds(chapter.paragraphs) || !uniqueIds(chapter.paragraphs.flatMap((paragraph) => paragraph.sentences))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate paragraph or sentence IDs' });
    }
  });

export type BookMetadata = z.infer<typeof bookMetadataSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type Sentence = z.infer<typeof sentenceSchema>;
export type Word = z.infer<typeof wordSchema>;
export type Kanji = z.infer<typeof kanjiSchema>;
export type Grammar = z.infer<typeof grammarSchema>;
export type Dictionary = z.infer<typeof dictionarySchema>;

/** Validate links after independently parsing externally loaded files. */
export function validateChapterReferences(chapter: Chapter, book: BookMetadata, dictionary: Dictionary): void {
  const metadata = book.chapters.find((item) => item.id === chapter.id);
  const sentences = chapter.paragraphs.flatMap((paragraph) => paragraph.sentences);
  if (chapter.bookId !== book.id || !metadata || metadata.sentenceCount !== sentences.length) {
    throw new Error('Chapter does not match catalog metadata');
  }
  const words = new Set(dictionary.words.map((item) => item.id));
  const kanji = new Set(dictionary.kanji.map((item) => item.id));
  const grammar = new Set(dictionary.grammar.map((item) => item.id));
  for (const sentence of sentences) {
    if (
      sentence.wordOccurrences.some((item) => !words.has(item.wordId)) ||
      sentence.kanjiIds.some((id) => !kanji.has(id)) ||
      sentence.grammarOccurrences.some((item) => !grammar.has(item.grammarId)) ||
      sentence.wordOccurrences.some((item) => !sentence.text.includes(item.surface))
    ) {
      throw new Error(`Unknown dictionary reference in ${sentence.id}`);
    }
  }
}
