// SPDX-License-Identifier: Apache-2.0
// Export a multisig's public composition (member public keys, weights,
// threshold) so it can be reconstructed on any other platform. Public data
// only — no private keys are ever held or exported.

import type { MultisigWithMembers } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';
import {
	Check,
	Copy,
	Download,
	Terminal,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
	buildMultisigConfig,
	configToCli,
	configToJSON,
} from '../lib/exportConfig';
import { Avatar, Badge, Button, Card } from './ui/kit';

function CopyButton({
	label,
	value,
	icon,
}: {
	label: string;
	value: string;
	icon?: React.ReactNode;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			variant="ghost"
			className="px-3 py-2 text-xs"
			onClick={() => {
				navigator.clipboard.writeText(value);
				setCopied(true);
				toast.success(`${label} copied`);
				setTimeout(() => setCopied(false), 1500);
			}}
		>
			{copied ? (
				<Check className="h-3.5 w-3.5" />
			) : (
				(icon ?? <Copy className="h-3.5 w-3.5" />)
			)}
			{label}
		</Button>
	);
}

export function MultisigConfigExport({
	multisig,
}: {
	multisig: MultisigWithMembers;
}) {
	const config = useMemo(
		() => buildMultisigConfig(multisig),
		[multisig],
	);
	const json = useMemo(
		() => configToJSON(config),
		[config],
	);
	const cli = useMemo(() => configToCli(config), [config]);

	const download = () => {
		const blob = new Blob([json], {
			type: 'application/json',
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `multisig-${formatAddress(config.address)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<Card className="overflow-hidden">
			<div className="border-b border-border px-5 py-4">
				<h3 className="text-sm font-semibold">
					Export configuration
				</h3>
				<p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
					Member public keys, weights, and the threshold —
					everything needed to reconstruct this multisig on
					another platform. All public; no private keys are
					exported.
				</p>
			</div>

			<div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
				<span>Member</span>
				<span>Scheme</span>
				<span className="text-right">Weight</span>
			</div>
			{config.members.map((m) => (
				<div
					key={m.publicKey}
					className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t border-border-soft px-5 py-3"
				>
					<button
						onClick={() => {
							navigator.clipboard.writeText(m.publicKey);
							toast.success('Public key copied');
						}}
						className="flex min-w-0 items-center gap-3 text-left"
						title="Copy Sui public key"
					>
						<Avatar seed={m.address} size={30} />
						<span className="truncate font-mono text-[13px] text-foreground hover:text-primary">
							{formatAddress(m.address)}
						</span>
						<Copy className="h-3 w-3 flex-none text-faint" />
					</button>
					<Badge tone="muted">{m.scheme}</Badge>
					<span className="text-right font-mono text-sm tabular-nums">
						{m.weight}
					</span>
				</div>
			))}
			<div className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-border px-5 py-3">
				<span className="text-sm text-muted-foreground">
					Threshold
				</span>
				<span className="font-mono text-sm tabular-nums">
					{config.threshold} of{' '}
					{config.members.reduce((s, m) => s + m.weight, 0)}{' '}
					weight
				</span>
			</div>
			<button
				onClick={() => {
					navigator.clipboard.writeText(
						config.multisigPublicKey,
					);
					toast.success('Multisig public key copied');
				}}
				className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 border-t border-border-soft px-5 py-3 text-left"
				title="Copy composite multisig public key"
			>
				<span className="text-sm text-muted-foreground">
					Multisig public key
				</span>
				<span className="truncate text-right font-mono text-xs text-foreground">
					{config.multisigPublicKey}
				</span>
				<Copy className="h-3 w-3 flex-none text-faint" />
			</button>

			<div className="space-y-3 border-t border-border bg-card-alt/40 px-5 py-4">
				<div className="flex items-center justify-between gap-3">
					<span className="text-[12.5px] font-medium text-muted-foreground">
						Reconstruction artifact (JSON)
					</span>
					<div className="flex gap-2">
						<CopyButton label="Copy JSON" value={json} />
						<Button
							variant="ghost"
							className="px-3 py-2 text-xs"
							onClick={download}
						>
							<Download className="h-3.5 w-3.5" />
							Download
						</Button>
					</div>
				</div>
				<pre className="max-h-56 overflow-auto rounded-lg border border-border bg-field px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-foreground">
					{json}
				</pre>

				<div className="flex items-center justify-between gap-3 pt-1">
					<span className="text-[12.5px] font-medium text-muted-foreground">
						Sui CLI
					</span>
					<CopyButton
						label="Copy command"
						value={cli}
						icon={<Terminal className="h-3.5 w-3.5" />}
					/>
				</div>
				<pre className="overflow-auto rounded-lg border border-border bg-field px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-foreground">
					{cli}
				</pre>
			</div>
		</Card>
	);
}
