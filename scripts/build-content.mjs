import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { catalogSchema, chapterSchema, dictionarySchema, validateChapterReferences } from '../src/domain/content.ts';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kinds = ['words', 'kanji', 'grammar'];
const sourceManifestSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  bookId: z.string().min(1),
  title: z.string().min(1),
  parts: z.array(z.string().regex(/^part-[0-9]{3}\.json$/)).min(1),
}).strict().refine((manifest) => new Set(manifest.parts).size === manifest.parts.length, 'Duplicate chapter parts');
const partSchema = z.object({ paragraphs: chapterSchema.innerType().shape.paragraphs }).strict();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const slash = (path) => path.split(sep).join('/');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

function containedPath(root, path) {
  const target = resolve(root, path);
  const distance = relative(root, target);
  if (distance.startsWith(`..${sep}`) || distance === '..' || isAbsolute(distance)) {
    throw new Error(`Path escapes content root: ${path}`);
  }
  return target;
}

async function jsonFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...await jsonFiles(resolve(root, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(resolve(root, entry.name));
    }
  }
  return files.sort();
}

/** Read editable language sources without relying on previously generated files. */
export async function loadContentSources(root = repositoryRoot) {
  const languageRoot = resolve(root, 'content/ja');
  const catalog = await readJson(resolve(languageRoot, 'catalog.json'));
  catalogSchema.parse(catalog);
  const dictionary = { schemaVersion: 2, words: [], kanji: [], grammar: [] };
  const sourceById = new Map();
  const sourceGroups = [];
  for (const kind of kinds) {
    for (const sourceFile of await jsonFiles(resolve(languageRoot, `dictionary/${kind}`))) {
      const raw = await readJson(sourceFile);
      const entries = kind === 'words' ? raw : [raw];
      if (!Array.isArray(entries) || entries.length === 0 || (kind === 'words' && entries.length > 24)) {
        throw new Error(`Expected one to 24 word cards in ${slash(relative(root, sourceFile))}`);
      }
      const sourcePath = slash(relative(root, sourceFile));
      for (const card of entries) {
        if (sourceById.has(card.id)) {
          throw new Error(`Duplicate source ID ${card.id}`);
        }
        sourceById.set(card.id, sourcePath);
      }
      if (kind === 'kanji' && (basename(sourceFile) !== `${raw.character}.json` || raw.id !== `ja:kanji:${raw.character}`)) {
        throw new Error(`Kanji source filename and ID must match its character: ${sourcePath}`);
      }
      if (kind === 'grammar' && basename(sourceFile) !== `${raw.id?.slice('ja:grammar:'.length)}.json`) {
        throw new Error(`Grammar source filename must match its ID: ${sourcePath}`);
      }
      dictionary[kind].push(...entries);
      sourceGroups.push({ kind, entries, sourceFile: sourcePath });
    }
  }
  dictionarySchema.parse(dictionary);
  const chapters = [];
  const sentenceSources = new Map();
  const seenChapterIds = new Set();
  const seenSentenceIds = new Set();
  const metadataPaths = new Set(catalog.flatMap((book) => book.chapters.map((chapter) => chapter.path)));
  const bookSourceFiles = await jsonFiles(resolve(languageRoot, 'books'));
  const consumedSourceFiles = new Set();
  const sourceManifests = bookSourceFiles.filter((path) => path.endsWith(`${sep}manifest.json`));
  for (const manifestFile of sourceManifests) {
    consumedSourceFiles.add(manifestFile);
    const manifest = sourceManifestSchema.parse(await readJson(manifestFile));
    const book = catalog.find((entry) => entry.id === manifest.bookId);
    const metadata = book?.chapters.find((entry) => entry.id === manifest.id);
    if (!book || !metadata || seenChapterIds.has(manifest.id)) {
      throw new Error(`Unknown or duplicate chapter source ${manifest.id}`);
    }
    seenChapterIds.add(manifest.id);
    const paragraphs = [];
    const referencedParts = new Set(manifest.parts.map((part) => containedPath(dirname(manifestFile), part)));
    const availableParts = (await jsonFiles(dirname(manifestFile))).filter((path) => path !== manifestFile);
    if (availableParts.some((path) => !referencedParts.has(path))) {
      throw new Error(`Unreferenced chapter source part in ${slash(relative(root, dirname(manifestFile)))}`);
    }
    for (const part of manifest.parts) {
      const partFile = containedPath(dirname(manifestFile), part);
      consumedSourceFiles.add(partFile);
      const parsed = await readJson(partFile);
      partSchema.parse(parsed);
      paragraphs.push(...parsed.paragraphs);
      for (const sentence of parsed.paragraphs.flatMap((paragraph) => paragraph.sentences)) {
        if (seenSentenceIds.has(sentence.id)) {
          throw new Error(`Duplicate sentence ID across collection: ${sentence.id}`);
        }
        seenSentenceIds.add(sentence.id);
        sentenceSources.set(sentence.id, slash(relative(root, partFile)));
      }
    }
    const chapter = {
      schemaVersion: manifest.schemaVersion,
      id: manifest.id,
      bookId: manifest.bookId,
      title: manifest.title,
      paragraphs,
    };
    chapterSchema.parse(chapter);
    validateChapterReferences(chapter, book, dictionary);
    chapters.push({ path: metadata.path, chapter });
  }
  if (chapters.length !== metadataPaths.size || chapters.some((entry) => !metadataPaths.has(entry.path))) {
    throw new Error('Every catalog chapter must have exactly one source manifest');
  }
  if (bookSourceFiles.some((path) => !consumedSourceFiles.has(path))) {
    throw new Error('Unreferenced book source JSON');
  }
  const collection = { catalog, dictionary, chapters, sourceGroups, sourceById, sentenceSources };
  validateCollection(collection);
  return collection;
}

