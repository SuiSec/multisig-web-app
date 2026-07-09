// SPDX-License-Identifier: Apache-2.0

import type { CreateDraftRequest } from '@mysten/sagat';
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

export function useCreateDraft() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (data: CreateDraftRequest) =>
			apiClient.createDraft(data),
		onSuccess: (res) => {
			qc.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			qc.invalidateQueries({
				queryKey: [QueryKeys.Drafts],
			});
			if (res.finalizedAddress) {
				toast.success('Multisig created');
				navigate(`/multisig/${res.finalizedAddress}`);
			} else {
				toast.success(
					'Draft created — share the invite link with members',
				);
				navigate(`/invitations?draft=${res.id}`);
			}
		},
		onError: (e: Error) =>
			toast.error(`Failed to create draft: ${e.message}`),
	});
}

export function useDraft(id?: string | null) {
	return useQuery({
		queryKey: [QueryKeys.Draft, id],
		queryFn: () => apiClient.getDraft(id!),
		enabled: !!id,
		refetchInterval: 8000,
	});
}

export function useMyDrafts() {
	const { isCurrentAddressAuthenticated } = useApiAuth();
	return useQuery({
		queryKey: [QueryKeys.Drafts],
		queryFn: () => apiClient.listDrafts(),
		enabled: isCurrentAddressAuthenticated,
		refetchInterval: 15000,
	});
}

export function useJoinDraft() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => apiClient.joinDraft(id),
		onSuccess: (res, id) => {
			qc.invalidateQueries({
				queryKey: [QueryKeys.Draft, id],
			});
			qc.invalidateQueries({
				queryKey: [QueryKeys.Drafts],
			});
			qc.invalidateQueries({
				queryKey: [QueryKeys.Multisigs],
			});
			if (res.finalized && res.address) {
				toast.success(
					'All members joined — multisig is live',
				);
				navigate(`/multisig/${res.address}`);
			} else {
				toast.success('Joined — waiting for other members');
			}
		},
		onError: (e: Error) =>
			toast.error(`Failed to join: ${e.message}`),
	});
}
