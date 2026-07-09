// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { formatAddress } from '@mysten/sui/utils';
import {
	ChevronRight,
	Plus,
	Users,
	Vault,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { multisigAddressVerified } from '../components/MultisigHeader';
import {
	Avatar,
	Badge,
	Button,
	EmptyState,
	Spinner,
} from '../components/ui/kit';
import { useApiAuth } from '../contexts/ApiAuthContext';
import { useUserMultisigs } from '../hooks/multisigs';
import { Dashboard } from './Dashboard';

export function Home() {
	const account = useCurrentAccount();
	const { isCurrentAddressAuthenticated } = useApiAuth();

	if (!account || !isCurrentAddressAuthenticated)
		return <Dashboard />;

	return <MultisigList />;
}

function MultisigList() {
	const { data: multisigs, isLoading } = useUserMultisigs();

	return (
		<div className="space-y-5">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-display text-[22px] font-semibold tracking-tight">
						Multisigs
					</h1>
					<p className="text-sm text-muted-foreground">
						Shared vaults you are a member of.
					</p>
				</div>
				<Link to="/create">
					<Button>
						<Plus className="h-4 w-4" />
						New Multisig
					</Button>
				</Link>
			</div>

			{isLoading && (
				<Spinner label="Loading your multisigs…" />
			)}

			{!isLoading && (multisigs?.length ?? 0) === 0 && (
				<EmptyState
					icon={<Vault className="h-8 w-8" />}
					title="No multisigs yet"
					body="Create your first shared vault, or accept a pending invitation."
					action={
						<Link to="/create">
							<Button>
								<Plus className="h-4 w-4" />
								Create Multisig
							</Button>
						</Link>
					}
				/>
			)}

			{(multisigs?.length ?? 0) > 0 && (
				<div className="shadow-card overflow-hidden rounded-xl border border-border bg-card">
					<div className="grid grid-cols-[1fr_auto_auto_2rem] items-center gap-4 border-b border-border px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
						<span>Name</span>
						<span className="text-right">Members</span>
						<span className="text-right">Threshold</span>
						<span />
					</div>
					{multisigs?.map((m) => (
						<Link
							key={m.address}
							to={`/multisig/${m.address}`}
							className="grid grid-cols-[1fr_auto_auto_2rem] items-center gap-4 border-b border-border-soft px-5 py-4 transition last:border-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
						>
							<div className="flex min-w-0 items-center gap-3">
								<Avatar
									seed={m.address}
									label={m.name || m.address}
									size={34}
								/>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<span className="truncate font-semibold">
											{m.name || 'Untitled multisig'}
										</span>
										{/* "verified" must pass client re-derivation, not just the
										    relay's word: a lying relay can set isVerified on a row
										    whose member set it tampered with. multisigAddressVerified
										    re-derives the address from members+threshold (always true
										    for honest rows, so no UX change). */}
										{m.isVerified &&
											multisigAddressVerified(m) && (
												<Badge tone="ok" dot>
													verified
												</Badge>
											)}
									</div>
									<span className="font-mono text-xs text-faint">
										{formatAddress(m.address)}
									</span>
								</div>
							</div>
							<span className="flex items-center justify-end gap-1.5 font-mono text-sm text-muted-foreground tabular-nums">
								<Users className="h-3.5 w-3.5 text-faint" />
								{m.totalMembers}
							</span>
							<span className="text-right font-mono text-sm text-muted-foreground tabular-nums">
								{m.threshold}/{m.totalWeight}
							</span>
							<ChevronRight className="h-4 w-4 text-faint" />
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
