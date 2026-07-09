// SPDX-License-Identifier: Apache-2.0
// Closed-loop `Token<T>` holdings for a multisig: aggregated over Sui GraphQL
// (see lib/chainTokens), then enriched with coin metadata over gRPC — the same
// CoinMetadata that backs the coins list, since a Token<T> shares its T's
// metadata. Read-only display; closed-loop tokens can't be freely transferred
// (that requires the type's TokenPolicy), so there's no Transfer action.

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';

import { fetchMultisigTokens } from '../lib/chainTokens';
import {
	coinSymbolFromType,
	formatUnits,
} from '../lib/coins';
import { QueryKeys } from '../lib/queryKeys';
import { graphqlAvailable } from '../lib/suiGraphql';
import type { AssetBalance } from './balances';

export interface TokenBalance extends AssetBalance {
	/** How many distinct Token<T> objects make up this total. */
	objectCount: number;
}

/**
 * The multisig's closed-loop token totals, one row per coin type. Enabled only
 * when `address` is set and the network has a Sui GraphQL endpoint (the source
 * of truth for owned objects). Per-coin metadata is best-effort: a token whose
 * metadata can't be read still appears, using its type-derived symbol.
 */
export function useMultisigTokens(address?: string) {
	const client = useDAppKit().getClient();
	const network = useCurrentNetwork();

	return useQuery({
		queryKey: [QueryKeys.Tokens, network, address],
		enabled: !!address && graphqlAvailable(network),
		refetchInterval: 30_000,
		queryFn: async (): Promise<TokenBalance[]> => {
			const totals = await fetchMultisigTokens(
				network,
				address!,
			);

			const metas = await Promise.allSettled(
				totals.map((t) =>
					client.getCoinMetadata({ coinType: t.coinType }),
				),
			);

			const tokens: TokenBalance[] = totals.map((t, i) => {
				const settled = metas[i];
				const meta =
					settled.status === 'fulfilled'
						? settled.value.coinMetadata
						: null;
				const decimals = meta?.decimals ?? null;
				return {
					coinType: t.coinType,
					symbol:
						meta?.symbol ?? coinSymbolFromType(t.coinType),
					name:
						meta?.name ?? coinSymbolFromType(t.coinType),
					decimals,
					iconUrl: meta?.iconUrl || null,
					raw: t.raw,
					// Closed-loop Token<T> is only ever held as objects — there's
					// no address-balance accumulator for it.
					coinRaw: t.raw,
					accumulatorRaw: 0n,
					formatted: formatUnits(t.raw, decimals),
					isSui: false,
					objectCount: t.objectCount,
				};
			});

			// Largest balance first, then symbol.
			return tokens.sort((a, b) => {
				if (a.raw !== b.raw) return a.raw > b.raw ? -1 : 1;
				return a.symbol.localeCompare(b.symbol);
			});
		},
	});
}