/** Validation is repeated before rendering so programmatic callers cannot bypass it. */
export function validateCollection(collection) {
  const catalog = catalogSchema.parse(collection.catalog);
  const dictionary = dictionarySchema.parse(collection.dictionary);
  if (catalog.some((book) => book.originalLanguage !== 'ja')) {
    throw new Error('content/ja must contain Japanese books');
  }
  const paths = new Set();
  const chapterIds = new Set();
  const sentenceIds = new Set();
  const paragraphIds = new Set();
  for (const { path, chapter: input } of collection.chapters) {
    const chapter = chapterSchema.parse(input);
    const book = catalog.find((entry) => entry.id === chapter.bookId);
    if (!book || paths.has(path) || chapterIds.has(chapter.id)) {
      throw new Error(`Unknown book or duplicate chapter ${chapter.id}`);
    }
    const metadata = book.chapters.find((entry) => entry.id === chapter.id);
    if (!metadata || metadata.path !== path) {
      throw new Error(`Chapter path differs from catalog: ${chapter.id}`);
    }
    validateChapterReferences(chapter, book, dictionary);
    paths.add(path);
    chapterIds.add(chapter.id);
    for (const paragraph of chapter.paragraphs) {
      if (paragraphIds.has(paragraph.id)) {
        throw new Error(`Duplicate paragraph ID across collection: ${paragraph.id}`);
      }
      paragraphIds.add(paragraph.id);
    }
    for (const sentence of chapter.paragraphs.flatMap((paragraph) => paragraph.sentences)) {
      if (sentenceIds.has(sentence.id)) {
        throw new Error(`Duplicate sentence ID across collection: ${sentence.id}`);
      }
      sentenceIds.add(sentence.id);
    }
  }
  if (paths.size !== catalog.reduce((count, book) => count + book.chapters.length, 0)) {
    throw new Error('Missing catalog chapter');
  }
}

export function findEntity(collection, id) {
  const kind = kinds.find((name) => collection.dictionary[name].some((card) => card.id === id));
  if (!kind) {
    throw new Error(`Unknown entity ID: ${id}`);
  }
  const card = collection.dictionary[kind].find((entry) => entry.id === id);
  const occurrences = [];
  for (const { path, chapter } of collection.chapters) {
    for (const sentence of chapter.paragraphs.flatMap((paragraph) => paragraph.sentences)) {
      const matches = kind === 'words'
        ? sentence.wordOccurrences.some((entry) => entry.wordId === id)
        : kind === 'kanji'
          ? sentence.kanjiIds.includes(id)
          : sentence.grammarOccurrences.some((entry) => entry.grammarId === id);
      if (matches) {
        occurrences.push({
          bookId: chapter.bookId,
          chapterId: chapter.id,
          chapterPath: path,
          sentenceId: sentence.id,
          sourceFile: collection.sentenceSources.get(sentence.id),
          sentence,
        });
      }
    }
  }
  return { id, kind, sourceFile: collection.sourceById.get(id), card, occurrences };
}

