// SPDX-License-Identifier: Apache-2.0
// Shared pre-signing security review for a transaction's bytes. Used on the
// dApp-capture page AND the pending-proposal page so EVERY multisig member sees
// the same simulation + parameter-risk + Move Registry + AI analysis before
// they sign — not just whoever first captured it.
//
// The parent owns the analyzer + dry-run mutations (it also gates its sign/
// approve button on them); this component derives the views, resolves MVR
// names, and renders. AI explanation is informational only.

import { formatAddress } from '@mysten/sui/utils';
import {
	AlertTriangle,
	CheckCircle2,
	KeyRound,
	XCircle,
} from 'lucide-react';
import { useMemo } from 'react';

import type { TransactionAnalysis } from '../hooks/analysis';
import { useCoinMeta } from '../hooks/coinMeta';
import { useReverseResolve } from '../hooks/mvr';
import {
	detectPrivilegedTransfers,
	detectUnrecognizedTransfers,
} from '../lib/adminTransfer';
import { decodeCommandPures } from '../lib/aiCommands';
import {
	coinSymbolFromType,
	formatUnits,
} from '../lib/coins';
import type { TxExplainInput } from '../lib/deepseek';
import {
	assessCall,
	formatParam,
	isFrameworkPackage,
	type OpenSignature,
} from '../lib/paramRisk';
import { getRpcHost } from '../lib/rpc';
import { parseFundsWithdrawals } from '../lib/withdrawals';
import { AiExplainPanel } from './AiExplainPanel';
import { CapturedTxDetails } from './CapturedTxDetails';
import { TransactionEffects } from './TransactionEffects';
import { Badge, Card } from './ui/kit';

function fmtCoin(coinType: string, amount: bigint) {
	const neg = amount < 0n;
	const abs = neg ? -amount : amount;
	const isSui = coinType.endsWith('::sui::SUI');
	const v = isSui
		? `${(Number(abs) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 })} SUI`
		: `${abs} ${coinType.split('::').slice(-1)[0]}`;
	return `${neg ? '−' : '+'}${v}`;
}

/** Drop bigints (→ strings) so the value is safe to JSON.stringify for the LLM. */
function noBigints<T>(v: T): T {
	return JSON.parse(
		JSON.stringify(v, (_k, x) =>
			typeof x === 'bigint' ? x.toString() : x,
		),
	);
}

export interface SimulationState {
	pending: boolean;
	success: boolean;
	errorMessage?: string;
	data: unknown;
}

