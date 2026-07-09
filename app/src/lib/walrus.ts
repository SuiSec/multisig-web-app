// SPDX-License-Identifier: Apache-2.0
// Walrus source archive: a deterministic .zip of the (already whitelisted)
// project source folder, plus the public HTTP read path. Opening the blob URL
// downloads the project zip; the verification page unzips it to browse and
// download individual files. The WRITE path (uploading, signed by the
// proposer's wallet) lives in hooks/walrus.ts.

import {
	strFromU8,
	strToU8,
	unzipSync,
	zipSync,
} from 'fflate';

import type { MoveSourceFile } from './move';

// Public Walrus HTTP aggregators (read-only; no signing). `/v1/blobs/<id>`
// returns the raw blob bytes — here, the source .zip.
export const WALRUS_AGGREGATOR: Record<string, string> = {
	mainnet: 'https://aggregator.walrus-mainnet.walrus.space',
	testnet: 'https://aggregator.walrus-testnet.walrus.space',
};

// Zip stores DOS dates (1980–2099 only), so a fixed mtime must be in range.
// Pin to 1980-01-01 UTC so identical source → identical bytes (deterministic).
const ZIP_FIXED_MTIME = 315_532_800_000; // ms

// Zip-bomb guards. The blobId is attacker-controllable (it comes from an
// untrusted relay record / proposal), so a tiny blob can declare gigabytes of
// output and freeze/OOM the tab — exactly when a signer is reviewing. Bound the
// compressed input, per-entry and total UNCOMPRESSED size (checked against the
// zip header BEFORE inflating, via fflate's filter), and the entry count.
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024; // compressed blob ceiling
const MAX_ENTRY_BYTES = 16 * 1024 * 1024; // per-file uncompressed ceiling
const MAX_TOTAL_BYTES = 64 * 1024 * 1024; // total uncompressed ceiling
const MAX_ENTRIES = 4000;

// A Walrus blob id is the URL-safe base64 of a 32-byte hash (~43 chars). Reject
// anything outside that charset before fetching an untrusted blobId — defense in
// depth on top of encodeURIComponent (no `.`/`/`/`?`/`#` can reach the URL).
const WALRUS_BLOB_ID = /^[A-Za-z0-9_-]{32,64}$/;
function assertBlobId(blobId: string): void {
	if (!WALRUS_BLOB_ID.test(blobId))
		throw new Error(`Invalid Walrus blob id: ${blobId}`);
}

/**
 * Deterministic .zip of the whitelisted source files. Entries are sorted and
 * given a fixed mtime so identical source yields identical bytes → identical
 * Walrus blob id (so the dedup/reuse check actually matches on re-proposal).
 */
export function zipProjectSource(
	files: MoveSourceFile[],
): Uint8Array {
	const sorted = [...files].sort((a, b) =>
		a.path.localeCompare(b.path),
	);
	const entries: Record<
		string,
		[Uint8Array, { mtime: number }]
	> = {};
	for (const f of sorted)
		entries[f.path] = [
			strToU8(f.content),
			{ mtime: ZIP_FIXED_MTIME },
		];
	return zipSync(entries, { level: 6 });
}

/** Inverse of zipProjectSource — used by the verification page. */
export function unzipSourceArchive(
	bytes: Uint8Array,
): MoveSourceFile[] {
	if (bytes.length > MAX_ARCHIVE_BYTES)
		throw new Error(
			`Source archive is too large (${bytes.length} bytes) — refusing to unzip.`,
		);

	let entryCount = 0;
	let totalBytes = 0;
	// fflate calls `filter` per entry with the header-declared sizes BEFORE
	// inflating, so a zip bomb is rejected without ever decompressing it.
	const unzipped = unzipSync(bytes, {
		filter: (file) => {
			if (++entryCount > MAX_ENTRIES)
				throw new Error(
					'Source archive has too many entries — refusing to unzip (possible zip bomb).',
				);
			if (file.originalSize > MAX_ENTRY_BYTES)
				throw new Error(
					`Source archive entry "${file.name}" is too large — refusing to unzip (possible zip bomb).`,
				);
			totalBytes += file.originalSize;
			if (totalBytes > MAX_TOTAL_BYTES)
				throw new Error(
					'Source archive decompresses too large — refusing to unzip (possible zip bomb).',
				);
			return true;
		},
	});
	return Object.entries(unzipped)
		.map(([path, data]) => ({
			path,
			content: strFromU8(data),
		}))
		.sort((a, b) => a.path.localeCompare(b.path));
}

/** Fetch + unzip the archived source from Walrus via the public aggregator. */
export async function readSourceArchive(
	network: string,
	blobId: string,
): Promise<MoveSourceFile[]> {
	assertBlobId(blobId);
	const base =
		WALRUS_AGGREGATOR[network] ?? WALRUS_AGGREGATOR.testnet;
	const res = await fetch(
		`${base}/v1/blobs/${encodeURIComponent(blobId)}`,
	);
	if (!res.ok)
		throw new Error(
			`Walrus read failed (${res.status}) for blob ${blobId}`,
		);
	const buf = new Uint8Array(await res.arrayBuffer());
	return unzipSourceArchive(buf);
}

/** Public URL for the raw blob (the source .zip). */
export function walrusBlobUrl(
	network: string,
	blobId: string,
): string {
	const base =
		WALRUS_AGGREGATOR[network] ?? WALRUS_AGGREGATOR.testnet;
	return `${base}/v1/blobs/${encodeURIComponent(blobId)}`;
}

/**
 * Save the archived source .zip to the user's machine. A plain <a download> is
 * ignored cross-origin (the aggregator is a different origin), so fetch the
 * bytes and download them via a Blob URL with a real filename.
 */
export async function downloadSourceZip(
	network: string,
	blobId: string,
	filename = 'source.zip',
): Promise<void> {
	assertBlobId(blobId);
	const res = await fetch(walrusBlobUrl(network, blobId));
	if (!res.ok)
		throw new Error(
			`Walrus download failed (${res.status}) for blob ${blobId}`,
		);
	const blob = await res.blob();
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
