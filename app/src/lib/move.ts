// SPDX-License-Identifier: Apache-2.0
// Parse the inputs needed to publish/upgrade a Move package from the browser.
//
// Move bytecode cannot be compiled in a browser sandbox, so the user compiles
// locally (`sui move build`). Two inputs:
//   1. The authoritative build artifact — the JSON printed by
//      `sui move build --dump-bytecode-as-base64` → { modules, dependencies,
//      digest }. This is the source of truth for the on-chain transaction.
//   2. The project folder (optional) — whitelisted source files for the Walrus
//      archive + a security pass that EXCLUDES `.env*` and other secrets by
//      name (never reading their contents).

import { toBase64 } from '@mysten/sui/utils';

export interface BuildArtifact {
	/** Base64-encoded compiled bytecode modules. */
	modules: string[];
	/** On-chain package IDs of (transitive) dependencies. */
	dependencies: string[];
	/** Package digest as base64 ('' if absent). Required for upgrades. */
	digest: string;
}

export interface MoveSourceFile {
	path: string;
	content: string;
}

export interface ProjectSource {
	packageName: string | null;
	/** Whitelisted text files: Move.toml, Move.lock, sources/**.move. */
	files: MoveSourceFile[];
	/** Count of everything skipped (build output, dotfiles, secrets…). */
	skippedCount: number;
	/** Secret-bearing files skipped by name — surfaced to reassure the user. */
	sensitiveSkipped: string[];
}

/**
 * Pull the outermost `{ … }` object out of pasted text. The Sui CLI prints
 * build progress/warnings to stderr, but a terminal copy often drags those
 * lines along with the JSON — slice from the first `{` to the last `}` so the
 * paste still parses. (Errors are still surfaced if it isn't valid JSON.)
 */
function extractJsonObject(text: string): string {
	const t = text.trim();
	const first = t.indexOf('{');
	const last = t.lastIndexOf('}');
	if (first === -1 || last === -1 || last < first)
		throw new Error(
			'No JSON object found — paste the { modules, dependencies, digest } printed by the build.',
		);
	return t.slice(first, last + 1);
}

/**
 * Parse `sui move build --dump-bytecode-as-base64` output. Throws (rather than
 * silently coercing) on anything that isn't a well-formed artifact.
 */
export function parseDumpJson(text: string): BuildArtifact {
	let raw: unknown;
	try {
		raw = JSON.parse(extractJsonObject(text));
	} catch (e) {
		throw new Error(
			e instanceof Error && e.message.startsWith('No JSON')
				? e.message
				: 'Not valid JSON — paste the { modules, dependencies, digest } object.',
		);
	}
	if (typeof raw !== 'object' || raw === null)
		throw new Error('Expected a JSON object.');

	const obj = raw as Record<string, unknown>;

	if (
		!Array.isArray(obj.modules) ||
		obj.modules.length === 0 ||
		!obj.modules.every((m) => typeof m === 'string')
	)
		throw new Error(
			'`modules` must be a non-empty array of base64 strings.',
		);

	if (
		!Array.isArray(obj.dependencies) ||
		!obj.dependencies.every((d) => typeof d === 'string')
	)
		throw new Error(
			'`dependencies` must be an array of package IDs.',
		);

	let digest = '';
	if (Array.isArray(obj.digest)) {
		if (!obj.digest.every((n) => typeof n === 'number'))
			throw new Error('`digest` bytes must be numbers.');
		digest = toBase64(
			Uint8Array.from(obj.digest as number[]),
		);
	} else if (typeof obj.digest === 'string') {
		digest = obj.digest;
	}

	return {
		modules: obj.modules as string[],
		dependencies: obj.dependencies as string[],
		digest,
	};
}

// ---- Folder ingestion (whitelist; secrets excluded by name) ----------------

function relativePath(file: File): string {
	// webkitRelativePath is "<chosenDir>/a/b.move"; drop the chosen-dir prefix
	// so archive paths are project-relative and deterministic.
	const raw =
		(file as File & { webkitRelativePath?: string })
			.webkitRelativePath || file.name;
	const slash = raw.indexOf('/');
	return slash === -1 ? raw : raw.slice(slash + 1);
}

function isSecret(path: string): boolean {
	const base = path.split('/').pop() ?? path;
	return base === '.env' || base.startsWith('.env.');
}

function isWhitelisted(path: string): boolean {
	if (path === 'Move.toml' || path === 'Move.lock')
		return true;
	return (
		path.startsWith('sources/') && path.endsWith('.move')
	);
}

function packageNameFromToml(toml: string): string | null {
	// First `name = "..."` (the [package] section appears before [addresses]).
	const m = toml.match(/name\s*=\s*"([^"]+)"/);
	return m ? m[1] : null;
}

/**
 * Read a selected project folder. Only whitelisted text files are read; every
 * other entry (build output, `.git/`, `node_modules/`, dotfiles and crucially
 * `.env*`) is counted as skipped and never opened.
 */
export async function readProjectFolder(
	fileList: FileList | File[],
): Promise<ProjectSource> {
	const files = Array.from(fileList);
	const kept: MoveSourceFile[] = [];
	const sensitiveSkipped: string[] = [];
	let skippedCount = 0;
	let packageName: string | null = null;

	for (const file of files) {
		const path = relativePath(file);
		if (!isWhitelisted(path)) {
			skippedCount++;
			if (isSecret(path)) sensitiveSkipped.push(path);
			continue;
		}
		const content = await file.text();
		if (path === 'Move.toml')
			packageName = packageNameFromToml(content);
		kept.push({ path, content });
	}

	kept.sort((a, b) => a.path.localeCompare(b.path));
	return {
		packageName,
		files: kept,
		skippedCount,
		sensitiveSkipped,
	};
}
