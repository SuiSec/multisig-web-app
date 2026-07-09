// SPDX-License-Identifier: Apache-2.0
// Proposal lifecycle hooks, adapted from Mysten Labs' Sagat (Apache-2.0).

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import {
	PersonalMessages,
	ProposalStatus,
	type PublicProposal,
} from '@mysten/sagat';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
	fromBase64,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import {
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiClient } from '../lib/api';
import {
	deriveMultisigAddress,
	multisigPublicKey,
} from '../lib/multisig';
import { QueryKeys } from '../lib/queryKeys';
import { assertCanonicalTxBytes } from '../lib/txIntegrity';

export function useProposals(
	multisigAddress?: string,
	status: ProposalStatus = ProposalStatus.PENDING,
) {
	const network = useCurrentNetwork();
	return useQuery({
		queryKey: [
			QueryKeys.Proposals,
			network,
			multisigAddress,
			status,
		],
		queryFn: () =>
			apiClient.getProposals(multisigAddress!, network, {
				status,
				perPage: 50,
			}),
		enabled: !!multisigAddress,
		refetchInterval: 20_000,
	});
}

export function useProposal(digest?: string) {
	return useQuery({
		queryKey: [QueryKeys.Proposal, digest],
		queryFn: () => apiClient.getProposalByDigest(digest!),
		enabled: !!digest,
		refetchInterval: 15_000,
	});
}

/** Build a frozen transaction, sign it, and register the proposal. */
export function useCreateProposal() {
	const network = useCurrentNetwork();
	const dappKit = useDAppKit();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			multisigAddress,
			transactionBytes,
			description,
			kind,
			buildDigest,
			sourceBlobId,
			toolchain,
			gitRepo,
			gitCommit,
			attestation,
		}: {
			multisigAddress: string;
			transactionBytes: string;
			description?: string;
			// Verifiable publish/upgrade metadata (relay stores, never verifies).
			kind?: 'generic' | 'publish' | 'upgrade';
			buildDigest?: string | null;
			sourceBlobId?: string | null;
			toolchain?: string | null;
			gitRepo?: string | null;
			gitCommit?: string | null;
			attestation?: string | null;
		}) => {
			// G1: never sign bytes that don't rebuild to themselves — the
			// wallet signs a rebuild of these bytes, so a non-canonical
			// proposal could sign something other than what was reviewed.
			await assertCanonicalTxBytes(
				transactionBytes,
				dappKit.getClient() as ClientWithCoreApi,
			);
			const transaction = Transaction.from(
				transactionBytes,
			);
			const { signature } = await dappKit.signTransaction({
				transaction,
			});
			return apiClient.createProposal({
				multisigAddress,
				transactionBytes,
				signature: signature as string,
				description,
				network,
				kind,
				buildDigest,
				sourceBlobId,
				toolchain,
				gitRepo,
				gitCommit,
				attestation,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			toast.success('Proposal created');
		},
		onError: (e: Error) =>
			toast.error(
				`Failed to create proposal: ${e.message}`,
			),
	});
}

export function useSignProposal() {
	const dappKit = useDAppKit();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			proposalId,
			transactionBytes,
			members,
			threshold,
			expectedMultisigAddress,
			reproduced,
			reviewedDiff,
		}: {
			proposalId: number;
			transactionBytes: string;
			// The member set + threshold of the multisig the signer believes they
			// are approving for. Used to RE-DERIVE the multisig address locally so
			// the bytes' sender can be bound to it — the relay-supplied address is
			// never trusted as the signing target.
			members: { publicKey: string; weight: number }[];
			threshold: number;
			// The multisig address from the URL the signer navigated to.
			expectedMultisigAddress: string;
			// Self-reported attestation for publish/upgrade (relay stores, never
			// verifies): did the signer locally reproduce the digest / read the diff?
			reproduced?: boolean;
			reviewedDiff?: boolean;
		}) => {
			const transaction = Transaction.from(
				transactionBytes,
			);

			// WYSIWYS sender binding. The bytes about to be signed must spend from
			// the exact multisig cryptographically derived from `members` +
			// `threshold`, and that must be the multisig the signer is looking at.
			// Without this gate a malicious / MITM'd relay can frame a proposal as
			// acting on multisig A (its claimed address, members, description) while
			// the actual bytes move assets out of multisig B — another multisig the
			// signer also belongs to. The privileged-transfer warnings key off the
			// relay-supplied address, so they would be computed against the wrong
			// "self" and stay silent. Re-deriving here and pinning the sender closes
			// the one path where a relay lie is not otherwise checked client-side.
			const sender = transaction.getData().sender;
			if (!sender)
				throw new Error(
					'Refusing to sign: the transaction has no sender.',
				);

			const normSender = normalizeSuiAddress(sender);
			const derived = normalizeSuiAddress(
				deriveMultisigAddress(members, threshold),
			);

			if (normSender !== derived)
				throw new Error(
					'Refusing to sign: the transaction sender does not match the multisig derived from its members and threshold. The relay may be serving tampered data.',
				);

			if (
				normSender !==
				normalizeSuiAddress(expectedMultisigAddress)
			)
				throw new Error(
					'Refusing to sign: the transaction sender does not match the multisig you are viewing.',
				);

			// G1: the wallet signs a rebuild of these bytes; refuse unless that
			// rebuild is byte-identical to what was simulated and displayed.
			await assertCanonicalTxBytes(
				transactionBytes,
				dappKit.getClient() as ClientWithCoreApi,
			);

			const { signature } = await dappKit.signTransaction({
				transaction,
			});
			return apiClient.voteForProposal(proposalId, {
				signature: signature as string,
				reproduced,
				reviewedDiff,
			});
		},
		onSuccess: (res) => {
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			toast.success(
				res.hasReachedThreshold
					? 'Signed — threshold reached, ready to execute'
					: 'Signature added',
			);
		},
		onError: (e: Error) =>
			toast.error(`Failed to sign: ${e.message}`),
	});
}

