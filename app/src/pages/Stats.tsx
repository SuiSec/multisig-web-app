// SPDX-License-Identifier: Apache-2.0
// Public lifetime stats: multisig wallets created, multisig transactions
// executed on-chain, and packages published / upgraded via multisig.

import {
	ArrowUpCircle,
	BarChart3,
	Boxes,
	Send,
	UploadCloud,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
	Card,
	ErrorState,
	Spinner,
} from '../components/ui/kit';
import { useStats } from '../hooks/stats';

function StatCard({
	icon,
	label,
	value,
	hint,
}: {
	icon: ReactNode;
	label: string;
	value: number;
	hint?: string;
}) {
	return (
		<Card className="flex items-center gap-4 p-5">
			<div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
				{icon}
			</div>
			<div className="min-w-0">
				<div className="font-display text-[28px] font-semibold leading-none tracking-tight tabular-nums">
					{value.toLocaleString()}
				</div>
				<div className="mt-1 text-sm font-medium text-foreground">
					{label}
				</div>
				{hint && (
					<div className="text-[11px] text-faint">
						{hint}
					</div>
				)}
			</div>
		</Card>
	);
}

export function Stats() {
	const { data, isLoading, isError, error } = useStats();

	if (isLoading) return <Spinner label="Loading stats…" />;
	if (isError)
		return (
			<ErrorState
				title="Couldn't load stats"
				message={(error as Error).message}
			/>
		);

	const s = data!;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2.5">
				<BarChart3 className="h-5 w-5 text-primary" />
				<div>
					<h1 className="font-display text-[22px] font-semibold tracking-tight">
						Network stats
					</h1>
					<p className="text-sm text-muted-foreground">
						Lifetime totals across all multisigs on this
						relay.
					</p>
				</div>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<StatCard
					icon={<Boxes className="h-6 w-6" />}
					label="Multisig wallets created"
					value={s.multisigs}
				/>
				<StatCard
					icon={<Send className="h-6 w-6" />}
					label="Multisig transactions executed"
					value={s.proposalsExecuted}
				/>
				<StatCard
					icon={<UploadCloud className="h-6 w-6" />}
					label="Packages published"
					value={s.publishes}
				/>
				<StatCard
					icon={<ArrowUpCircle className="h-6 w-6" />}
					label="Packages upgraded"
					value={s.upgrades}
				/>
			</div>

			<p className="text-[11px] text-faint">
				Wallet count is exact. Transaction / publish /
				upgrade counters are lifetime totals recorded as
				proposals execute (executed proposals are removed
				from the relay, so the chain remains the
				authoritative record).
			</p>
		</div>
	);
}