export function TransactionSecurityReview({
	network,
	multisig,
	dapp,
	transactionBytes,
	analysisData,
	analysisPending,
	sim,
	collapseEffects = false,
}: {
	network: string;
	multisig: string;
	dapp?: string;
	/** The exact bytes being signed — decoded locally for the withdrawal caps. */
	transactionBytes: string;
	analysisData?: TransactionAnalysis;
	analysisPending: boolean;
	sim: SimulationState;
	/**
	 * Collapse the Transaction-effects panel by default. Set for publish/upgrade
	 * proposals, where the object-flow detail is secondary noise next to the
	 * source-verification step.
	 */
	collapseEffects?: boolean;
}) {
	const commands = analysisData?.commands.result ?? null;
	const accessLevel =
		analysisData?.accessLevel.result ?? null;
	const byAddress =
		analysisData?.balanceFlows.result?.byAddress ?? null;
	const senderFlows =
		analysisData?.balanceFlows.result?.sender ?? [];
	const issues = analysisData?.issues ?? [];

	// Move Registry reverse resolution (id → @scope/name).
	const packageIds = useMemo(() => {
		if (!commands) return [];
		const ids = new Set<string>();
		for (const c of commands)
			if (c.$kind === 'MoveCall')
				ids.add(c.command.package);
		return [...ids];
	}, [commands]);
	const mvr = useReverseResolve(network, packageIds);
	const packageNames = mvr.data ?? {};

	// Multisig's OWN net asset flows — the headline.
	const multisigFlows =
		byAddress?.[multisig] ?? senderFlows;
	const multisigOutflow = multisigFlows.some(
		(f) => f.amount < 0n,
	);
	const givesAwayObjects = accessLevel
		? Object.values(accessLevel).filter(
				(l) => l === 'transfer',
			).length
		: 0;

	// High-severity: the simulation shows an UpgradeCap, an admin-named object, or
	// a value-bearing DeFi position/cap ending up owned by an address outside this
	// multisig — i.e. contract-upgrade / admin authority or real funds are being
	// handed to someone else.
	const adminTransfers = useMemo(
		() =>
			sim.success
				? detectPrivilegedTransfers(sim.data, multisig)
				: [],
		[sim.success, sim.data, multisig],
	);

	// G3 (amber): non-coin objects the multisig owns that leave to another
	// address but that the privileged-transfer allowlist above did NOT flag —
	// a novel admin cap / position type would otherwise pass silently. Never
	// blocks; it's a "confirm this is intended" warning, so it stays amber.
	const unknownTransfers = useMemo(
		() =>
			sim.success
				? detectUnrecognizedTransfers(sim.data, multisig)
				: [],
		[sim.success, sim.data, multisig],
	);

	// Static parameter-type risk (independent of simulation).
	const moveCalls = commands
		? commands.filter((c) => c.$kind === 'MoveCall')
		: [];
	const callRisks = moveCalls.map((c) =>
		assessCall(
			((c as { function?: { parameters?: unknown[] } })
				.function?.parameters ??
				[]) as unknown as OpenSignature[],
			(c as { command?: { package?: string } }).command
				?.package,
		),
	);
	// Only spend power counts as "drainable" — a borrowed `&Cap` authorizes the
	// call, not a withdrawal, so it's reported separately and without alarm. A
	// Cap handed over by value / `&mut` is a different (still serious) hazard.
	const drainableInputs = callRisks.reduce(
		(n, r) => n + r.drainCount,
		0,
	);
	const allParams = callRisks.flatMap((r) => r.params);
	const surrenderedCaps = allParams.filter(
		(p) => p.kind === 'capability' && p.risk === 'high',
	).length;
	const borrowedCaps = allParams.filter(
		(p) => p.kind === 'capability' && p.risk === 'info',
	).length;

	// Account-balance withdrawal authorizations carried in the PTB inputs. Each
	// `limit` is the signed ceiling — the most this signature can withdraw. Shown
	// for reference, scaled by the token's own decimals/symbol.
	const withdrawals = useMemo(
		() => parseFundsWithdrawals(transactionBytes),
		[transactionBytes],
	);
	const coinMeta =
		useCoinMeta(withdrawals.map((w) => w.coinType)).data ??
		{};

	// Red is reserved for UNBOUNDED spend power — a &mut Coin / &mut Balance (or
	// by-value coin) the contract can drain to the full balance — or a capability
	// surrendered outright. A plain simulated outflow, a withdrawal capped by an
	// explicit limit, or a merely borrowed `&Cap` is not that, so it stays amber.
	const hasUnboundedRisk =
		drainableInputs > 0 || surrenderedCaps > 0;
	// Pair each MoveCall's full param types with the app's own per-param risk
	// verdict (from `callRisks`, computed above) so the model EXPLAINS our flags
	// instead of re-deriving them. `assessCall` already exempts framework calls,
	// so framework params come through as `risk: 'none'`.
	const functionSignatures = moveCalls.map((c, i) => {
		const m = (
			c as {
				command: {
					package: string;
					module: string;
					function: string;
					typeArguments?: string[];
				};
			}
		).command;
		const risks = callRisks[i]?.params ?? [];
		return {
			packageId: m.package,
			mvrName: packageNames[m.package] ?? null,
			isFramework: isFrameworkPackage(m.package),
			module: m.module,
			function: m.function,
			typeArguments: m.typeArguments ?? [],
			params: (
				((c as { function?: { parameters?: unknown[] } })
					.function?.parameters ??
					[]) as unknown as OpenSignature[]
			).map((p, j) => ({
				type: formatParam(p, true),
				risk: risks[j]?.risk ?? 'none',
				reason: risks[j]?.reason,
			})),
		};
	});

	const simStatus: TxExplainInput['simulation'] | null =
		sim.success
			? { status: 'would-succeed' }
			: sim.errorMessage
				? { status: 'would-fail', error: sim.errorMessage }
				: null;

	// Decode each command's Pure inputs by their Move type (so the model reads
	// `0x…` / decimals, not raw base64), then inline each MoveCall's Move
	// Registry name so it reads the human-readable package identity in context
	// (it also gets the flat `functionSignatures` list and `packageNames` map).
	const enrichedCommands = (commands ?? []).map((c) => {
		const decoded = decodeCommandPures(c) as object;
		return c.$kind === 'MoveCall'
			? {
					...decoded,
					mvrName:
						packageNames[
							(c as { command: { package: string } })
								.command.package
						] ?? null,
				}
			: decoded;
	});

	// The full dry-run result — the authoritative simulated outcome (gas, events,
	// object ownership changes, balance changes, object types). We strip only the
	// `transaction` sub-object: it re-encodes the PTB (with raw base64 inputs)
	// that `commands` already carries DECODED, so it's pure duplication. Bigints
	// are stringified for JSON. Null unless the simulation succeeded.
	const dryRun = useMemo(() => {
		if (!sim.success) return null;
		const tx = (
			sim.data as {
				Transaction?: Record<string, unknown>;
			} | null
		)?.Transaction;
		if (!tx) return null;
		const { transaction: _omitRawTx, ...effects } = tx;
		return noBigints(effects);
	}, [sim.success, sim.data]);

	const privilegedTransfers = adminTransfers.map((t) => ({
		objectId: t.objectId,
		type: t.type,
		protocol: t.protocol,
		newOwner: t.newOwner,
		reason: t.reason,
	}));

	// Account-balance withdrawal ceilings, scaled to each token's decimals — the
	// max this signature authorizes (already shown in the UI, now also given to
	// the model as a concrete risk signal).
	const withdrawalAuths = withdrawals.map((w) => {
		const meta = coinMeta[w.coinType];
		return {
			coinType: w.coinType,
			symbol:
				meta?.symbol ?? coinSymbolFromType(w.coinType),
			from: w.from,
			limit: formatUnits(w.limit, meta?.decimals ?? null),
		};
	});

	const aiInput: TxExplainInput | null =
		commands && simStatus
			? {
					dapp: dapp || 'n/a',
					network,
					multisig,
					commands: noBigints(enrichedCommands),
					packageNames,
					functionSignatures,
					withdrawals: withdrawalAuths,
					accessLevel: accessLevel ?? {},
					issues: noBigints(issues),
					privilegedTransfers,
					simulation: simStatus,
					dryRun,
				}
			: null;

	return (
		<div className="space-y-4">
			<Card className="space-y-4 p-5">
				{/* Highest-severity flag: a privileged / value-bearing object (contract
				    UpgradeCap, an admin-named object, or a DeFi position/cap) leaving
				    the multisig's control. This hands upgrade / admin authority or
				    real funds to another address, so it leads the review in red. */}
				{adminTransfers.length > 0 && (
					<div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4">
						<div className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
							<AlertTriangle className="h-4 w-4 flex-none" />
							Privileged / high-value transfer
						</div>
						<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
							This transaction would move{' '}
							{adminTransfers.length} privileged or
							value-bearing object
							{adminTransfers.length > 1 ? 's' : ''} to an
							address outside this multisig. Whoever
							receives{' '}
							{adminTransfers.length > 1 ? 'them' : 'it'}{' '}
							gains that control (contract authority, or the
							underlying DeFi position / funds) — confirm
							the recipient is intended before signing.
						</p>
						<ul className="mt-2.5 space-y-1.5">
							{adminTransfers.map((t) => (
								<li
									key={t.objectId}
									className="rounded-lg bg-card/60 px-2.5 py-1.5"
								>
									<div className="text-xs font-medium text-foreground">
										{t.reason === 'upgrade-cap'
											? 'UpgradeCap — contract upgrade authority'
											: t.reason === 'admin'
												? `${t.typeName} — admin authority`
												: `${t.protocol ? `${t.protocol} ` : ''}${t.typeName} — DeFi position / value-bearing object`}
									</div>
									<div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
										{formatAddress(t.objectId)} →{' '}
										{formatAddress(t.newOwner)}
									</div>
								</li>
							))}
						</ul>
					</div>
				)}

				{/* G3 — an unrecognized (non-coin) object the multisig holds is
				    leaving to another address. The red detector above only knows
				    a finite allowlist of privileged/value types, so this amber
				    catch-all makes a novel admin cap / position visible instead
				    of letting it pass as a silent green. Informational, amber. */}
				{unknownTransfers.length > 0 && (
					<div className="rounded-xl border border-warning/40 bg-warning/[0.07] p-4">
						<div className="flex items-center gap-1.5 text-sm font-semibold text-warning">
							<AlertTriangle className="h-4 w-4 flex-none" />
							Unrecognized object leaving your multisig
						</div>
						<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
							{unknownTransfers.length} object
							{unknownTransfers.length > 1 ? 's' : ''} your
							multisig owns would be transferred to another
							address.{' '}
							{unknownTransfers.length > 1
								? 'These'
								: 'This'}{' '}
							type isn't one the review recognizes, so it
							can't judge what control or value{' '}
							{unknownTransfers.length > 1 ? 'they' : 'it'}{' '}
							carr
							{unknownTransfers.length > 1 ? 'y' : 'ies'} —
							confirm the recipient and the object are
							intended before signing.
						</p>
						<ul className="mt-2.5 space-y-1.5">
							{unknownTransfers.map((t) => (
								<li
									key={t.objectId}
									className="rounded-lg bg-card/60 px-2.5 py-1.5"
								>
									<div className="text-xs font-medium text-foreground">
										{t.typeName}
									</div>
									<div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
										{formatAddress(t.objectId)} →{' '}
										{formatAddress(t.newOwner)}
									</div>
								</li>
							))}
						</ul>
					</div>
				)}

				{/* What the SIMULATION shows for this multisig — not a verdict.
				    Outflow here is normal and intended, so it reads amber, not
				    red; red is reserved for unbounded spend authority below. */}
				<div
					className={`rounded-xl border p-4 ${
						multisigOutflow || givesAwayObjects
							? 'border-warning/40 bg-warning/[0.07]'
							: 'border-border bg-muted/30'
					}`}
				>
					<div className="mb-1.5 text-xs font-medium text-muted-foreground">
						Simulated effect on your multisig
					</div>
					{multisigFlows.length === 0 ? (
						<span className="text-sm text-muted-foreground">
							{analysisPending
								? 'Analyzing…'
								: 'No net coin movement for this multisig in simulation'}
						</span>
					) : (
						<div className="flex flex-wrap gap-2">
							{multisigFlows.map((f, i) => (
								<span
									key={i}
									className={`rounded-lg px-2.5 py-1.5 font-mono text-sm font-semibold ${
										f.amount < 0n
											? 'bg-warning/15 text-warning'
											: 'bg-success/15 text-success'
									}`}
								>
									{fmtCoin(f.coinType, f.amount)}
								</span>
							))}
						</div>
					)}
					{multisigOutflow && (
						<div className="mt-2 text-xs font-medium text-warning">
							Simulation shows assets leaving this multisig.
						</div>
					)}
					{givesAwayObjects > 0 && (
						<div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-warning">
							<AlertTriangle className="h-3.5 w-3.5 flex-none" />
							{givesAwayObjects} object(s) would be
							transferred away from your control.
						</div>
					)}
				</div>

				{/* Account-balance withdrawal limits — the most this signature
				    authorizes. Informational (the amount is capped), scaled by
				    each token's own decimals/symbol. */}
				{withdrawals.length > 0 && (
					<div className="rounded-xl border border-border bg-muted/30 p-4">
						<div className="mb-2 text-xs font-medium text-muted-foreground">
							Maximum this signature authorizes
						</div>
						<div className="space-y-1.5">
							{withdrawals.map((w, i) => {
								const meta = coinMeta[w.coinType];
								const symbol =
									meta?.symbol ??
									coinSymbolFromType(w.coinType);
								return (
									<div
										key={i}
										className="flex items-center justify-between gap-3 rounded-lg bg-card/60 px-2.5 py-1.5"
									>
										<span className="font-mono text-[11.5px] text-muted-foreground">
											{w.from} balance · {symbol}
										</span>
										<span className="font-mono text-sm font-semibold text-foreground">
											≤{' '}
											{formatUnits(
												w.limit,
												meta?.decimals ?? null,
											)}{' '}
											{symbol}
										</span>
									</div>
								);
							})}
						</div>
						<div className="mt-2 text-xs text-muted-foreground">
							The most this transaction's signature can
							withdraw from the{' '}
							{withdrawals.length > 1
								? 'account balances'
								: 'account balance'}{' '}
							— the authorization ceiling in the signed
							bytes, not necessarily the amount actually
							moved.
						</div>
					</div>
				)}

				{/* A borrowed `&Cap` is how every admin entry point is gated — it
				    authorizes this call and nothing more. State it plainly, in
				    neutral colors: it is context, not a warning. */}
				{borrowedCaps > 0 && (
					<div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
						<KeyRound className="mt-0.5 h-3.5 w-3.5 flex-none" />
						<span>
							<span className="font-medium text-foreground">
								Capability-gated call
							</span>{' '}
							— {borrowedCaps} capability object(s) are
							borrowed by immutable reference (
							<code className="font-mono">&Cap</code>),
							proving authority for this call. They are not
							transferred and cannot be modified.
						</span>
					</div>
				)}

				{/* Simulation is not a cap on the executed outcome. Reads red when
				    the tx grants unbounded/over-authorized spend power. */}
				<div
					className={`flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed text-muted-foreground ${
						hasUnboundedRisk
							? 'border-destructive/40 bg-destructive/10'
							: 'border-warning/40 bg-warning/10'
					}`}
				>
					<AlertTriangle
						className={`mt-0.5 h-3.5 w-3.5 flex-none ${
							hasUnboundedRisk
								? 'text-destructive'
								: 'text-warning'
						}`}
					/>
					<span>
						{drainableInputs > 0 ? (
							<>
								<span className="font-medium text-foreground">
									{drainableInputs} input(s) give the
									contract spend access to your
									coins/balances.
								</span>{' '}
								A{' '}
								<code className="font-mono">
									&mut Coin/Balance
								</code>{' '}
								(or by-value coin) is an{' '}
								<span className="font-medium">
									unbounded authorization
								</span>{' '}
								— the contract may withdraw any amount up to
								the full balance; this transaction does not
								cap it.{' '}
							</>
						) : null}
						{surrenderedCaps > 0 ? (
							<>
								<span className="font-medium text-foreground">
									{surrenderedCaps} capability object(s) are
									handed to the contract by value or by{' '}
									<code className="font-mono">&mut</code>.
								</span>{' '}
								The capability itself — not just its
								authority for this call — is surrendered or
								modifiable.{' '}
							</>
						) : null}
						The simulated figure reflects the current code
						path and on-chain state only — the amount
						actually transferred is decided by the contract
						at execution time and can depend on state that
						changes after you sign. Treat everything here as
						auxiliary information, not a safety verdict —
						verify the package and terms out-of-band before
						approving.
					</span>
				</div>

				{/* Simulation status */}
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs text-muted-foreground">
						Simulation:
					</span>
					{sim.pending && (
						<span className="text-sm text-muted-foreground">
							Simulating…
						</span>
					)}
					{sim.success && (
						<Badge tone="ok">
							<CheckCircle2 className="h-3 w-3" /> would
							succeed
						</Badge>
					)}
					{sim.errorMessage && (
						<Badge tone="danger">
							<XCircle className="h-3 w-3" />
							would fail: {sim.errorMessage}
						</Badge>
					)}
				</div>

				{/* G2 — the review is only as trustworthy as the fullnode that
				    simulated it, so name it. A compromised endpoint can return a
				    misleading result; the endpoint is pinnable in the top bar. */}
				<p className="text-[11px] text-muted-foreground">
					Simulated against{' '}
					<span className="font-mono">
						{getRpcHost(network as 'mainnet' | 'testnet')}
					</span>{' '}
					— results are only as trustworthy as this
					endpoint. Pin a fullnode you trust from the top
					bar.
				</p>

				{issues.length > 0 && (
					<div className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3">
						<div className="flex items-center gap-1.5 text-xs font-medium text-warning">
							<AlertTriangle className="h-3.5 w-3.5" />
							{issues.length} issue
							{issues.length > 1 ? 's' : ''} flagged
						</div>
						{issues.map((iss, i) => (
							<p
								key={i}
								className="text-xs text-muted-foreground"
							>
								•{' '}
								{(iss as { message?: string }).message ??
									JSON.stringify(iss)}
							</p>
						))}
					</div>
				)}
			</Card>

			{sim.success && (
				<TransactionEffects
					simData={sim.data}
					multisig={multisig}
					network={network}
					collapsed={collapseEffects}
				/>
			)}

			<CapturedTxDetails
				commands={commands}
				accessLevel={accessLevel}
				network={network}
				packageNames={packageNames}
				rawSimulation={sim.data}
			/>

			<AiExplainPanel input={aiInput} />
		</div>
	);
}
