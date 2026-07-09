// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { FileText } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { MultisigHeader } from '../components/MultisigHeader';
import { ProposalTable } from '../components/ProposalTable';
import {
	EmptyState,
	ErrorState,
	Spinner,
} from '../components/ui/kit';
import { useGetMultisig } from '../hooks/multisigs';
import { useProposals } from '../hooks/proposals';

export function MultisigPending() {
	const { address } = useParams<{ address: string }>();
	const {
		data: multisig,
		isLoading,
		isError,
		error,
	} = useGetMultisig(address);
	const { data: proposals, isLoading: loadingProposals } =
		useProposals(address, ProposalStatus.PENDING);

	if (isError)
		return (
			<ErrorState
				title="Couldn't load this multisig"
				message={(error as Error).message}
			/>
		);
	if (isLoading || !multisig)
		return <Spinner label="Loading multisig…" />;

	const list = proposals?.data ?? [];

	return (
		<div className="space-y-6">
			<MultisigHeader multisig={multisig} />

			<div>
				<h2 className="mb-3 text-sm font-semibold">
					Signing queue
				</h2>
				{loadingProposals && <Spinner />}
				{!loadingProposals && list.length === 0 && (
					<EmptyState
						icon={<FileText className="h-8 w-8" />}
						title="No pending proposals"
						body="Create a transaction or capture one from a dApp to get started."
					/>
				)}
				{list.length > 0 && (
					<ProposalTable
						proposals={list}
						multisig={multisig}
						variant="pending"
					/>
				)}
			</div>
		</div>
	);
}
