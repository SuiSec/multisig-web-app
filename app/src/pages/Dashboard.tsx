// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { useQuery } from '@tanstack/react-query';
import {
	Activity,
	EyeOff,
	KeyRound,
	Layers,
	Network,
	ShieldCheck,
} from 'lucide-react';

import { useApiAuth } from '../contexts/ApiAuthContext';

const API_BASE_URL =
	import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Health {
	status: string;
	networks: string[];
	version: string;
}

function useRelayHealth() {
	return useQuery<Health>({
		queryKey: ['relay', 'health'],
		queryFn: async () => {
			const res = await fetch(`${API_BASE_URL}/health`);
			if (!res.ok) throw new Error('relay unreachable');
			return res.json();
		},
		refetchInterval: 15000,
	});
}

export function Dashboard() {
	const account = useCurrentAccount();
	const { isCurrentAddressAuthenticated } = useApiAuth();
	const { data: health, isError } = useRelayHealth();

	return (
		<div className="space-y-8">
			<section>
				<h1 className="font-display text-[28px] font-semibold tracking-tight">
					Coordinate Sui multisig transactions
				</h1>
				<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
					A non-custodial console: the relay only
					coordinates proposals and collects signatures — it
					never holds keys and can never sign. Every member
					verifies the exact bytes locally before signing.
				</p>
			</section>

			<section className="grid gap-4 sm:grid-cols-3">
				<StatusCard
					icon={<Activity className="h-4 w-4" />}
					label="Relay"
					value={
						isError
							? 'unreachable'
							: health
								? health.status
								: 'checking…'
					}
					tone={
						isError ? 'danger' : health ? 'ok' : 'muted'
					}
				/>
				<StatusCard
					icon={<Network className="h-4 w-4" />}
					label="Networks"
					value={health?.networks?.join(', ') ?? '—'}
					tone="muted"
				/>
				<StatusCard
					icon={<ShieldCheck className="h-4 w-4" />}
					label="Session"
					value={
						!account
							? 'no wallet'
							: isCurrentAddressAuthenticated
								? 'verified'
								: 'unverified'
					}
					tone={
						!account
							? 'muted'
							: isCurrentAddressAuthenticated
								? 'ok'
								: 'warn'
					}
				/>
			</section>

			<section className="rounded-xl border border-border bg-card p-5">
				<h2 className="mb-4 text-sm font-medium">
					Get started
				</h2>
				<ol className="grid gap-3 sm:grid-cols-3">
					<Step
						n={1}
						title="Connect & verify"
						body="Connect your member wallet and sign a message to prove address ownership."
						done={isCurrentAddressAuthenticated}
					/>
					<Step
						n={2}
						title="Create or select a multisig"
						body="Compose members, weights and threshold — the address is derived locally."
					/>
					<Step
						n={3}
						title="Propose & sign"
						body="Build a transaction (or capture one from any dApp) and collect signatures."
					/>
				</ol>
			</section>

			<section className="grid gap-4 sm:grid-cols-3">
				<Principle
					icon={<KeyRound className="h-4 w-4" />}
					title="Non-custodial"
					body="Keys live in your own wallet. The server cannot move funds or forge signatures."
				/>
				<Principle
					icon={<EyeOff className="h-4 w-4" />}
					title="Security analysis before every signature"
					body="Each signer independently decodes the transaction structure and runs a local simulation to inspect exact state changes — which objects mutate, which coins move — before committing a key. The relay's description is advisory; only the dry-run result is trusted."
				/>
				<Principle
					icon={<Layers className="h-4 w-4" />}
					title="Works with any dApp"
					body="A thin-injection extension presents the multisig as a read-only wallet and parks captured transactions as proposals."
				/>
			</section>
		</div>
	);
}

function StatusCard({
	icon,
	label,
	value,
	tone,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	tone: 'ok' | 'warn' | 'danger' | 'muted';
}) {
	const dot = {
		ok: 'bg-primary',
		warn: 'bg-warning',
		danger: 'bg-destructive',
		muted: 'bg-muted-foreground',
	}[tone];
	return (
		<div className="rounded-xl border border-border bg-card p-4">
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				{icon}
				{label}
			</div>
			<div className="mt-2 flex items-center gap-2">
				<span className={`h-2 w-2 rounded-full ${dot}`} />
				<span className="font-mono text-sm">{value}</span>
			</div>
		</div>
	);
}

function Step({
	n,
	title,
	body,
	done,
}: {
	n: number;
	title: string;
	body: string;
	done?: boolean;
}) {
	return (
		<li className="rounded-lg border border-border bg-background p-4">
			<div className="mb-1.5 flex items-center gap-2">
				<span
					className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
						done
							? 'bg-primary text-primary-foreground'
							: 'bg-secondary text-secondary-foreground'
					}`}
				>
					{n}
				</span>
				<span className="text-sm font-medium">{title}</span>
			</div>
			<p className="text-xs text-muted-foreground">
				{body}
			</p>
		</li>
	);
}

function Principle({
	icon,
	title,
	body,
}: {
	icon: React.ReactNode;
	title: string;
	body: string;
}) {
	return (
		<div className="rounded-xl border border-border bg-card p-4">
			<div className="mb-2 flex items-center gap-2 text-primary">
				{icon}
				<span className="text-sm font-medium text-foreground">
					{title}
				</span>
			</div>
			<p className="text-xs text-muted-foreground">
				{body}
			</p>
		</div>
	);
}
