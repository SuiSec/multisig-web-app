// SPDX-License-Identifier: Apache-2.0
// Full decoded transaction — every PTB command (with Move Registry names where
// known), per-object access levels, OTHER parties' net balance flows, and the
// raw dry-run. The multisig's OWN asset changes are shown separately, up top,
// as the headline security signal (see Capture.tsx).
//
// Each command row is expandable: the collapsed line is the at-a-glance summary
// (kind, MVR-resolved function, flagged params); expanding reveals the called
// function's package/module/function and EVERY argument's decoded value — object
// type+id+version+digest, pure value decoded by its Move type, withdrawals, and
// references to earlier command results.

import type {
	AnalyzedCommand,
	AnalyzedCommandArgument,
} from '@mysten/wallet-sdk';
import {
	ArrowRight,
	Check,
	ChevronDown,
	Copy,
	ExternalLink,
} from 'lucide-react';
import { useState } from 'react';

import {
	explorerAddressUrl,
	explorerCoinUrl,
	explorerObjectUrl,
	explorerPackageUrl,
	type Network,
} from '../lib/constants';
import {
	assessCall,
	coinTypeArgIndices,
	formatParam,
	type OpenSignature,
} from '../lib/paramRisk';
import {
	decodePure,
	paramBody,
	pureTypeName,
} from '../lib/pureValue';
import { Badge, Card } from './ui/kit';

type AccessLevel = 'read' | 'mutate' | 'transfer';

function shortId(id: string): string {
	return id.length > 14
		? `${id.slice(0, 6)}…${id.slice(-4)}`
		: id;
}

function shortType(type: string): string {
	// "0x2::coin::Coin<0x2::sui::SUI>" → "coin::Coin<sui::SUI>"
	return type.replace(
		/0x[0-9a-fA-F]+::([a-zA-Z0-9_]+)::([a-zA-Z0-9_]+)/g,
		'$1::$2',
	);
}

