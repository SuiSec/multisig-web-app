// SPDX-License-Identifier: Apache-2.0
// Best-effort CoinMetadata (decimals + symbol) for an arbitrary set of coin
// types, keyed by coin type. Used to render withdrawal limits in the security
// review with the token's real scale/unit. Mirrors the best-effort metadata
// handling in hooks/tokens.ts and hooks/balances.ts: a type whose metadata
// can't be read still resolves — with `decimals: null` (raw display, no guessed
// scale) and its type-derived symbol.

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';

import {
	coinSymbolFromType,
	isSuiType,
} from '../lib/coins';
import { QueryKeys } from '../lib/queryKeys';

export interface CoinMeta {
	/** `null` when metadata was unavailable — caller shows the raw integer. */
	decimals: number | null;
	symbol: string;
}

export function useCoinMeta(coinTypes: string[]) {
	const client = useDAppKit().getClient();
	const network = useCurrentNetwork();
	const types = [...new Set(coinTypes)].sort();

	return useQuery({
		queryKey: [QueryKeys.CoinMeta, network, types],
		enabled: types.length > 0,
		staleTime: 5 * 60_000,
		queryFn: async (): Promise<
			Record<string, CoinMeta>
		> => {
			const settled = await Promise.allSettled(
				types.map((t) =>
					client.getCoinMetadata({ coinType: t }),
				),
			);
			const out: Record<string, CoinMeta> = {};
			types.forEach((t, i) => {
				const r = settled[i];
				const meta =
					r.status === 'fulfilled'
						? r.value.coinMetadata
						: null;
				out[t] = {
					decimals:
						meta?.decimals ?? (isSuiType(t) ? 9 : null),
					symbol: meta?.symbol ?? coinSymbolFromType(t),
				};
			});
			return out;
		},
	});
}
