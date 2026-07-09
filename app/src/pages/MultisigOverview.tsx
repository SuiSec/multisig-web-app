// SPDX-License-Identifier: Apache-2.0

import { ProposalStatus } from '@mysten/sagat';
import { ArrowUpRight, FileText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { AssetsList } from '../components/AssetsList';
import { MultisigHeader } from '../components/MultisigHeader';
import { ProposalTable } from '../components/ProposalTable';
import {
	Card,
	EmptyState,
	ErrorState,
	Spinner,
} from '../components/ui/kit';
import { useBalances } from '../hooks/balances';
import { useGetMultisig } from '../hooks/multisigs';
import { useProposals } from '../hooks/proposals';

export function MultisigOverview() {
	const { address } = useParams<{ address: string }>();
	const {
		data: multisig,
		isLoading,
		isError,
		error,
	} = useGetMultisig(address);
	const { data: assets, isLoading: loadingAssets } =
		useBalances(address);
	const { data: pending } = useProposals(
		address,
		ProposalStatus.PENDING,
	);

	if (isError)
		return (
			<ErrorState
				title="Couldn't load this multisig"
				message={(error as Error).message}
			/>
		);
	if (isLoading || !multisig)
		return <Spinner label="Loading multisig…" />;

	const sui = assets?.find((a) => a.isSui);
	const otherCount = (assets?.length ?? 0) - (sui ? 1 : 0);
	const pendingCount = pending?.data.length ?? 0;
	const policySegments = Math.min(multisig.totalWeight, 12);

	return (
		<div className="space-y-6">
			<MultisigHeader multisig={multisig} />

			{/* Hero cards */}
			<div className="grid gap-5 md:grid-cols-3">
				{/* Treasury (native SUI) */}
				<Card className="relative overflow-hidden bg-gradient-to-br from-primary/[0.06] to-card p-6">
					<div className="text-[13px] text-muted-foreground">
						SUI Balance
					</div>
					<div className="mt-2.5 flex items-end gap-2">
						<span className="font-display text-[34px] font-semibold leading-none tracking-tight">
							{loadingAssets
								? '—'
								: (sui?.formatted ?? '0')}
						</span>
						<span className="mb-1 text-sm text-muted-foreground">
							SUI
						</span>
					</div>
					<div className="mt-2 text-xs text-faint">
						{loadingAssets
							? 'Reading balances…'
							: otherCount > 0
								? `+ ${otherCount} other asset${otherCount > 1 ? 's' : ''}`
								: 'Native treasury balance'}
					</div>
				</Card>

				{/* Signing policy */}
				<Card className="flex flex-col justify-between p-6">
					<div className="text-[13px] text-muted-foreground">
						Signing Policy
					</div>
					<div className="mt-3 flex items-center gap-4">
						<span className="font-display text-[32px] font-semibold leading-none">
							{multisig.threshold} / {multisig.totalWeight}
						</span>
						<div className="flex-1">
							<div className="flex gap-1">
								{Array.from({ length: policySegments }).map(
									(_, i) => (
										<span
											key={i}
											className={`h-1.5 flex-1 rounded-full ${
												i < multisig.threshold
													? 'bg-primary'
													: 'bg-border'
											}`}
										/>
									),
								)}
							</div>
							<div className="mt-2 text-xs text-faint">
								Requires {multisig.threshold} of{' '}
								{multisig.totalWeight} weight
							</div>
						</div>
					</div>
				</Card>

				{/* Pending */}
				<Card className="flex flex-col justify-between p-6">
					<div className="text-[13px] text-muted-foreground">
						Pending
					</div>
					<Link
						to={`/multisig/${address}/pending`}
						className="mt-3 flex items-baseline gap-2"
					>
						<span className="font-display text-[32px] font-semibold leading-none text-warning">
							{pendingCount}
						</span>
						<span className="text-[13px] text-muted-foreground">
							txns to sign
						</span>
					</Link>
				</Card>
			</div>

			{/* Assets + queue */}
			<div className="grid gap-5 lg:grid-cols-2">
				<Card className="overflow-hidden">
					<div className="flex items-center justify-between border-b border-border px-5 py-4">
						<span className="text-[15px] font-semibold">
							Assets
						</span>
						<Link
							to={`/multisig/${address}/assets`}
							className="text-[13px] text-primary hover:underline"
						>
							View all
						</Link>
					</div>
					{loadingAssets && <Spinner />}
					{!loadingAssets &&
						(assets?.length ?? 0) === 0 && (
							<div className="px-5 py-8 text-center text-sm text-muted-foreground">
								No coins held by this multisig yet.
							</div>
						)}
					{(assets?.length ?? 0) > 0 && (
						<AssetsList assets={assets!} limit={5} />
					)}
				</Card>

				<div className="space-y-3">
					<div className="flex items-center justify-between px-1">
						<span className="text-[15px] font-semibold">
							Signing queue
						</span>
						<Link
							to={`/multisig/${address}/pending`}
							className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
						>
							Open queue
							<ArrowUpRight className="h-3.5 w-3.5" />
						</Link>
					</div>
					{pendingCount === 0 ? (
						<EmptyState
							icon={<FileText className="h-8 w-8" />}
							title="No pending proposals"
							body="Create a transaction or capture one from a dApp."
						/>
					) : (
						<ProposalTable
							proposals={pending!.data.slice(0, 4)}
							multisig={multisig}
							variant="pending"
						/>
					)}
				</div>
			</div>
		</div>
	);
}
