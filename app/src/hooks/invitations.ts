// SPDX-License-Identifier: Apache-2.0
// Invitation hooks, adapted from Mysten Labs' Sagat (Apache-2.0).

import { useDAppKit } from '@mysten/dapp-kit-react';
import {
	PersonalMessages,
	type MultisigWithMembers,
} from '@mysten/sagat';
import {
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { apiClient } from '../lib/api';
import { QueryKeys } from '../lib/queryKeys';

export function useInvitations() {
	const { isCurrentAddressAuthenticated, currentAddress } =
		useApiAuth();

	return useQuery({
		queryKey: [
			QueryKeys.Invitations,
			currentAddress?.publicKey,
		],
		queryFn: async (): Promise<MultisigWithMembers[]> => {
			if (!currentAddress)
				throw new Error('No wallet connected');
			return apiClient.getInvitations(
				currentAddress.publicKey,
			);
		},
		enabled:
			isCurrentAddressAuthenticated && !!currentAddress,
		staleTime: 0,
	});
}

export function useRespondToInvitation() {
	const queryClient = useQueryClient();
	const dappKit = useDAppKit();

	return useMutation({
		mutationFn: async ({
			multisigAddress,
			accept,
		}: {
			multisigAddress: string;
			accept: boolean;
		}) => {
			const message = accept
				? PersonalMessages.acceptMultisigInvitation(
						multisigAddress,
					)
				: PersonalMessages.rejectMultisigInvitation(
						multisigAddress,
					);
			const { signature } =
				await dappKit.signPersonalMessage({
					message: new TextEncoder().encode(message),
				});
			return accept
				? apiClient.acceptMultisigInvite(multisigAddress, {
						signature,
					})
				: apiClient.rejectMultisigInvite(multisigAddress, {
						signature,
					});
		},
		onSuccess: (_res, { accept }) => {
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Invitations],
			});
			toast.success(
				accept
					? 'Invitation accepted'
					: 'Invitation rejected',
			);
		},
		onError: (e: Error) =>
			toast.error(`Failed: ${e.message}`),
	});
}