function bigintSafe(_k: string, v: unknown) {
	return typeof v === 'bigint' ? `${v}n` : v;
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={() => {
				void navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
			title="Copy"
			className="inline-flex flex-none items-center rounded p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
		>
			{copied ? (
				<Check className="h-3 w-3 text-success" />
			) : (
				<Copy className="h-3 w-3" />
			)}
		</button>
	);
}

// A full id/address shown as an explorer link + a copy button. The id stays
// fully visible (mono, wraps) so it can be read and verified before signing.
function IdLink({
	id,
	href,
}: {
	id: string;
	href: string;
}) {
	return (
		<span className="inline-flex min-w-0 items-baseline gap-1">
			<a
				href={href}
				target="_blank"
				rel="noreferrer"
				className="break-all text-primary hover:underline"
			>
				{id}
			</a>
			<ExternalLink className="h-3 w-3 flex-none translate-y-0.5 text-faint" />
			<CopyButton text={id} />
		</span>
	);
}

// A full type argument (e.g. `0x2::sui::SUI`). Always shown in full and
// copyable. Only a genuine COIN type (the `T` of a Coin/Balance/Token param —
// see `coinTypeArgIndices`) links to the explorer's coin page; other generics
// are plain text, since /coin/ wouldn't resolve for them.
function TypeArg({
	type,
	isCoin,
	network,
}: {
	type: string;
	isCoin: boolean;
	network: Network;
}) {
	return (
		<span className="inline-flex min-w-0 items-baseline gap-1">
			{isCoin ? (
				<>
					<a
						href={explorerCoinUrl(type, network)}
						target="_blank"
						rel="noreferrer"
						className="break-all text-primary hover:underline"
					>
						{type}
					</a>
					<ExternalLink className="h-3 w-3 flex-none translate-y-0.5 text-faint" />
				</>
			) : (
				<span className="break-all text-muted-foreground">
					{type}
				</span>
			)}
			<CopyButton text={type} />
		</span>
	);
}

// A label : value row inside the expanded detail.
function KV({
	k,
	children,
}: {
	k: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex gap-2 py-0.5">
			<span className="w-[88px] flex-none text-[11px] text-faint">
				{k}
			</span>
			<span className="min-w-0 break-all font-mono text-[11.5px] text-muted-foreground">
				{children}
			</span>
		</div>
	);
}

function AccessBadge({ level }: { level?: AccessLevel }) {
	if (!level) return null;
	const tone =
		level === 'transfer'
			? 'warn'
			: level === 'mutate'
				? 'info'
				: 'muted';
	return (
		<Badge tone={tone as 'warn' | 'info' | 'muted'}>
			{level}
		</Badge>
	);
}

// One PTB argument, fully decoded. `typeName` (when known) decodes Pure bytes.
function ArgValue({
	arg,
	typeName,
	network,
}: {
	arg: AnalyzedCommandArgument;
	typeName: string | null;
	network: Network;
}) {
	switch (arg.$kind) {
		case 'Object': {
			const o = arg.object as unknown as {
				id: string;
				type: string;
				version: string;
				digest: string;
			};
			return (
				<div className="space-y-0">
					<KV k="kind">
						object <AccessBadge level={arg.accessLevel} />
					</KV>
					<KV k="objectType">
						<span title={o.type}>{shortType(o.type)}</span>
					</KV>
					<KV k="objectId">
						<IdLink
							id={o.id}
							href={explorerObjectUrl(o.id, network)}
						/>
					</KV>
					<KV k="version">{o.version}</KV>
					<KV k="digest">{o.digest}</KV>
				</div>
			);
		}
		case 'Pure': {
			const value = decodePure(arg.bytes, typeName);
			// An address argument is a destination/account — link + copy it.
			const isAddress = typeName === 'address';
			return (
				<div className="space-y-0">
					<KV k="kind">pure</KV>
					<KV k="valueType">{typeName ?? 'unknown'}</KV>
					<KV k="value">
						{isAddress ? (
							<IdLink
								id={value}
								href={explorerAddressUrl(value, network)}
							/>
						) : (
							value
						)}
					</KV>
				</div>
			);
		}
		case 'Withdrawal':
			return (
				<div className="space-y-0">
					<KV k="kind">account-balance withdrawal</KV>
					<KV k="coinType">
						<IdLink
							id={arg.coinType}
							href={explorerCoinUrl(arg.coinType, network)}
						/>
					</KV>
					<KV k="amount">≤ {String(arg.amount)}</KV>
					<KV k="from">{arg.withdrawFrom}</KV>
				</div>
			);
		case 'Result':
			return (
				<KV k="kind">
					result of command #{arg.index[0]}
					{arg.index[1] > 0
						? ` (output ${arg.index[1]})`
						: ''}
				</KV>
			);
		case 'GasCoin':
			return <KV k="kind">gas coin</KV>;
		default:
			return <KV k="kind">{arg.$kind}</KV>;
	}
}

// A labeled argument block: the role/param-type heading + the decoded value.
function LabeledArg({
	label,
	risk,
	arg,
	typeName,
	network,
}: {
	label: string;
	risk?: 'high' | 'medium' | 'none';
	arg: AnalyzedCommandArgument;
	typeName: string | null;
	network: Network;
}) {
	return (
		<div className="rounded-md border border-border bg-card/40 px-2.5 py-1.5">
			<div
				className={`mb-1 font-mono text-[11px] ${
					risk === 'high'
						? 'text-destructive'
						: risk === 'medium'
							? 'text-warning'
							: 'text-foreground'
				}`}
			>
				{label}
			</div>
			<ArgValue
				arg={arg}
				typeName={typeName}
				network={network}
			/>
		</div>
	);
}

function CommandRow({
	command: c,
	index,
	packageNames,
	network,
}: {
	command: AnalyzedCommand;
	index: number;
	packageNames: Record<string, string>;
	network: Network;
}) {
	let title = c.$kind as string;
	let summary: React.ReactNode = null;
	let detail: React.ReactNode = null;
	let riskHigh = false;

	if (c.$kind === 'MoveCall') {
		const m = c.command;
		const mvrName = packageNames[m.package];
		const params = (c.function?.parameters ??
			[]) as unknown as OpenSignature[];
		const types = m.typeArguments?.length
			? `<${m.typeArguments.map((t) => shortType(t)).join(', ')}>`
			: '';
		const call = assessCall(params, m.package);
		const coinArgIdx = coinTypeArgIndices(params);
		riskHigh = call.overall === 'high';
		const flagged = call.params.filter(
			(p) => p.risk !== 'none',
		);
		title = 'MoveCall';
		summary = (
			<>
				<span className="block truncate font-mono text-[11.5px]">
					{mvrName ? (
						<span className="font-sans font-medium text-foreground">
							{mvrName}
							<span className="ml-1 rounded bg-muted px-1 py-0.5 text-[9px] font-normal uppercase tracking-wide text-faint">
								mvr
							</span>
						</span>
					) : (
						<span className="text-muted-foreground">
							{shortId(m.package)}
						</span>
					)}
					<span className="text-muted-foreground">
						{'::'}
						{m.module}
						{'::'}
						{m.function}
						{types}
					</span>
					<span className="text-faint">
						{' '}
						· {c.arguments.length} arg(s)
					</span>
				</span>
				{flagged.length > 0 && (
					<div className="mt-1 flex flex-wrap gap-1">
						{flagged.map((p, i) => (
							<span
								key={i}
								title={p.reason}
								className={`cursor-help rounded px-1.5 py-0.5 font-mono text-[10.5px] ${
									p.risk === 'high'
										? 'bg-destructive/15 text-destructive'
										: 'bg-warning/15 text-warning'
								}`}
							>
								{p.signature}
							</span>
						))}
					</div>
				)}
			</>
		);
		detail = (
			<div className="space-y-2.5">
				<div className="rounded-md border border-border bg-card/40 px-2.5 py-2">
					{mvrName ? <KV k="name">{mvrName}</KV> : null}
					<KV k="package">
						<IdLink
							id={m.package}
							href={explorerPackageUrl(m.package, network)}
						/>
					</KV>
					<KV k="module">{m.module}</KV>
					<KV k="function">{m.function}</KV>
					{m.typeArguments?.length ? (
						<KV k="typeArgs">
							<span className="flex flex-col gap-0.5">
								{m.typeArguments.map((t, i) => (
									<TypeArg
										key={i}
										type={t}
										isCoin={coinArgIdx.has(i)}
										network={network}
									/>
								))}
							</span>
						</KV>
					) : null}
				</div>
				{c.arguments.length > 0 && (
					<div>
						<div className="mb-1 text-[11px] text-faint">
							Arguments
						</div>
						<div className="space-y-1.5">
							{c.arguments.map((arg, i) => {
								const p = call.params[i];
								const sig = params[i];
								return (
									<LabeledArg
										key={i}
										label={
											sig ? formatParam(sig) : `arg ${i}`
										}
										risk={p?.risk}
										arg={arg}
										typeName={pureTypeName(paramBody(sig))}
										network={network}
									/>
								);
							})}
						</div>
					</div>
				)}
			</div>
		);
	} else {
		const text =
			c.$kind === 'TransferObjects'
				? `${c.objects.length} object(s) → recipient`
				: c.$kind === 'SplitCoins'
					? `into ${c.amounts.length} amount(s)`
					: c.$kind === 'MergeCoins'
						? `${c.sources.length} source(s) → 1 destination`
						: c.$kind === 'MakeMoveVec'
							? `${c.elements.length} element(s)`
							: c.$kind === 'Publish'
								? 'publish a new package'
								: c.$kind === 'Upgrade'
									? 'upgrade an existing package'
									: '';
		if (text)
			summary = (
				<span className="block truncate font-mono text-[11.5px] text-muted-foreground">
					{text}
				</span>
			);

		// Build the labeled argument list per command kind.
		const args: {
			label: string;
			arg: AnalyzedCommandArgument;
			typeName: string | null;
		}[] = [];
		if (c.$kind === 'SplitCoins') {
			args.push({
				label: 'coin',
				arg: c.coin,
				typeName: null,
			});
			c.amounts.forEach((a, i) =>
				args.push({
					label: `amount[${i}]`,
					arg: a,
					typeName: 'u64',
				}),
			);
		} else if (c.$kind === 'MergeCoins') {
			args.push({
				label: 'destination',
				arg: c.destination,
				typeName: null,
			});
			c.sources.forEach((s, i) =>
				args.push({
					label: `source[${i}]`,
					arg: s,
					typeName: null,
				}),
			);
		} else if (c.$kind === 'TransferObjects') {
			c.objects.forEach((o, i) =>
				args.push({
					label: `object[${i}]`,
					arg: o,
					typeName: null,
				}),
			);
			args.push({
				label: 'recipient',
				arg: c.address,
				typeName: 'address',
			});
		} else if (c.$kind === 'MakeMoveVec') {
			c.elements.forEach((e, i) =>
				args.push({
					label: `element[${i}]`,
					arg: e,
					typeName: null,
				}),
			);
		} else if (c.$kind === 'Upgrade') {
			args.push({
				label: 'ticket',
				arg: c.ticket,
				typeName: null,
			});
		}

		if (args.length > 0)
			detail = (
				<div className="space-y-1.5">
					{args.map((a, i) => (
						<LabeledArg
							key={i}
							label={a.label}
							arg={a.arg}
							typeName={a.typeName}
							network={network}
						/>
					))}
				</div>
			);
	}

	const highlight =
		riskHigh ||
		c.$kind === 'TransferObjects' ||
		c.$kind === 'Publish' ||
		c.$kind === 'Upgrade';

	const head = (
		<>
			<span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
				{index}
			</span>
			<div className="min-w-0 flex-1">
				<span className="text-[13px] font-medium">
					{title}
				</span>
				{summary}
			</div>
		</>
	);

	const wrap = highlight
		? 'border-warning/30 bg-warning/[0.05]'
		: 'border-border bg-card/50';

	// Expandable when there's decoded detail to show; otherwise a plain row.
	if (!detail)
		return (
			<li
				className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${wrap}`}
			>
				{head}
			</li>
		);

	return (
		<li className={`rounded-lg border ${wrap}`}>
			<details className="group">
				<summary className="flex cursor-pointer select-none items-start gap-2.5 px-3 py-2">
					{head}
					<ChevronDown className="mt-1 h-3.5 w-3.5 flex-none text-faint transition group-open:rotate-180" />
				</summary>
				<div className="border-t border-border/60 px-3 py-2.5">
					{detail}
				</div>
			</details>
		</li>
	);
}

export function CapturedTxDetails({
	commands,
	accessLevel,
	network,
	packageNames,
	rawSimulation,
}: {
	commands: AnalyzedCommand[] | null;
	accessLevel: Record<string, AccessLevel> | null;
	network: string;
	packageNames: Record<string, string>;
	rawSimulation: unknown;
}) {
	const accessCounts = accessLevel
		? Object.values(accessLevel).reduce(
				(acc, lvl) => {
					acc[lvl] = (acc[lvl] ?? 0) + 1;
					return acc;
				},
				{} as Record<AccessLevel, number>,
			)
		: null;

	return (
		<Card className="space-y-5 p-5">
			<div className="text-sm font-medium">
				Transaction details
			</div>

			<section>
				<div className="mb-2 text-xs text-muted-foreground">
					Commands{commands ? ` (${commands.length})` : ''}{' '}
					· tap to expand
				</div>
				{!commands ? (
					<span className="text-sm text-muted-foreground">
						Decoding…
					</span>
				) : commands.length === 0 ? (
					<span className="text-sm text-muted-foreground">
						No commands.
					</span>
				) : (
					<ol className="space-y-1.5">
						{commands.map((c, i) => (
							<CommandRow
								key={i}
								command={c}
								index={i}
								packageNames={packageNames}
								network={network as Network}
							/>
						))}
					</ol>
				)}
			</section>

			{accessCounts && (
				<section>
					<div className="mb-2 text-xs text-muted-foreground">
						Object access requested
					</div>
					<div className="flex flex-wrap gap-2">
						{accessCounts.transfer ? (
							<Badge tone="warn">
								{accessCounts.transfer} transfer (gives
								away)
							</Badge>
						) : null}
						{accessCounts.mutate ? (
							<Badge tone="info">
								{accessCounts.mutate} mutate
							</Badge>
						) : null}
						{accessCounts.read ? (
							<Badge tone="muted">
								{accessCounts.read} read
							</Badge>
						) : null}
						{!accessCounts.transfer &&
							!accessCounts.mutate &&
							!accessCounts.read && (
								<span className="text-sm text-muted-foreground">
									None
								</span>
							)}
					</div>
				</section>
			)}

			{rawSimulation != null && (
				<details className="group rounded-lg border border-border bg-card/40">
					<summary className="flex cursor-pointer select-none items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-muted-foreground">
						<ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
						Raw simulation result (gas, object changes,
						events)
					</summary>
					<pre className="max-h-96 overflow-auto border-t border-border px-3.5 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
						{JSON.stringify(rawSimulation, bigintSafe, 2)}
					</pre>
				</details>
			)}

			<p className="flex items-center gap-1.5 text-[11px] text-faint">
				<ArrowRight className="h-3 w-3" />
				Decoded locally from the transaction bytes — this is
				exactly what will be signed.
			</p>
		</Card>
	);
}
