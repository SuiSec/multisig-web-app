// SPDX-License-Identifier: Apache-2.0

import {
	ProposalStatus,
	type MultisigWithMembers,
	type ProposalWithSignatures,
} from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { signedWeight } from '../lib/multisig';
import { Badge, SignerProgress } from './ui/kit';

function StatusBadge({
	status,
}: {
	status: ProposalStatus;
}) {
	switch (status) {
		case ProposalStatus.SUCCESS:
			return (
				<Badge tone="ok" dot>
					executed
				</Badge>
			);
		case ProposalStatus.FAILURE:
			return (
				<Badge tone="danger" dot>
					failed
				</Badge>
			);
		case ProposalStatus.CANCELLED:
			return (
				<Badge tone="muted" dot>
					cancelled
				</Badge>
			);
		default:
			return (
				<Badge tone="warn" dot>
					pending
				</Badge>
			);
	}
}

export function ProposalTable({
	proposals,
	multisig,
	variant,
}: {
	proposals: ProposalWithSignatures[];
	multisig: MultisigWithMembers;
	variant: 'pending' | 'history';
}) {
	const address = multisig.address;
	const seeds = multisig.members.map((m) => m.publicKey);

	return (
		<div className="shadow-card overflow-hidden rounded-xl border border-border bg-card">
			<div className="grid grid-cols-[1fr_auto_auto_2rem] items-center gap-4 border-b border-border px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
				<span>Proposal</span>
				<span className="text-right">
					{variant === 'pending' ? 'Signed' : 'Result'}
				</span>
				<span className="text-right">Status</span>
				<span />
			</div>
			{proposals.map((p) => {
				const signedPks = p.signatures.map(
					(s) => s.publicKey,
				);
				const weight = signedWeight(
					multisig.members,
					signedPks,
				);
				const ready = weight >= multisig.threshold;
				const signedCount = multisig.members.filter((m) =>
					signedPks.includes(m.publicKey),
				).length;
				return (
					<Link
						key={p.id}
						to={`/multisig/${address}/proposal/${p.digest}`}
						className="grid grid-cols-[1fr_auto_auto_2rem] items-center gap-4 border-b border-border-soft px-5 py-4 transition last:border-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
					>
						<div className="min-w-0">
							<div className="truncate font-semibold">
								{p.description || 'Transaction proposal'}
							</div>
							<div className="font-mono text-xs text-faint">
								{formatAddress(p.digest)}
							</div>
						</div>
						<div className="justify-self-end">
							{variant === 'pending' ? (
								<SignerProgress
									signed={signedCount}
									total={multisig.totalMembers}
									ready={ready}
									seeds={seeds}
								/>
							) : (
								<span className="font-mono text-sm text-muted-foreground tabular-nums">
									{signedCount}/{multisig.totalMembers}
								</span>
							)}
						</div>
						<span className="text-right">
							{variant === 'pending' ? (
								ready ? (
									<Badge tone="ok" dot>
										ready
									</Badge>
								) : (
									<Badge tone="warn" dot>
										collecting
									</Badge>
								)
							) : (
								<StatusBadge status={p.status} />
							)}
						</span>
						<ChevronRight className="h-4 w-4 text-faint" />
					</Link>
				);
			})}
		</div>
	);
}
