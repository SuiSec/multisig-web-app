// SPDX-License-Identifier: Apache-2.0
// User-pinnable gRPC endpoint per network (G2 — RPC trust).
//
// The whole security review — dry-run "would succeed", simulated balance flows,
// privileged-transfer detection — is only as trustworthy as the fullnode that
// answered the simulation. A malicious or MITM'd endpoint can return a benign
// result for a malicious transaction and defeat the entire review. So we (a) let
// a user PIN their own trusted endpoint instead of forcing the default, and (b)
// surface which host actually simulated, in the review UI, so an unexpected
// endpoint is visible rather than silent.
//
// The client is created once per network at startup (main.tsx), so a changed
// endpoint takes effect on reload — the settings UI reloads after saving.

type Network = 'mainnet' | 'testnet';

/** Mysten's public fullnode — the default when the user hasn't pinned one. */
function defaultBaseUrl(network: Network): string {
	return `https://fullnode.${network}.sui.io:443`;
}

function storageKey(network: Network): string {
	return `msw:rpc:${network}`;
}

/**
 * Validate a user-supplied endpoint. HTTPS is required: a plaintext or
 * downgraded endpoint would let a network attacker forge simulation results,
 * which is exactly the trust G2 is about. Throws (never silently coerces) so the
 * caller surfaces the reason to the user.
 */
export function validateRpcUrl(raw: string): string {
	const trimmed = raw.trim();
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new Error('Not a valid URL.');
	}
	if (url.protocol !== 'https:')
		throw new Error(
			'Endpoint must use https:// — a plaintext endpoint can be tampered with in transit.',
		);
	// Normalize away a trailing slash so it round-trips cleanly.
	return trimmed.replace(/\/+$/, '');
}

/** The gRPC base URL to use for `network`: the user's pin, or the default. */
export function getRpcBaseUrl(network: Network): string {
	const stored = localStorage.getItem(storageKey(network));
	if (!stored) return defaultBaseUrl(network);
	// Stored values are validated on write; if a hand-edited localStorage value
	// is malformed, fail loud rather than silently reverting to the default —
	// the user pinned an endpoint on purpose and must see it's broken.
	return validateRpcUrl(stored);
}

/** Host[:port] of the endpoint that will answer simulations — for display. */
export function getRpcHost(network: Network): string {
	return new URL(getRpcBaseUrl(network)).host;
}

/** Whether the user has pinned a custom endpoint (vs. the Mysten default). */
export function isCustomRpc(network: Network): boolean {
	return localStorage.getItem(storageKey(network)) !== null;
}

/** Pin a custom endpoint. Validates; throws on a bad URL. */
export function setRpcBaseUrl(
	network: Network,
	url: string,
): void {
	localStorage.setItem(
		storageKey(network),
		validateRpcUrl(url),
	);
}

/** Drop the pin, reverting to the Mysten default. */
export function clearRpcBaseUrl(network: Network): void {
	localStorage.removeItem(storageKey(network));
}
