// SPDX-License-Identifier: Apache-2.0

import { Check, Copy, Info, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MultisigConfigExport } from '../components/MultisigConfigExport';
import {
	multisigAddressVerified,
	MultisigHeader,
} from '../components/MultisigHeader';
import {
	Badge,
	Button,
	Card,
	ErrorState,
	Input,
	Spinner,
} from '../components/ui/kit';
import {
	useGetMultisig,
	useRenameMultisig,
} from '../hooks/multisigs';

function Row({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4 border-t border-border-soft px-5 py-3.5 first:border-t-0">
			<span className="text-sm text-muted-foreground">
				{label}
			</span>
			<span className="min-w-0 text-right">{children}</span>
		</div>
	);
}

function EditableName({
	address,
	name,
}: {
	address: string;
	name: string | null;
}) {
	const rename = useRenameMultisig(address);
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(name ?? '');

	if (!editing) {
		return (
			<div className="flex items-center justify-end gap-2">
				<span className="text-sm font-medium">
					{name || 'Untitled multisig'}
				</span>
				<button
					onClick={() => {
						setValue(name ?? '');
						setEditing(true);
					}}
					aria-label="Rename multisig"
					className="text-faint transition hover:text-foreground"
				>
					<Pencil className="h-3.5 w-3.5" />
				</button>
			</div>
		);
	}

	const submit = () => {
		const trimmed = value.trim();
		if (trimmed.length < 1) {
			toast.error('Name cannot be empty');
			return;
		}
		rename.mutate(trimmed, {
			onSuccess: () => setEditing(false),
		});
	};

	return (
		<div className="flex items-center justify-end gap-2">
			<Input
				autoFocus
				value={value}
				maxLength={100}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') submit();
					if (e.key === 'Escape') setEditing(false);
				}}
				className="h-9 w-56 py-1.5"
			/>
			<Button
				className="px-3 py-2"
				loading={rename.isPending}
				onClick={submit}
				aria-label="Save name"
			>
				<Check className="h-4 w-4" />
			</Button>
			<Button
				variant="ghost"
				className="px-3 py-2"
				onClick={() => setEditing(false)}
				aria-label="Cancel"
			>
				<X className="h-4 w-4" />
			</Button>
		</div>
	);
}

export function MultisigSettings() {
	const { address } = useParams<{ address: string }>();
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

	const verified = multisigAddressVerified(multisig);

	return (
		<div className="space-y-6">
			<MultisigHeader multisig={multisig} action={false} />

			<div>
				<h2 className="mb-3 text-sm font-semibold">
					Settings
				</h2>
				<Card className="overflow-hidden">
					<Row label="Name">
						<EditableName
							address={multisig.address}
							name={multisig.name}
						/>
					</Row>
					<Row label="Address">
						<button
							onClick={() => {
								navigator.clipboard.writeText(
									multisig.address,
								);
								toast.success('Address copied');
							}}
							className="inline-flex items-center gap-1.5 font-mono text-xs text-foreground hover:text-primary"
						>
							{multisig.address}
							<Copy className="h-3 w-3" />
						</button>
					</Row>
					<Row label="Threshold">
						<span className="font-mono text-sm tabular-nums">
							{multisig.threshold} of {multisig.totalWeight}{' '}
							weight
						</span>
					</Row>
					<Row label="Members">
						<span className="font-mono text-sm tabular-nums">
							{multisig.totalMembers}
						</span>
					</Row>
					<Row label="Address derivation">
						{verified ? (
							<Badge tone="ok" dot>
								verified locally
							</Badge>
						) : (
							<Badge tone="danger" dot>
								mismatch
							</Badge>
						)}
					</Row>
				</Card>
			</div>

			<MultisigConfigExport multisig={multisig} />

			<Card className="flex gap-3 p-5">
				<Info className="h-4 w-4 flex-none text-primary" />
				<p className="text-[13px] leading-relaxed text-muted-foreground">
					Sui native multisig is{' '}
					<span className="font-medium text-foreground">
						immutable on-chain
					</span>
					: the member set, weights, and threshold are fixed
					at creation and encoded in the address itself. To
					change the policy, create a new multisig and move
					assets to it — there is no on-chain &ldquo;edit
					threshold&rdquo;. This client always re-derives
					the address from member public keys, so a tampered
					server record shows as a mismatch above.
				</p>
			</Card>
		</div>
	);
}
