import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import test from 'node:test';
import { buildContent, createContentArtifacts, findEntity, loadContentSources, repositoryRoot } from './build-content.mjs';

const collection = await loadContentSources();

test('all editable cards and chapters produce complete location-only indexes reproducibly', () => {
  const first = createContentArtifacts(collection);
  const second = createContentArtifacts(collection);
  assert.deepEqual([...first], [...second]);
  const index = JSON.parse(first.get('ja/dictionary/index.json'));
  assert.equal(Object.keys(index.byId).length, 1051);
  assert.equal(collection.dictionary.words.length, 384);
  assert.equal(collection.dictionary.kanji.length, 527);
  assert.equal(collection.dictionary.grammar.length, 140);
  assert.equal(collection.chapters.length, 3);
  assert.equal(collection.chapters.reduce((count, { chapter }) => count + chapter.paragraphs.flatMap((part) => part.sentences).length, 0), 71);
  for (const [id, location] of Object.entries(index.byId)) {
    assert.deepEqual(Object.keys(location).sort(), ['file', 'kind', 'occurrencesFile']);
    const shard = JSON.parse(first.get(location.file));
    assert.ok(shard.entries.some((card) => card.id === id));
    assert.ok(index.sections[location.kind].includes(location.file));
    const occurrences = JSON.parse(first.get(location.occurrencesFile));
    assert.ok(Array.isArray(occurrences.byId[id]));
  }
  assert.ok(collection.sourceGroups.filter((group) => group.kind === 'words').every((group) => group.entries.length <= 24));
  assert.ok(collection.sourceGroups.filter((group) => group.kind !== 'words').every((group) => group.entries.length === 1));
});

test('collection build rejects duplicate IDs, dangling links, malformed segments and sentence counts', () => {
  const duplicate = structuredClone(collection);
  duplicate.dictionary.words.push(duplicate.dictionary.words[0]);
  assert.throws(() => createContentArtifacts(duplicate), /Dictionary IDs must be globally unique|Duplicate dictionary IDs/);
  const dangling = structuredClone(collection);
  dangling.chapters[0].chapter.paragraphs[0].sentences[0].wordOccurrences[0].wordId = 'ja:word:存在しない';
  assert.throws(() => createContentArtifacts(dangling), /Unknown dictionary reference/);
  const segments = structuredClone(collection);
  segments.chapters[0].chapter.paragraphs[0].sentences[0].segments[0].text = '違';
  assert.throws(() => createContentArtifacts(segments), /Segments must reproduce sentence text/);
  const count = structuredClone(collection);
  count.catalog[0].chapters[0].sentenceCount += 1;
  assert.throws(() => createContentArtifacts(count), /Chapter does not match catalog metadata/);
});

test('ID lookup returns editable files and sentence contexts without merging homonyms', () => {
  const existing = findEntity(collection, 'ja:word:ある:exist');
  const indefinite = findEntity(collection, 'ja:word:ある:indefinite');
  assert.notEqual(existing.card.id, indefinite.card.id);
  assert.match(existing.sourceFile, /^content\/ja\/dictionary\/words\/group-[0-9]{3}\.json$/);
  assert.ok(existing.occurrences.length > 0);
  assert.ok(indefinite.occurrences.length > 0);
  for (const occurrence of existing.occurrences) {
    assert.ok(occurrence.sentence.wordOccurrences.some((word) => word.wordId === existing.id));
    assert.match(occurrence.sourceFile, /^content\/ja\/books\//);
  }
  assert.throws(() => findEntity(collection, 'ja:word:unknown'), /Unknown entity ID/);
});

test('file build preserves unrelated files and removes only tracked obsolete JSON', async () => {
  const temporaryParent = resolve(repositoryRoot, '.local-tools');
  await mkdir(temporaryParent, { recursive: true });
  const outputRoot = await mkdtemp(resolve(temporaryParent, 'content-build-test-'));
  try {
    await buildContent({ outputRoot });
    const manifestPath = resolve(outputRoot, 'books/.generated-content.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const obsolete = 'ja/dictionary/words/obsolete.json';
    await writeFile(resolve(outputRoot, obsolete), '{}\n');
    await writeFile(resolve(outputRoot, 'books/keep.txt'), 'user file\n');
    manifest.files.push(obsolete);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await buildContent({ outputRoot });
    await assert.rejects(access(resolve(outputRoot, obsolete)), { code: 'ENOENT' });
    assert.equal(await readFile(resolve(outputRoot, 'books/keep.txt'), 'utf8'), 'user file\n');
  } finally {
    assert.ok(outputRoot.startsWith(`${temporaryParent}${sep}content-build-test-`));
    await rm(outputRoot, { recursive: true, force: true });
  }
});
