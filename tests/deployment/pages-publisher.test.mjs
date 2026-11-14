import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { publishDocs } from '../../scripts/pages-publisher.mjs';

async function fixture(context) {
  const workspace = await mkdtemp(join(tmpdir(), 'readfold-pages-test-'));
  context.after(async () => {
    if (dirname(resolve(workspace)) !== resolve(tmpdir()) || !workspace.includes('readfold-pages-test-')) {
      throw new Error('Unsafe test cleanup target');
    }
    await rm(workspace, { recursive: true, force: true });
  });
  async function put(path, text) {
    await mkdir(dirname(join(workspace, path)), { recursive: true });
    await writeFile(join(workspace, path), text);
  }
  await put('dist/index.html', '<script type="module" src="/ReadFold/assets/app.js"></script>');
  await put('dist/assets/app.js', 'console.log("ReadFold")');
  await put('dist/sw.js', 'self.addEventListener("fetch", () => {});');
  await put('dist/privacy.html', 'new privacy');
  await put('dist/terms.html', 'new terms');
  await put('dist/books/catalog.json', '[]');
  await put('dist/ja/dictionary/index.json', '{"sections":{}}');
  await put('dist/googlef53875cf353db667.html', 'google-verification');
  await put('dist_public/googlef53875cf353db667.html', 'google-verification');
  await put('docs/googlef53875cf353db667.html', 'google-verification');
  await put('docs/index.html', 'old landing');
  await put('docs/privacy.html', 'old privacy');
  await put('docs/terms.html', 'old terms');
  await put('docs/architecture.md', '# Keep documentation');
  return { workspace, put, read: (path) => readFile(join(workspace, path), 'utf8') };
}

test('publishes compiled assets, preserves Markdown and verification, and backs up old HTML', async (context) => {
  const site = await fixture(context);
  const result = await publishDocs(site.workspace);
  assert.equal(await site.read('docs/index.html'), await site.read('dist/index.html'));
  assert.equal(await site.read('docs/privacy.html'), 'new privacy');
  assert.equal(await site.read('docs/architecture.md'), '# Keep documentation');
  assert.equal(await site.read('docs/ja/dictionary/index.json'), '{"sections":{}}');
  assert.equal(await site.read('docs/googlef53875cf353db667.html'), 'google-verification');
  assert.equal(await site.read('docs/.nojekyll'), '');
  assert.equal(await site.read(`${result.backup}/files/index.html`), 'old landing');
  assert.equal(await site.read(`${result.backup}/files/privacy.html`), 'old privacy');
  const manifest = JSON.parse(await site.read('docs/.readfold-publish.json'));
  assert.ok(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
});

test('removes only obsolete owned assets and keeps user files', async (context) => {
  const site = await fixture(context);
  await publishDocs(site.workspace);
  await rm(join(site.workspace, 'dist/assets/app.js'));
  await site.put('dist/assets/new.js', 'new build');
  await site.put('dist/index.html', '<script src="/ReadFold/assets/new.js"></script>');
  await site.put('docs/assets/user-notes.md', '# User notes');
  await publishDocs(site.workspace);
  assert.deepEqual((await readdir(join(site.workspace, 'docs/assets'))).sort(), ['new.js', 'user-notes.md']);
  assert.equal(await site.read('docs/assets/user-notes.md'), '# User notes');
});

test('rejects manually edited generated files before changing documentation', async (context) => {
  const site = await fixture(context);
  await publishDocs(site.workspace);
  await site.put('docs/assets/app.js', 'manual change');
  await assert.rejects(publishDocs(site.workspace), /edited manually/);
  assert.equal(await site.read('docs/assets/app.js'), 'manual change');
});

test('rejects traversal in a publication manifest without touching files', async (context) => {
  const site = await fixture(context);
  await site.put(
    'docs/.readfold-publish.json',
    JSON.stringify({ version: 1, files: [{ path: '../outside.js', sha256: 'a'.repeat(64) }] }),
  );
  await assert.rejects(publishDocs(site.workspace), /Invalid previous publication manifest/);
  assert.equal(await site.read('docs/index.html'), 'old landing');
});

test('rejects secrets and changed Google verification from build output', async (context) => {
  const site = await fixture(context);
  await site.put('dist/.env.local', 'private-data');
  await assert.rejects(publishDocs(site.workspace), /allowlist/);
  await rm(join(site.workspace, 'dist/.env.local'));
  await site.put('dist/googlef53875cf353db667.html', 'changed');
  await assert.rejects(publishDocs(site.workspace), /verification differs/);
  assert.equal(await site.read('docs/index.html'), 'old landing');
});

test('rejects symbolic links in build output', async (context) => {
  const site = await fixture(context);
  const assets = resolve(site.workspace, 'dist/assets');
  assert.equal(dirname(assets), join(site.workspace, 'dist'));
  await rm(assets, { recursive: true });
  await mkdir(join(site.workspace, 'outside'));
  try {
    await symlink(join(site.workspace, 'outside'), join(site.workspace, 'dist/assets'), 'junction');
  } catch (error) {
    if (process.platform === 'win32' && error?.code === 'EPERM') {
      context.skip('Windows does not permit creating a junction in this environment');
      return;
    }
    throw error;
  }
  await assert.rejects(publishDocs(site.workspace), /Symbolic links/);
  assert.equal(await site.read('docs/index.html'), 'old landing');
});
