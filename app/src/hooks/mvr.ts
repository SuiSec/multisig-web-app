// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';

import { reverseResolvePackages } from '../lib/mvr';

/** Reverse-resolve a set of package IDs to MVR names (id → @scope/name). */
export function useReverseResolve(
	network: string,
	packageIds: string[],
) {
	const ids = [...new Set(packageIds)].sort();
	return useQuery({
		queryKey: ['mvr-reverse', network, ids],
		queryFn: () => reverseResolvePackages(network, ids),
		enabled: ids.length > 0,
		staleTime: 5 * 60 * 1000,
		retry: false,
	});
}
