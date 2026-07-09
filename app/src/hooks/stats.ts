// SPDX-License-Identifier: Apache-2.0

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../lib/api';

/** Public lifetime aggregate stats. */
export function useStats() {
	return useQuery({
		queryKey: ['stats'],
		queryFn: () => apiClient.getStats(),
		refetchInterval: 30_000,
	});
}
