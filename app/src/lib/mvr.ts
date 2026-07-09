// SPDX-License-Identifier: Apache-2.0
// Move Registry (MVR) reverse resolution: on-chain package ID → registered
// `@scope/name`. A registered name is a strong provenance signal ("you are
// calling @deepbook/core"); an UNregistered package is itself worth noticing.
//
// Public read-only HTTP API (no key). Only mainnet/testnet are served by MVR;
// other networks resolve to nothing. Best-effort enrichment — a miss just
// means we show the raw ID, never a failure that blocks review.

const MVR_BASE: Record<string, string | undefined> = {
	mainnet: 'https://mainnet.mvr.mystenlabs.com',
	testnet: 'https://testnet.mvr.mystenlabs.com',
};

/** Map each package ID to its `@scope/name`, omitting unregistered ones. */
export async function reverseResolvePackages(
	network: string,
	packageIds: string[],
): Promise<Record<string, string>> {
	const base = MVR_BASE[network];
	const ids = [...new Set(packageIds)].filter(Boolean);
	if (!base || ids.length === 0) return {};

	const res = await fetch(
		`${base}/v1/reverse-resolution/bulk`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ package_ids: ids }),
		},
	);
	if (!res.ok)
		throw new Error(`MVR reverse-resolution ${res.status}`);

	const data = (await res.json()) as {
		resolution?: Record<string, { name?: string }>;
	};
	const out: Record<string, string> = {};
	for (const [id, v] of Object.entries(
		data.resolution ?? {},
	))
		if (v?.name) out[id] = v.name;
	return out;
}
