import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { publishDocs } from './pages-publisher.mjs';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [
  ['generated content', '--experimental-strip-types', 'scripts/build-content.mjs', '--output', '.local-tools/content'],
  ['typecheck', 'node_modules/typescript/bin/tsc', '-b'],
  ['lint', 'node_modules/eslint/bin/eslint.js', '.'],
  ['unit tests', 'node_modules/vitest/vitest.mjs', 'run'],
  ['publication tests', '--test', 'tests/deployment/pages-publisher.test.mjs'],
  ['SQL/RLS tests', 'scripts/test-sql.mjs'],
  ['production build', 'node_modules/vite/bin/vite.js', 'build'],
  ['offline service worker', 'scripts/build-sw.mjs'],
  ['browser tests', 'node_modules/@playwright/test/cli.js', 'test', '--workers=1'],
];
for (const [name, ...args] of checks) {
  console.log(`Checking ${name}…`);
  const child = spawnSync(process.execPath, args, { cwd: workspace, stdio: 'inherit', windowsHide: true });
  if (child.error || child.status !== 0) {
    throw new Error(`${name} failed; docs were not published`);
  }
}
const publication = await publishDocs(workspace);
console.log(`Prepared ${publication.files} static files in docs/. Backup: ${join(workspace, publication.backup)}`);
console.log('No commit, push, or GitHub settings changes were performed.');
