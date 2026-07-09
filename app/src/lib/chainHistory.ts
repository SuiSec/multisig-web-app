// SPDX-License-Identifier: Apache-2.0
// Executed-transaction history, read DIRECTLY from the chain via Sui GraphQL
// (the relay is coordination-only and deletes proposals once executed). gRPC
// has no "list transactions by address"; GraphQL's `transactions(filter:
// { sentAddress })` does.

import { suiGraphqlRequest } from './suiGraphql';

export { graphqlAvailable } from './suiGraphql';

export interface ChainTx {
	digest: string;
	timestampMs: number | null;
	status: string | null; // 'SUCCESS' | 'FAILURE' | …
	checkpoint: number | null;
	gas: {
		computation: string;
		storage: string;
		rebate: string;
	} | null;
}

export interface ChainTxPage {
	items: ChainTx[]; // newest-first
	/** Cursor to fetch the next (older) page via `before`. */
	nextCursor: string | null;
	hasMore: boolean;
}

const QUERY = `query Txs($addr: SuiAddress!, $last: Int!, $before: String) {
  transactions(last: $last, before: $before, filter: { sentAddress: $addr }) {
    pageInfo { hasPreviousPage startCursor }
    nodes {
      digest
      effects {
        timestamp
        status
        checkpoint { sequenceNumber }
        gasEffects { gasSummary { computationCost storageCost storageRebate } }
      }
    }
  }
}`;

interface GqlNode {
	digest: string;
	effects: {
		timestamp: string | null;
		status: string | null;
		checkpoint: { sequenceNumber: number } | null;
		gasEffects: {
			gasSummary: {
				computationCost: number | string;
				storageCost: number | string;
				storageRebate: number | string;
			} | null;
		} | null;
	} | null;
}

/** Fetch a page of the multisig's executed transactions (newest-first). */
export async function fetchMultisigTransactions(
	network: string,
	address: string,
	before: string | null = null,
	last = 25,
): Promise<ChainTxPage> {
	const data = await suiGraphqlRequest<{
		transactions?: {
			pageInfo: {
				hasPreviousPage: boolean;
				startCursor: string | null;
			};
			nodes: GqlNode[];
		};
	}>(network, QUERY, { addr: address, last, before });

	const conn = data.transactions;
	const nodes = conn?.nodes ?? [];
	const items: ChainTx[] = nodes
		.map((n) => {
			const e = n.effects;
			const gs = e?.gasEffects?.gasSummary;
			return {
				digest: n.digest,
				timestampMs: e?.timestamp
					? Date.parse(e.timestamp)
					: null,
				status: e?.status ?? null,
				checkpoint: e?.checkpoint?.sequenceNumber ?? null,
				gas: gs
					? {
							computation: String(gs.computationCost),
							storage: String(gs.storageCost),
							rebate: String(gs.storageRebate),
						}
					: null,
			};
		})
		// `last` returns oldest-first within the window; show newest-first.
		.reverse();

	return {
		items,
		nextCursor: conn?.pageInfo.startCursor ?? null,
		hasMore: !!conn?.pageInfo.hasPreviousPage,
	};
}
