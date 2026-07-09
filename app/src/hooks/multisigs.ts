// SPDX-License-Identifier: Apache-2.0

import type { MultisigWithMembers } from '@mysten/sagat';
import {
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

export interface UserMultisig extends MultisigWithMembers {
	pendingMembers: number;
}

export function useUserMultisigs() {
	const { isCurrentAddressAuthenticated, currentAddress } =
		useApiAuth();

	return useQuery({
		queryKey: [
			QueryKeys.Multisigs,
			'user',
			currentAddress?.publicKey,
		],
		queryFn: async (): Promise<UserMultisig[]> => {
			if (!currentAddress)
				throw new Error('No wallet connected');
			const connections =
				await apiClient.getMultisigConnections();
			return (
				connections[currentAddress.publicKey] || []
			).map((m) => ({
				...m,
				pendingMembers: m.members.filter(
					(member) =>
						!member.isAccepted && !member.isRejected,
				).length,
			}));
		},
		enabled: isCurrentAddressAuthenticated,
		staleTime: 30_000,
		refetchInterval: 60_000,
	});
}

export function useGetMultisig(address?: string) {
	return useQuery({
		queryKey: [QueryKeys.Multisig, address],
		queryFn: () => apiClient.getMultisig(address!),
		enabled: !!address,
		staleTime: 30_000,
	});
}

export function useRenameMultisig(address: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (name: string) =>
			apiClient.renameMultisig(address, name),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisig, address],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			toast.success('Name updated');
		},
		onError: (e: Error) =>
			toast.error(`Failed to rename: ${e.message}`),
	});
}

export interface CreateMultisigInput {
	name?: string;
	threshold: number;
	members: { publicKey: string; weight: number }[];
}

export function useCreateMultisig() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { currentAddress } = useApiAuth();

	return useMutation({
		mutationFn: async (data: CreateMultisigInput) => {
			if (!currentAddress)
				throw new Error('No wallet connected');
			// Register the connected pubkeys (incl. creator) so member rows
			// satisfy the addresses foreign key.
			await apiClient.registerAddresses();
			return apiClient.createMultisig({
				publicKeys: data.members.map((m) => m.publicKey),
				weights: data.members.map((m) => m.weight),
				threshold: data.threshold,
				name: data.name || undefined,
			});
		},
		onSuccess: (multisig) => {
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			toast.success('Multisig created');
			navigate(`/multisig/${multisig.address}`);
		},
		onError: (e: Error) =>
			toast.error(
				`Failed to create multisig: ${e.message}`,
			),
	});
}
