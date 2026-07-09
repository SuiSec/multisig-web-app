// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import type {
	PackageRecord,
	RecordPackageRequest,
} from '@mysten/sagat';
import {
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { anchorPackageRecord } from '../lib/anchor';
import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

/** Packages governed by a multisig (publish/upgrade records). */
export function useMultisigPackages(address?: string) {
	const network = useCurrentNetwork();
	return useQuery({
		queryKey: [QueryKeys.Packages, network, address],
		queryFn: () =>
			apiClient.listMultisigPackages(address!, network),
		enabled: !!address,
	});
}

/** Public verification record(s) for a package id. */
export function usePackageRecords(
	packageId?: string,
	network?: string,
) {
	return useQuery({
		queryKey: [QueryKeys.Package, packageId, network],
		queryFn: () =>
			apiClient.getPackageRecords(packageId!, network),
		enabled: !!packageId,
	});
}

/**
 * Chain-anchor a relay-supplied package record (see lib/anchor). Bound to the
 * record's OWN network, not the connected one — records are cross-network. The
 * UI treats `data.ok !== true` OR `isError` as "not anchored".
 */
export function usePackageAnchor(
	record?: PackageRecord | null,
) {
	const dappKit = useDAppKit();
	return useQuery({
		queryKey: [
			QueryKeys.PackageAnchor,
			record?.packageId,
			record?.network,
			record?.txDigest,
		],
		queryFn: () =>
			anchorPackageRecord(
				dappKit.getClient(record!.network as never),
				record!,
			),
		enabled: !!record,
	});
}

export function useRecordPackage() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: RecordPackageRequest) =>
			apiClient.recordPackage(data),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Packages],
			});
			toast.success('Package recorded for verification');
		},
		onError: (e: Error) =>
			toast.error(`Failed to record package: ${e.message}`),
	});
}
