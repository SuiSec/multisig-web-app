// SPDX-License-Identifier: Apache-2.0

import type { MultisigWithMembers } from '@mysten/sagat';
import {
	Copy,
	Plus,
	ShieldAlert,
	ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { deriveMultisigAddress } from '../lib/multisig';
import { Badge, Button, Identicon } from './ui/kit';

export function multisigAddressVerified(
	multisig: MultisigWithMembers,
): boolean {
	try {
		return (
			deriveMultisigAddress(
				multisig.members,
				multisig.threshold,
			) === multisig.address
		);
	} catch {
		return false;
	}
}

export function MultisigHeader({
	multisig,
	action = true,
}: {
	multisig: MultisigWithMembers;
	action?: boolean;
}) {
	const verified = multisigAddressVerified(multisig);

	return (
		<div className="flex items-start justify-between gap-4">
			<div className="flex min-w-0 items-center gap-4">
				<Identicon
					seed={multisig.address}
					size={48}
					className="rounded-xl"
				/>
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h1 className="font-display text-[22px] font-semibold tracking-tight">
							{multisig.name || 'Untitled multisig'}
						</h1>
						{verified ? (
							<Badge tone="ok" dot>
								<ShieldCheck className="h-3 w-3" />
								verified
							</Badge>
						) : (
							<Badge tone="danger" dot>
								<ShieldAlert className="h-3 w-3" />
								mismatch
							</Badge>
						)}
					</div>
					<button
						onClick={() => {
							navigator.clipboard.writeText(
								multisig.address,
							);
							toast.success('Address copied');
						}}
						className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-faint transition hover:text-foreground"
					>
						{multisig.address}
						<Copy className="h-3 w-3" />
					</button>
					<div className="mt-1 text-sm text-muted-foreground">
						{multisig.threshold}/{multisig.totalWeight}{' '}
						threshold · {multisig.totalMembers} members
					</div>
				</div>
			</div>
			{action && (
				<Link to={`/multisig/${multisig.address}/import`}>
					<Button>
						<Plus className="h-4 w-4" />
						New Transaction
					</Button>
				</Link>
			)}
		</div>
	);
}
