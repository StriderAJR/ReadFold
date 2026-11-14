import { findEntity, loadContentSources } from './build-content.mjs';

const [id, ...extra] = process.argv.slice(2);
if (!id || extra.length) {
  process.stderr.write('Usage: npm run content:entity -- <entity-id>\n');
  process.exitCode = 1;
} else {
  try {
    const entity = findEntity(await loadContentSources(), id);
    process.stdout.write(`${JSON.stringify(entity, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
