// Deterministic SHA-256 manifest of the built frontend (app/dist).
//
// CI and anyone reproducing a release run this and compare the output: identical
// source + locked deps + the same build-time VITE_* values produce an identical
// manifest, byte for byte. Run after `bun run build`:
//
//   bun scripts/build-manifest.mjs
//
// Writes `dist-manifest.txt` (one `sha256␣␣relative/path` line per file, sorted)
// and `dist-digest.txt` (a single SHA-256 over that manifest — the release
// fingerprint). Both are printed too.

import { createHash } from 'node:crypto';
import {
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'app/dist';

function walk(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...walk(p));
		else out.push(p);
	}
	return out;
}

let files;
try {
	files = walk(DIST);
} catch {
	console.error(
		`error: ${DIST} not found — run \`bun run build\` first.`,
	);
	process.exit(1);
}

const entries = files
	.map((f) => ({
		// Normalize path separators so the manifest is identical across OSes.
		path: relative(DIST, f).split(sep).join('/'),
		hash: createHash('sha256')
			.update(readFileSync(f))
			.digest('hex'),
	}))
	.sort((a, b) =>
		a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
	);

const manifest =
	entries.map((e) => `${e.hash}  ${e.path}`).join('\n') +
	'\n';
writeFileSync('dist-manifest.txt', manifest);

const digest = createHash('sha256')
	.update(manifest)
	.digest('hex');
writeFileSync('dist-digest.txt', digest + '\n');

process.stdout.write(manifest);
console.log(`\nbundle-digest sha256: ${digest}`);
console.log(`files: ${entries.length}`);
