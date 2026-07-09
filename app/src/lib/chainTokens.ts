// SPDX-License-Identifier: Apache-2.0
// Closed-loop tokens (`0x2::token::Token<T>`) owned by a multisig, read from the
// chain via Sui GraphQL. A `Token<T>` is NOT a `Coin<T>` (so gRPC `listBalances`
// never returns it) and usually has no `store` ability (so the owned-objects
// query, which keeps only `hasPublicTransfer` assets, drops it too). It would
// otherwise show up nowhere — this surfaces it. We aggregate every Token object
// of the same `T` into a single per-type total, mirroring how coins are summed.

import { suiGraphqlRequest } from './suiGraphql';

export interface TokenTotal {
	coinType: string; // the inner `T` of `Token<T>`
	raw: bigint; // summed balance across all Token<T> objects
	objectCount: number; // how many Token<T> objects make up the total
}

// `type:` is a prefix filter — this matches `0x2::token::Token<...>` for any T.
const TOKEN_TYPE_PREFIX = '0x2::token::Token';

const QUERY = `query Toks($owner: SuiAddress!, $after: String) {
  objects(filter: { owner: $owner, type: "${TOKEN_TYPE_PREFIX}" }, first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      asMoveObject {
        contents { type { repr } json }
      }
    }
  }
}`;

interface TokNode {
	asMoveObject: {
		contents: {
			type: { repr: string };
			json: unknown;
		} | null;
	} | null;
}

interface TokResponse {
	objects: {
		pageInfo: {
			hasNextPage: boolean;
			endCursor: string | null;
		};
		nodes: TokNode[];
	};
}

/** `0x…2::token::Token<0xpkg::mod::COIN>` → `0xpkg::mod::COIN`. */
function innerCoinType(repr: string): string {
	const lt = repr.indexOf('<');
	const gt = repr.lastIndexOf('>');
	if (lt === -1 || gt === -1 || gt <= lt)
		throw new Error(
			`Unexpected Token type (no <T>): ${repr}`,
		);
	return repr.slice(lt + 1, gt).trim();
}

/**
 * Read the u64 out of a Token's `balance` field. Sui GraphQL serialises
 * `Balance<T>` either as the bare u64 string or as `{ value: "…" }` depending
 * on version; both are valid shapes, so we accept either and fail loudly if the
 * field is missing or unparseable rather than silently treating it as zero.
 */
function tokenBalance(json: unknown): bigint {
	if (!json || typeof json !== 'object')
		throw new Error('Token contents JSON missing');
	const balance = (json as Record<string, unknown>).balance;
	const value =
		balance && typeof balance === 'object'
			? (balance as Record<string, unknown>).value
			: balance;
	if (
		typeof value === 'string' ||
		typeof value === 'number'
	)
		return BigInt(value);
	throw new Error(
		'Token balance value missing or unparseable',
	);
}

/**
 * Sum the multisig's closed-loop `Token<T>` holdings, grouped by `T`. Walks every
 * page of owned Token objects so the totals are complete (not truncated to the
 * first page). Read-only; no keys, no fullnode.
 */
export async function fetchMultisigTokens(
	network: string,
	address: string,
): Promise<TokenTotal[]> {
	const byType = new Map<
		string,
		{ raw: bigint; objectCount: number }
	>();

	let after: string | null = null;
	do {
		const data: TokResponse =
			await suiGraphqlRequest<TokResponse>(network, QUERY, {
				owner: address,
				after,
			});

		for (const n of data.objects.nodes) {
			const contents = n.asMoveObject?.contents;
			if (!contents) continue;
			const coinType = innerCoinType(contents.type.repr);
			const raw = tokenBalance(contents.json);
			const cur = byType.get(coinType) ?? {
				raw: 0n,
				objectCount: 0,
			};
			cur.raw += raw;
			cur.objectCount += 1;
			byType.set(coinType, cur);
		}

		after = data.objects.pageInfo.hasNextPage
			? data.objects.pageInfo.endCursor
			: null;
	} while (after);

	return [...byType.entries()].map(([coinType, v]) => ({
		coinType,
		raw: v.raw,
		objectCount: v.objectCount,
	}));
}
