// SPDX-License-Identifier: Apache-2.0

import { PiggyBank, Send } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { AssetBalance } from '../hooks/balances';
import { Card, InitialBadge } from './ui/kit';

function CoinIcon({ asset }: { asset: AssetBalance }) {
	if (asset.iconUrl)
		return (
			<img
				src={asset.iconUrl}
				alt={asset.symbol}
				className="h-[34px] w-[34px] flex-none rounded-full object-cover"
			/>
		);
	return (
		<InitialBadge
			seed={asset.coinType}
			label={asset.symbol}
			size={34}
		/>
	);
}

function CoinMeta({ asset }: { asset: AssetBalance }) {
	return (
		<>
			<CoinIcon asset={asset} />
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-semibold">
					{asset.symbol}
				</div>
				<div className="truncate text-xs text-faint">
					{asset.name}
				</div>
			</div>
			<div className="ml-auto text-right font-mono tabular-nums">
				<div className="text-sm text-foreground">
					{asset.formatted}
				</div>
				<div className="text-xs text-faint">
					{asset.symbol}
				</div>
			</div>
		</>
	);
}

export function AssetsList({
	assets,
	limit,
	address,
}: {
	assets: AssetBalance[];
	limit?: number;
	/** When set, each coin is its own card with a Transfer action outside it. */
	address?: string;
}) {
	const rows = limit ? assets.slice(0, limit) : assets;

	// Transfer-enabled view: one card per coin, action button to its right.
	if (address) {
		return (
			<div className="space-y-2.5">
				{rows.map((a) => (
					<div
						key={a.coinType}
						className="flex items-center gap-3"
					>
						<Card className="flex flex-1 items-center gap-3.5 px-5 py-3.5">
							<CoinMeta asset={a} />
						</Card>
						<Link
							to={`/multisig/${address}/propose?coin=${encodeURIComponent(a.coinType)}`}
							className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[13px] font-semibold text-foreground transition hover:border-primary/60 hover:bg-accent"
						>
							<Send className="h-3.5 w-3.5" />
							Transfer
						</Link>
						<Link
							to={`/multisig/${address}/propose?coin=${encodeURIComponent(a.coinType)}&deposit=1`}
							title="Move into the multisig's account balance so future transfers don't lock coin objects"
							className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[13px] font-semibold text-foreground transition hover:border-primary/60 hover:bg-accent"
						>
							<PiggyBank className="h-3.5 w-3.5" />
							To balance
						</Link>
					</div>
				))}
			</div>
		);
	}

	// Compact list (no actions) — rendered inside a parent Card.
	return (
		<div>
			{rows.map((a, i) => (
				<div
					key={a.coinType}
					className={`flex items-center gap-3.5 px-5 py-3.5 ${
						i < rows.length - 1
							? 'border-b border-border-soft'
							: ''
					}`}
				>
					<CoinMeta asset={a} />
				</div>
			))}
		</div>
	);
}
