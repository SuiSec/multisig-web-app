// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { MultisigConfigExport } from '../components/MultisigConfigExport';
import { MultisigHeader } from '../components/MultisigHeader';
import { MultisigSafetyScore } from '../components/MultisigSafetyScore';
import {
	Avatar,
	Badge,
	Button,
	Card,
	ErrorState,
	Spinner,
} from '../components/ui/kit';
import { useGetMultisig } from '../hooks/multisigs';
import { memberAddress } from '../lib/multisig';

function safeMemberAddress(publicKey: string): string {
	try {
		return memberAddress(publicKey);
	} catch {
		return publicKey;
	}
}

export function MultisigMembers() {
	const { address } = useParams<{ address: string }>();
	const [showExport, setShowExport] = useState(false);
	const {
		data: multisig,
		isLoading,
		isError,
		error,
	} = useGetMultisig(address);

	if (isError)
		return (
			<ErrorState
				title="Couldn't load this multisig"
				message={(error as Error).message}
			/>
		);
	if (isLoading || !multisig)
		return <Spinner label="Loading multisig…" />;

	const members = [...multisig.members].sort(
		(a, b) => a.order - b.order,
	);

	return (
		<div className="space-y-6">
			<MultisigHeader multisig={multisig} action={false} />

			<div>
				<h2 className="mb-3 text-sm font-semibold">
					Members &amp; policy
				</h2>
				<Card className="overflow-hidden">
					<div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-primary/[0.06] to-transparent px-5 py-4">
						<div>
							<div className="text-xs text-muted-foreground">
								Signing policy
							</div>
							<div className="font-display text-2xl font-semibold">
								{multisig.threshold} /{' '}
								{multisig.totalWeight}
							</div>
						</div>
						<div className="text-[13px] text-muted-foreground">
							{multisig.totalMembers} members ·{' '}
							{multisig.threshold} weight to execute
						</div>
						<Button
							variant="ghost"
							className="ml-auto px-3 py-2 text-xs"
							onClick={() => setShowExport((v) => !v)}
						>
							<Download className="h-3.5 w-3.5" />
							{showExport ? 'Hide export' : 'Export'}
						</Button>
					</div>
					<div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
						<span>Member</span>
						<span className="text-right">Weight</span>
					</div>
					{members.map((m) => {
						const addr = safeMemberAddress(m.publicKey);
						return (
							<div
								key={m.publicKey}
								className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-border-soft px-5 py-3.5"
							>
								<div className="flex min-w-0 items-center gap-3">
									<Avatar seed={addr} size={34} />
									<div className="min-w-0">
										<div className="font-mono text-[13px] text-foreground">
											{formatAddress(addr)}
										</div>
										<div className="mt-0.5">
											{m.isAccepted ? (
												<Badge tone="ok" dot>
													accepted
												</Badge>
											) : m.isRejected ? (
												<Badge tone="danger" dot>
													rejected
												</Badge>
											) : (
												<Badge tone="warn" dot>
													pending
												</Badge>
											)}
										</div>
									</div>
								</div>
								<span className="text-right font-mono text-sm tabular-nums">
									{m.weight}
								</span>
							</div>
						);
					})}
				</Card>
			</div>

			<MultisigSafetyScore
				weights={members.map((m) => m.weight)}
				threshold={multisig.threshold}
			/>

			{showExport && (
				<MultisigConfigExport multisig={multisig} />
			)}
		</div>
	);
}
