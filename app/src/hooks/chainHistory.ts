// SPDX-License-Identifier: Apache-2.0

import { useInfiniteQuery } from '@tanstack/react-query';

import { fetchMultisigTransactions } from '../lib/chainHistory';

/** Paginated on-chain executed-transaction history for a multisig address. */
export function useMultisigChainTransactions(
	address: string | undefined,
	network: string,
) {
	return useInfiniteQuery({
		queryKey: ['chain-txs', network, address],
		enabled: !!address,
		initialPageParam: null as string | null,
		queryFn: ({ pageParam }) =>
			fetchMultisigTransactions(
				network,
				address!,
				pageParam,
			),
		getNextPageParam: (last) =>
			last.hasMore ? last.nextCursor : undefined,
		staleTime: 30_000,
		retry: false,
	});
}