/** Combine partial signatures and broadcast on-chain, then verify. */
export function useExecuteProposal() {
	const queryClient = useQueryClient();
	const client = useDAppKit().getClient();

	return useMutation({
		mutationFn: async (proposal: PublicProposal) => {
			if (proposal.status !== ProposalStatus.PENDING)
				throw new Error('Proposal is not pending');

			const members = [...proposal.multisig.members].sort(
				(a, b) => a.order - b.order,
			);
			const msPubKey = multisigPublicKey(
				members,
				proposal.multisig.threshold,
			);

			// Order signatures to match member ordering.
			const ordered: string[] = [];
			for (const member of members) {
				const sig = proposal.signatures.find(
					(s) => s.publicKey === member.publicKey,
				);
				if (sig) ordered.push(sig.signature);
			}

			const combined =
				msPubKey.combinePartialSignatures(ordered);

			const result = await client.executeTransaction({
				transaction: fromBase64(proposal.transactionBytes),
				signatures: [combined],
				include: { effects: true },
			});

			const digest =
				result.Transaction?.digest ||
				result.FailedTransaction?.digest ||
				'';
			await client.waitForTransaction({ digest });
			// We already hold the on-chain effects — report the outcome
			// to the relay so it need not query a fullnode itself.
			const success =
				!!result.Transaction &&
				!!result.Transaction.effects?.status?.success;

			// Publish/upgrade: bind the on-chain package id to the source the
			// proposal carried, so it becomes the next upgrade's baseline + a
			// permanent verification record (L4). The new package object is the
			// changed object written as a package. Bookkeeping only — a failure
			// here must NOT fail the (already-finalized) execution; surface it.
			if (
				success &&
				(proposal.kind === 'publish' ||
					proposal.kind === 'upgrade') &&
				proposal.sourceBlobId
			) {
				const pkg =
					result.Transaction?.effects?.changedObjects?.find(
						(o) => o.outputState === 'PackageWrite',
					);
				if (pkg?.objectId) {
					try {
						await apiClient.recordPackage({
							packageId: pkg.objectId,
							network: proposal.network,
							multisigAddress: proposal.multisigAddress,
							blobId: proposal.sourceBlobId,
							buildDigest: proposal.buildDigest,
							gitRepo: proposal.gitRepo,
							gitCommit: proposal.gitCommit,
							toolchain: proposal.toolchain,
							txDigest: digest,
						});
					} catch (e) {
						toast.error(
							`Executed, but auto-recording the package failed: ${
								(e as Error).message
							}. Use the Archive page to record it.`,
						);
					}
				}
			}

			await new Promise((r) => setTimeout(r, 500));
			await apiClient.verifyProposalByDigest(
				proposal.digest,
				success,
			);
			return { digest };
		},
		onSuccess: ({ digest }) => {
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Balances],
			});
			toast.success(`Executed — ${digest.slice(0, 12)}…`);
		},
		onError: (e: Error) =>
			toast.error(`Execution failed: ${e.message}`),
	});
}

export function useRejectProposal() {
	const dappKit = useDAppKit();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (proposalId: number) => {
			const { signature } =
				await dappKit.signPersonalMessage({
					message: new TextEncoder().encode(
						PersonalMessages.rejectProposal(proposalId),
					),
				});
			return apiClient.rejectProposal(proposalId, {
				signature,
			});
		},
		onSuccess: (res) => {
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			toast.success(
				res.unreachable
					? 'Rejected — threshold now unreachable, proposal can be discarded'
					: 'Reject recorded',
			);
		},
		onError: (e: Error) =>
			toast.error(`Failed to reject: ${e.message}`),
	});
}

export function useCancelProposal() {
	const dappKit = useDAppKit();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (proposalId: number) => {
			const { signature } =
				await dappKit.signPersonalMessage({
					message: new TextEncoder().encode(
						PersonalMessages.cancelProposal(proposalId),
					),
				});
			return apiClient.cancelProposal(proposalId, {
				signature,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposals],
			});
			queryClient.invalidateQueries({
				queryKey: [QueryKeys.Proposal],
			});
			toast.success('Proposal cancelled');
		},
		onError: (e: Error) =>
			toast.error(`Failed to cancel: ${e.message}`),
	});
}
