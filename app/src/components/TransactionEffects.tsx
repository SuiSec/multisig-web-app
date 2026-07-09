// SPDX-License-Identifier: Apache-2.0
// Intuitive "Transaction effects" view from the simulation result: per-address
// coin balance deltas and object ownership changes (from → to). Ownership moves
// are read from the simulated effects, so they cover plain transfers, `transfer`
// Move calls, AND marketplace purchases that re-owner an object.
//
// Order, per priority: (1) THIS multisig's coin balance changes, (2) non-coin
// object ownership changes (multisig-involved first), (3) other addresses' coin
// balance changes.

import {
	formatAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import {
	ArrowRight,
	ChevronDown,
	Flame,
	Sparkles,
} from 'lucide-react';
import { useMemo } from 'react';

import { useObjectsDisplay } from '../hooks/chainObjects';
import { useCoinMeta } from '../hooks/coinMeta';
import {
	coinSymbolFromType,
	formatUnits,
} from '../lib/coins';
import {
	explorerAddressUrl,
	explorerCoinUrl,
	explorerObjectUrl,
	type Network,
} from '../lib/constants';
import {
	parseTxEffects,
	type CoinDelta,
	type ObjectChange,
	type OwnerRef,
} from '../lib/txEffects';
import { ObjectThumb } from './ObjectThumb';
import { Card } from './ui/kit';

function shortType(type: string): string {
	const base = type.split('<')[0];
	const parts = base.split('::');
	return parts.length >= 2
		? parts.slice(-2).join('::')
		: base;
}

function CoinPill({
	delta,
	meta,
	network,
}: {
	delta: CoinDelta;
	meta: Record<
		string,
		{ decimals: number | null; symbol: string }
	>;
	network: Network;
}) {
	const m = meta[delta.coinType];
	const symbol =
		m?.symbol ?? coinSymbolFromType(delta.coinType);
	const neg = delta.amount < 0n;
	const abs = neg ? -delta.amount : delta.amount;
	const val = formatUnits(abs, m?.decimals ?? null);
	return (
		<a
			href={explorerCoinUrl(delta.coinType, network)}
			target="_blank"
			rel="noreferrer"
			title={delta.coinType}
			className={`rounded-lg px-2.5 py-1.5 font-mono text-sm font-semibold transition hover:opacity-80 ${
				neg
					? 'bg-warning/15 text-warning'
					: 'bg-success/15 text-success'
			}`}
		>
			{neg ? '−' : '+'}
			{val} {symbol}
		</a>
	);
}

// One owner endpoint of an ownership change.
function Party({
	owner,
	multisig,
	network,
}: {
	owner: OwnerRef | null;
	multisig: string;
	network: Network;
}) {
	if (!owner) return <span className="text-faint">—</span>;
	if (owner.kind !== 'address') {
		const label =
			owner.kind === 'shared'
				? 'Shared'
				: owner.kind === 'immutable'
					? 'Immutable'
					: owner.kind === 'object'
						? 'Owned by object'
						: 'Unknown';
		return (
			<span
				className="rounded-md bg-muted px-2 py-1 font-mono text-[11.5px] text-muted-foreground"
				title={owner.address ?? undefined}
			>
				{label}
				{owner.address
					? ` · ${formatAddress(owner.address)}`
					: ''}
			</span>
		);
	}
	const isMine =
		normalizeSuiAddress(owner.address!) === multisig;
	return (
		<a
			href={explorerAddressUrl(owner.address!, network)}
			target="_blank"
			rel="noreferrer"
			className={`rounded-md px-2 py-1 font-mono text-[11.5px] transition hover:opacity-80 ${
				isMine
					? 'bg-primary/15 font-semibold text-primary'
					: 'bg-muted text-muted-foreground'
			}`}
			title={owner.address ?? undefined}
		>
			{isMine
				? 'This multisig'
				: formatAddress(owner.address!)}
		</a>
	);
}

function ObjectChangeRow({
	change: c,
	display,
	multisig,
	network,
}: {
	change: ObjectChange;
	display: Record<
		string,
		{
			typeLabel: string;
			name: string | null;
			imageUrl: string | null;
		}
	>;
	multisig: string;
	network: Network;
}) {
	const disp = display[c.objectId];
	const typeLabel =
		disp?.typeLabel ??
		(c.type ? shortType(c.type) : 'Object');
	const name = disp?.name ?? typeLabel;

	// Left → right endpoints depend on the operation.
	const left =
		c.operation === 'created' ? (
			<span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-1 text-[11.5px] font-medium text-success">
				<Sparkles className="h-3 w-3" /> Created
			</span>
		) : (
			<Party
				owner={c.from}
				multisig={multisig}
				network={network}
			/>
		);
	const right =
		c.operation === 'deleted' ? (
			<span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-2 py-1 text-[11.5px] font-medium text-destructive">
				<Flame className="h-3 w-3" /> Burned
			</span>
		) : (
			<Party
				owner={c.to}
				multisig={multisig}
				network={network}
			/>
		);

	return (
		<div className="rounded-lg border border-border bg-card/50 p-3">
			<div className="flex items-center gap-3">
				<ObjectThumb
					id={c.objectId}
					label={name}
					imageUrl={disp?.imageUrl ?? null}
					size={40}
				/>
				<div className="min-w-0 flex-1">
					<div className="truncate text-[13px] font-semibold">
						{name}
					</div>
					<div className="truncate font-mono text-[11px] text-faint">
						{typeLabel}
					</div>
				</div>
				<a
					href={explorerObjectUrl(c.objectId, network)}
					target="_blank"
					rel="noreferrer"
					className="flex-none font-mono text-[11px] text-primary hover:underline"
				>
					{formatAddress(c.objectId)}
				</a>
			</div>
			<div className="mt-2.5 flex flex-wrap items-center gap-2">
				{left}
				<ArrowRight className="h-3.5 w-3.5 flex-none text-faint" />
				{right}
			</div>
		</div>
	);
}

export function TransactionEffects({
	simData,
	multisig,
	network,
	collapsed = false,
}: {
	simData: unknown;
	multisig: string;
	network: string;
	/**
	 * Render collapsed by default (a `<details>` the member can expand). Used for
	 * publish/upgrade proposals, where the object-flow detail (new Package object,
	 * UpgradeCap → this multisig) is correct but secondary to the source-verify
	 * step — so it's tucked away rather than shown inline as the headline.
	 */
	collapsed?: boolean;
}) {
	const net = network as Network;
	const me = normalizeSuiAddress(multisig);

	const effects = useMemo(
		() => parseTxEffects(simData),
		[simData],
	);

	// Non-coin objects whose ownership actually moved (transfer / buy / mint /
	// burn). Mutations with no owner change, and coins, are excluded here.
	const transfers = useMemo(
		() =>
			(effects?.objectChanges ?? [])
				.filter(
					(c) =>
						!c.isCoin &&
						c.operation !== 'mutated' &&
						(c.from?.kind === 'address' ||
							c.to?.kind === 'address'),
				)
				.sort((a, b) => {
					// Multisig-involved first.
					const aMine =
						a.from?.address &&
						normalizeSuiAddress(a.from.address) === me
							? 1
							: a.to?.address &&
								  normalizeSuiAddress(a.to.address) === me
								? 1
								: 0;
					const bMine =
						b.from?.address &&
						normalizeSuiAddress(b.from.address) === me
							? 1
							: b.to?.address &&
								  normalizeSuiAddress(b.to.address) === me
								? 1
								: 0;
					return bMine - aMine;
				}),
		[effects, me],
	);

	const objIds = useMemo(
		() => transfers.map((c) => c.objectId),
		[transfers],
	);
	const display =
		useObjectsDisplay(network, objIds).data ?? {};

	const coinTypes = useMemo(
		() => [
			...new Set(
				(effects?.coinDeltas ?? []).map((d) => d.coinType),
			),
		],
		[effects],
	);
	const coinMeta = useCoinMeta(coinTypes).data ?? {};

	const mineDeltas = (effects?.coinDeltas ?? []).filter(
		(d) => normalizeSuiAddress(d.address) === me,
	);
	const otherByAddress = useMemo(() => {
		const map = new Map<string, CoinDelta[]>();
		for (const d of effects?.coinDeltas ?? []) {
			if (normalizeSuiAddress(d.address) === me) continue;
			const k = d.address;
			(map.get(k) ?? map.set(k, []).get(k)!).push(d);
		}
		return [...map.entries()];
	}, [effects, me]);

	if (!effects) return null;
	const nothing =
		mineDeltas.length === 0 &&
		transfers.length === 0 &&
		otherByAddress.length === 0;
	if (nothing) return null;

	const sections = (
		<>
			{mineDeltas.length > 0 && (
				<section>
					<div className="mb-2 text-xs text-muted-foreground">
						Coin balance — this multisig
					</div>
					<div className="flex flex-wrap gap-2">
						{mineDeltas.map((d, i) => (
							<CoinPill
								key={i}
								delta={d}
								meta={coinMeta}
								network={net}
							/>
						))}
					</div>
				</section>
			)}

			{transfers.length > 0 && (
				<section>
					<div className="mb-2 text-xs text-muted-foreground">
						Object ownership changes ({transfers.length})
					</div>
					<div className="space-y-2">
						{transfers.map((c) => (
							<ObjectChangeRow
								key={c.objectId}
								change={c}
								display={display}
								multisig={me}
								network={net}
							/>
						))}
					</div>
				</section>
			)}

			{otherByAddress.length > 0 && (
				<section>
					<div className="mb-2 text-xs text-muted-foreground">
						Coin balance — other addresses
					</div>
					<div className="space-y-1.5">
						{otherByAddress.map(([addr, deltas]) => (
							<div
								key={addr}
								className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2"
							>
								<a
									href={explorerAddressUrl(addr, net)}
									target="_blank"
									rel="noreferrer"
									className="font-mono text-[11.5px] text-primary hover:underline"
								>
									{formatAddress(addr)}
								</a>
								<span className="flex flex-wrap justify-end gap-1.5">
									{deltas.map((d, i) => (
										<CoinPill
											key={i}
											delta={d}
											meta={coinMeta}
											network={net}
										/>
									))}
								</span>
							</div>
						))}
					</div>
				</section>
			)}
		</>
	);

	if (collapsed) {
		return (
			<Card className="p-0">
				<details className="group">
					<summary className="flex cursor-pointer select-none items-center gap-1.5 px-5 py-4 text-sm font-medium">
						<ChevronDown className="h-4 w-4 text-faint transition group-open:rotate-180" />
						Transaction effects
					</summary>
					<div className="space-y-5 px-5 pb-5">
						{sections}
					</div>
				</details>
			</Card>
		);
	}

	return (
		<Card className="space-y-5 p-5">
			<div className="text-sm font-medium">
				Transaction effects
			</div>
			{sections}
		</Card>
	);
}
