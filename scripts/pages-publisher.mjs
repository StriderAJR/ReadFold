import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const marker = '.readfold-publish.json';
const verification = 'googlef53875cf353db667.html';
const rootFiles = new Set(['index.html', 'sw.js', 'privacy.html', 'terms.html', verification, '.nojekyll']);
const required = ['index.html', 'sw.js', 'privacy.html', 'terms.html', verification, 'books/catalog.json'];
const hash = (data) => createHash('sha256').update(data).digest('hex');

function managedPath(path) {
  if (typeof path !== 'string' || path.includes('\\') || isAbsolute(path)) {
    return false;
  }
  if (path.split('/').some((part) => !part || part === '.' || part === '..')) {
    return false;
  }
  return (
    rootFiles.has(path) ||
    (/^(assets|books|ja|brand|covers)\/[a-zA-Z0-9_./-]+\.(js|css|json|png|jpe?g|webp|svg|ico|woff2?)$/.test(path) &&
      !path.split('/').some((part) => part.startsWith('.')))
  );
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function safePath(workspace, path) {
  const absolute = resolve(workspace, path);
  const inside = relative(workspace, absolute);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error('Path outside publication workspace');
  }
  let current = workspace;
  for (const part of inside.split(/[\\/]/)) {
    current = join(current, part);
    if ((await exists(current)) && (await lstat(current)).isSymbolicLink()) {
      throw new Error('Symbolic links cannot be published');
    }
  }
  return absolute;
}

async function collect(workspace, directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const name = `${prefix}${entry.name}`;
    const path = await safePath(workspace, join(directory, entry.name));
    if (entry.isDirectory()) {
      files.push(...(await collect(workspace, path, `${name}/`)));
    } else if (entry.isFile() && managedPath(name)) {
      files.push({ path: name, sha256: hash(await readFile(path)) });
    } else {
      throw new Error('Build contains a file outside the static publication allowlist');
    }
  }
  return files.sort((left, right) => (left.path < right.path ? -1 : 1));
}

export async function publishDocs(workspace = process.cwd()) {
  workspace = resolve(workspace);
  const source = await safePath(workspace, 'dist');
  const target = await safePath(workspace, 'docs');
  const files = await collect(workspace, source);
  for (const path of required) {
    if (!files.some((file) => file.path === path)) {
      throw new Error(`Missing built file: ${path}`);
    }
  }
  const html = await readFile(join(source, 'index.html'), 'utf8');
  if (!html.includes('/ReadFold/assets/') || html.includes('/src/')) {
    throw new Error('Build must use /ReadFold/ and compiled assets');
  }
  const reference = await readFile(await safePath(workspace, join('dist_public', verification)));
  if (hash(await readFile(join(source, verification))) !== hash(reference)) {
    throw new Error('Google verification differs from public source');
  }
  const currentVerification = await safePath(workspace, join(target, verification));
  if ((await exists(currentVerification)) && hash(await readFile(currentVerification)) !== hash(reference)) {
    throw new Error('Existing Google verification must be preserved');
  }

  const manifestPath = join(target, marker);
  await safePath(workspace, manifestPath);
  const previous = (await exists(manifestPath))
    ? JSON.parse(await readFile(manifestPath, 'utf8'))
    : { version: 1, files: [] };
  if (
    previous.version !== 1 ||
    !Array.isArray(previous.files) ||
    previous.files.length > 10000 ||
    previous.files.some((file) => !managedPath(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256))
  ) {
    throw new Error('Invalid previous publication manifest');
  }
  const previousFiles = new Map(previous.files.map((file) => [file.path, file.sha256]));
  const incoming = new Map(files.map((file) => [file.path, file.sha256]));
  incoming.set('.nojekyll', hash(''));
  const changed = [...new Set([...incoming.keys(), ...previousFiles.keys(), marker])];
  for (const path of changed) {
    const destination = await safePath(workspace, join(target, path));
    if (!(await exists(destination))) {
      continue;
    }
    if (!(await lstat(destination)).isFile()) {
      throw new Error('Publication destination must be a regular file');
    }
    const currentHash = hash(await readFile(destination));
    if (previousFiles.has(path) && currentHash !== previousFiles.get(path) && currentHash !== incoming.get(path)) {
      throw new Error(`Generated file was edited manually; preserve it before publication: ${path}`);
    }
    if (!previousFiles.has(path) && !rootFiles.has(path) && path !== marker && currentHash !== incoming.get(path)) {
      throw new Error(`Unmanaged file would be overwritten: ${path}`);
    }
  }

  const backup = await safePath(
    workspace,
    join('.local-tools', 'pages-backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`),
  );
  const snapshot = [];
  for (const path of changed) {
    const destination = join(target, path);
    const existed = await exists(destination);
    snapshot.push({ path, existed });
    if (existed) {
      const archived = join(backup, 'files', path);
      await mkdir(dirname(archived), { recursive: true });
      await copyFile(destination, archived);
    }
  }
  await mkdir(backup, { recursive: true });
  await writeFile(join(backup, 'manifest.json'), JSON.stringify({ version: 1, files: snapshot }, null, 2));
  try {
    for (const file of files.filter((file) => file.path !== 'index.html')) {
      const destination = join(target, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(source, file.path), destination);
    }
    await mkdir(target, { recursive: true });
    await writeFile(join(target, '.nojekyll'), '');
    await copyFile(join(source, 'index.html'), join(target, 'index.html'));
    for (const path of previousFiles.keys()) {
      if (!incoming.has(path) && (await exists(join(target, path)))) {
        await unlink(join(target, path));
      }
    }
    await writeFile(
      manifestPath,
      JSON.stringify(
        { version: 1, base: '/ReadFold/', files: [...incoming].map(([path, sha256]) => ({ path, sha256 })) },
        null,
        2,
      ),
    );
  } catch (error) {
    const failures = [];
    for (const entry of snapshot) {
      try {
        const destination = await safePath(workspace, join(target, entry.path));
        if (entry.existed) {
          await copyFile(join(backup, 'files', entry.path), destination);
        } else if (await exists(destination)) {
          await unlink(destination);
        }
      } catch (failure) {
        failures.push(failure);
      }
    }
    if (failures.length) {
      throw new AggregateError([error, ...failures], `Publication failed; restore backup: ${backup}`);
    }
    throw error;
  }
  return { files: incoming.size, backup: relative(workspace, backup) };
}