function fileStem(group) {
  if (group.kind === 'kanji') {
    return `u${group.entries[0].character.codePointAt(0).toString(16)}`;
  }
  return group.sourceFile.split('/').at(-1).replace(/\.json$/, '');
}

/** Return deterministic published JSON; indexes contain only locations, never card fields. */
export function createContentArtifacts(collection) {
  validateCollection(collection);
  const artifacts = new Map();
  const liveIds = new Set(kinds.flatMap((kind) => collection.dictionary[kind].map((card) => card.id)));
  const index = { schemaVersion: 1, sections: { words: [], kanji: [], grammar: [] }, byId: {} };
  artifacts.set('books/catalog.json', json(collection.catalog));
  for (const { path, chapter } of collection.chapters) {
    artifacts.set(path, json(chapter));
  }
  for (const group of collection.sourceGroups) {
    const stem = fileStem(group);
    if (!/^[a-z0-9-]+$/.test(stem)) {
      throw new Error(`Unsafe generated shard filename: ${stem}`);
    }
    const file = `ja/dictionary/${group.kind}/${stem}.json`;
    const occurrencesFile = `ja/occurrences/${group.kind}/${stem}.json`;
    if (artifacts.has(file)) {
      throw new Error(`Duplicate shard filename: ${file}`);
    }
    const byId = {};
    for (const card of group.entries) {
      if (!liveIds.has(card.id) || Object.hasOwn(index.byId, card.id)) {
        throw new Error(`Unknown or repeated shard card: ${card.id}`);
      }
      index.byId[card.id] = { kind: group.kind, file, occurrencesFile };
      byId[card.id] = findEntity(collection, card.id).occurrences.map(({ bookId, chapterId, chapterPath, sentenceId }) => ({
        bookId, chapterId, chapterPath, sentenceId,
      }));
    }
    index.sections[group.kind].push(file);
    artifacts.set(file, json({ schemaVersion: 1, kind: group.kind, entries: group.entries }));
    artifacts.set(occurrencesFile, json({ schemaVersion: 1, byId }));
  }
  if (Object.keys(index.byId).length !== kinds.reduce((count, kind) => count + collection.dictionary[kind].length, 0)) {
    throw new Error('Published index does not cover every card');
  }
  artifacts.set('ja/dictionary/index.json', json(index));
  return artifacts;
}

export async function buildContent({ root = repositoryRoot, outputRoot = resolve(root, '.local-tools/content'), trackGeneratedFiles = true } = {}) {
  const collection = await loadContentSources(root);
  const artifacts = createContentArtifacts(collection);
  const manifestPath = resolve(outputRoot, 'books/.generated-content.json');
  let previous = [];
  if (trackGeneratedFiles) {
    try {
      previous = (await readJson(manifestPath)).files;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  const generatedFiles = [...artifacts.keys()].sort();
  for (const [path, contents] of artifacts) {
    const target = containedPath(outputRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
  }
  for (const obsolete of [...previous, 'books/dictionary.json']) {
    if (!generatedFiles.includes(obsolete)) {
      const target = containedPath(outputRoot, obsolete);
      if (!/^(?:books|ja)\/.+\.json$/.test(obsolete)) {
        throw new Error(`Unsafe generated manifest entry: ${obsolete}`);
      }
      await unlink(target).catch((error) => { if (error.code !== 'ENOENT') { throw error; } });
    }
  }
  if (trackGeneratedFiles) {
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, json({ schemaVersion: 1, files: generatedFiles }), 'utf8');
  }
  return { cards: collection.sourceById.size, chapters: collection.chapters.length, files: generatedFiles.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf('--output');
  const outputRoot = outputIndex >= 0 ? resolve(repositoryRoot, process.argv[outputIndex + 1] ?? '') : undefined;
  const trackGeneratedFiles = !process.argv.includes('--no-manifest');
  const result = await buildContent({ ...(outputRoot ? { outputRoot } : {}), trackGeneratedFiles });
  process.stdout.write(`Built ${result.cards} cards and ${result.chapters} chapters into ${result.files} JSON files.\n`);
}
