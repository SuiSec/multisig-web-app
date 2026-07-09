// SPDX-License-Identifier: Apache-2.0

import {
	useInfiniteQuery,
	useQuery,
} from '@tanstack/react-query';

import {
	fetchMultisigObjects,
	fetchObjectsDisplay,
} from '../lib/chainObjects';
import { graphqlAvailable } from '../lib/suiGraphql';

/** Paginated owned (key+store, non-coin) objects for a multisig address. */
export function useMultisigObjects(
	address: string | undefined,
	network: string,
) {
	return useInfiniteQuery({
		queryKey: ['chain-objects', network, address],
		enabled: !!address,
		initialPageParam: null as string | null,
		queryFn: ({ pageParam }) =>
			fetchMultisigObjects(network, address!, pageParam),
		getNextPageParam: (last) =>
			last.hasMore ? last.nextCursor : undefined,
		staleTime: 30_000,
		retry: false,
	});
}

/** Type + Display metadata for a set of object ids (id → display). */
export function useObjectsDisplay(
	network: string,
	ids: string[],
) {
	const key = [...new Set(ids)].sort();
	return useQuery({
		queryKey: ['object-display', network, key],
		enabled: key.length > 0 && graphqlAvailable(network),
		queryFn: () => fetchObjectsDisplay(network, key),
		staleTime: 30_000,
		retry: false,
	});
}
