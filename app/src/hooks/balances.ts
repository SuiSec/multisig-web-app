// SPDX-License-Identifier: Apache-2.0
// On-chain coin balances for a multisig, read over gRPC (no JSON-RPC).

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';

import {
	coinSymbolFromType,
	formatUnits,
	isSuiType,
} from '../lib/coins';
import { QueryKeys } from '../lib/queryKeys';

export interface AssetBalance {
	coinType: string;
	symbol: string;
	name: string;
	decimals: number | null;
	iconUrl: string | null;
	/** Total spendable balance (coin objects + address balance accumulator). */
	raw: bigint;
	/** Portion held as coin objects. */
	coinRaw: bigint;
	/** Portion held in the address balance accumulator — spendable via a
	 *  FundsWithdrawal, which (unlike a coin object) is not locked by the
	 *  relay's equivocation guard, so transfers funded from it don't block
	 *  other pending proposals. */
	accumulatorRaw: bigint;
	formatted: string;
	isSui: boolean;
}

/**
 * List the multisig's non-zero coin balances, enriched with coin
 * metadata. listBalances failures propagate (the view shows an error);
 * per-coin metadata is a best-effort display enrichment — a coin whose
 * metadata can't be read still appears, using its type-derived symbol.
 */
export function useBalances(address?: string) {
	const client = useDAppKit().getClient();
	const network = useCurrentNetwork();

	return useQuery({
		queryKey: [QueryKeys.Balances, network, address],
		enabled: !!address,
		refetchInterval: 30_000,
		queryFn: async (): Promise<AssetBalance[]> => {
			const { balances } = await client.listBalances({
				owner: address!,
			});
			const nonZero = balances.filter(
				(b) => BigInt(b.balance) > 0n,
			);

			const metas = await Promise.allSettled(
				nonZero.map((b) =>
					client.getCoinMetadata({ coinType: b.coinType }),
				),
			);

			const assets: AssetBalance[] = nonZero.map((b, i) => {
				const settled = metas[i];
				const meta =
					settled.status === 'fulfilled'
						? settled.value.coinMetadata
						: null;
				const sui = isSuiType(b.coinType);
				const decimals = meta?.decimals ?? (sui ? 9 : null);
				const raw = BigInt(b.balance);
				return {
					coinType: b.coinType,
					symbol:
						meta?.symbol ?? coinSymbolFromType(b.coinType),
					name:
						meta?.name ?? coinSymbolFromType(b.coinType),
					decimals,
					// SUI's on-chain iconUrl is empty, so use a locally
					// bundled logo (from CoinMarketCap); other coins fall
					// back to first-letter when blank.
					iconUrl: sui ? '/sui.png' : meta?.iconUrl || null,
					raw,
					coinRaw: BigInt(b.coinBalance),
					accumulatorRaw: BigInt(b.addressBalance),
					formatted: formatUnits(raw, decimals),
					isSui: sui,
				};
			});

			// SUI first, then largest raw balance, then symbol.
			return assets.sort((a, b) => {
				if (a.isSui !== b.isSui) return a.isSui ? -1 : 1;
				if (a.raw !== b.raw) return a.raw > b.raw ? -1 : 1;
				return a.symbol.localeCompare(b.symbol);
			});
		},
	});
}
