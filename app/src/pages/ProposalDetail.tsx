// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { ProposalStatus } from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import {
	formatAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import {
	AlertTriangle,
	ArrowLeft,
	Ban,
	Check,
	CheckCircle2,
	Clock,
	Copy,
	MessageSquare,
	PenLine,
	Send,
	ShieldAlert,
	ShieldCheck,
	Terminal,
	XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
	Link,
	useNavigate,
	useParams,
} from 'react-router-dom';

import { DigestVerify } from '../components/DigestVerify';
import { PublishUpgradeVerifyPanel } from '../components/PublishUpgradeVerifyPanel';
import {
	TransactionSecurityReview,
	type SimulationState,
} from '../components/TransactionSecurityReview';
import {
	Avatar,
	Badge,
	Button,
	Card,
	EmptyState,
	SignerProgress,
	Spinner,
} from '../components/ui/kit';
import { useApiAuth } from '../contexts/ApiAuthContext';
import {
	useDryRun,
	useTransactionAnalysis,
} from '../hooks/analysis';
import {
	useCancelProposal,
	useExecuteProposal,
	useProposal,
	useRejectProposal,
	useSignProposal,
} from '../hooks/proposals';
import { STORAGE_NETWORK_KEY } from '../lib/constants';
import {
	deriveMultisigAddress,
	memberAddress,
	proposalUnreachable,
	signedWeight,
} from '../lib/multisig';

// Local decode of the exact bytes the wallet will sign. `$(pbpaste)` pulls the
// base64 the user just copied, so they don't paste tens of KB into the shell.
const DECODE_CMD =
	'sui keytool decode-or-verify-tx --tx-bytes "$(pbpaste)"';

function CopyChip({
	text,
	label,
}: {
	text: string;
	label: string;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={() => {
				void navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
			className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-accent"
		>
			{copied ? (
				<Check className="h-3 w-3 text-success" />
			) : (
				<Copy className="h-3 w-3" />
			)}
			{copied ? 'Copied' : label}
		</button>
	);
}

function safeMemberAddress(publicKey: string): string {
	try {
		return memberAddress(publicKey);
	} catch {
		return publicKey;
	}
}

function networkLabel(network: string): string {
	return `Sui ${network.charAt(0).toUpperCase()}${network.slice(1)}`;
}

export function ProposalDetail() {
	const { address, digest } = useParams<{
		address: string;
		digest: string;
	}>();
	const { currentAddress } = useApiAuth();
	const account = useCurrentAccount();
	const currentNetwork = useCurrentNetwork();
	const dappKit = useDAppKit();
	const navigate = useNavigate();

	const { data: proposal, isLoading } = useProposal(digest);
	const analysis = useTransactionAnalysis();
	const dryRun = useDryRun();
	const sign = useSignProposal();
	const execute = useExecuteProposal();
	const cancel = useCancelProposal();
	const reject = useRejectProposal();

	// Self-reported attestation for publish/upgrade signing (see verify panel).
	const [reproduced, setReproduced] = useState(false);
	const [reviewedDiff, setReviewedDiff] = useState(false);

	const bytes = proposal?.transactionBytes;

	// Auto-run WYSIWYS analysis + dry-run when the proposal loads.
	useEffect(() => {
		if (!bytes) return;
		analysis.mutate(bytes);
		dryRun.mutate(bytes);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bytes]);

	if (isLoading)
		return <Spinner label="Loading proposal…" />;

	// Executed proposals are deleted from the relay (the chain is the record),
	// so a missing proposal usually means it just executed or was cancelled.
	if (!proposal)
		return (
			<div className="space-y-4">
				<EmptyState
					title="This proposal is no longer pending"
					body="It was executed or cancelled. Executed transactions are recorded on-chain."
				/>
				<div className="flex justify-center gap-4 text-sm">
					<Link
						to={`/multisig/${address}/transactions`}
						className="text-primary hover:underline"
					>
						View on-chain history →
					</Link>
					<Link
						to={`/multisig/${address}/pending`}
						className="text-muted-foreground hover:text-foreground"
					>
						Back to pending
					</Link>
				</div>
			</div>
		);

	const members = [...proposal.multisig.members].sort(
		(a, b) => a.order - b.order,
	);
	const threshold = proposal.multisig.threshold;
	const signedPks = proposal.signatures.map(
		(s) => s.publicKey,
	);
	const weight = signedWeight(members, signedPks);
	const ready = weight >= threshold;
	const signedCount = members.filter((m) =>
		signedPks.includes(m.publicKey),
	).length;
	const remaining = Math.max(0, threshold - weight);

	let addressMatches = false;
	try {
		addressMatches =
			deriveMultisigAddress(members, threshold) ===
			proposal.multisig.address;
	} catch {
		addressMatches = false;
	}

	// WYSIWYS sender binding (mirrors the hard gate in useSignProposal): the
	// transaction's sender must be the multisig locally derived from its
	// members + threshold, AND that must be the multisig in the URL. If this is
	// false the relay is serving bytes that act on a different account than the
	// one it claims — signing is blocked, not just badged.
	let senderMatches = false;
	try {
		const sender = Transaction.from(
			proposal.transactionBytes,
		).getData().sender;
		const derived = normalizeSuiAddress(
			deriveMultisigAddress(members, threshold),
		);
		senderMatches =
			!!sender &&
			normalizeSuiAddress(sender) === derived &&
			(!address ||
				derived === normalizeSuiAddress(address));
	} catch {
		senderMatches = false;
	}

	const myPk = currentAddress?.publicKey;
	const isMember = members.some(
		(m) => m.publicKey === myPk,
	);
	const hasSigned = signedPks.includes(myPk ?? '');

	// Reject votes (signed personal messages, never part of the execution sig
	// set). Once they make the threshold unreachable, any member may discard.
	const rejectedPks = (proposal.rejections ?? []).map(
		(r) => r.publicKey,
	);
	const rejectWeight = signedWeight(members, rejectedPks);
	const hasRejected = rejectedPks.includes(myPk ?? '');
	const unreachable = proposalUnreachable(
		members,
		threshold,
		rejectedPks,
	);
	const isProposer =
		!!currentAddress &&
		currentAddress.address === proposal.proposerAddress;

	// A proposal stops being actionable once it leaves the PENDING state
	// (executed → SUCCESS/FAILURE, or CANCELLED). The relay flips this after
	// the executor reports the on-chain outcome.
	const isPending =
		proposal.status === ProposalStatus.PENDING;
	const isExecuted =
		proposal.status === ProposalStatus.SUCCESS;
	const isFailed =
		proposal.status === ProposalStatus.FAILURE;
	const isCancelled =
		proposal.status === ProposalStatus.CANCELLED;
	const isPkg =
		proposal.kind === 'publish' ||
		proposal.kind === 'upgrade';

	// The proposal belongs to a specific network; the connected client/wallet
	// is on `currentNetwork`. Signing/executing only works when they match.
	const onWrongNetwork =
		proposal.network !== currentNetwork;
	function switchToProposalNetwork() {
		dappKit.switchNetwork(proposal!.network as never);
		localStorage.setItem(
			STORAGE_NETWORK_KEY,
			proposal!.network,
		);
	}

	// WYSIWYS gate: cannot sign until decoded + dry-run succeeds.
	const wysiwygReady =
		dryRun.isSuccess && analysis.isSuccess;
	const sim: SimulationState = {
		pending: dryRun.isPending,
		success: dryRun.isSuccess,
		errorMessage: dryRun.isError
			? (dryRun.error as Error).message
			: undefined,
		data: dryRun.data ?? null,
	};

	return (
		<div className="space-y-6">
			<Link
				to={`/multisig/${address}`}
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" /> Back to multisig
			</Link>

			{onWrongNetwork && (
				<div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
					<AlertTriangle className="h-4 w-4 flex-none text-warning" />
					<span className="text-foreground">
						This proposal is on{' '}
						<span className="font-semibold">
							{networkLabel(proposal.network)}
						</span>
						, but you’re currently on{' '}
						<span className="font-semibold">
							{networkLabel(currentNetwork)}
						</span>
						. Switch networks to sign or execute it.
					</span>
					<button
						onClick={switchToProposalNetwork}
						className="ml-auto shrink-0 rounded-md border border-warning/50 bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning transition hover:bg-warning/25"
					>
						Switch to {networkLabel(proposal.network)}
					</button>
				</div>
			)}

			<div className="grid gap-6 lg:grid-cols-[1.3fr_0.85fr]">
				{/* LEFT — transaction + WYSIWYS */}
				<div className="space-y-5">
					<Card className="p-6">
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0">
								<div className="flex items-center gap-2.5">
									<span className="font-mono text-[13px] text-faint">
										{formatAddress(proposal.digest)}
									</span>
									{isExecuted ? (
										<Badge tone="ok" dot>
											<CheckCircle2 className="h-3 w-3" />
											executed
										</Badge>
									) : isFailed ? (
										<Badge tone="danger" dot>
											<XCircle className="h-3 w-3" />
											execution failed
										</Badge>
									) : isCancelled ? (
										<Badge tone="muted" dot>
											<Ban className="h-3 w-3" />
											cancelled
										</Badge>
									) : ready ? (
										<Badge tone="ok" dot>
											ready to execute
										</Badge>
									) : (
										<Badge tone="warn" dot>
											awaiting {remaining} weight
										</Badge>
									)}
								</div>
								<h1 className="mt-2.5 font-display text-[26px] font-semibold tracking-tight">
									{proposal.description ||
										'Transaction proposal'}
								</h1>
								{proposal.description && (
									<p className="mt-1.5 flex items-start gap-1.5 text-xs text-faint">
										<MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-none" />
										<span>
											Description — an off-chain note from
											the proposer for the other signers
											(not part of the signed transaction).
										</span>
									</p>
								)}
							</div>
							{addressMatches ? (
								<Badge tone="ok" dot>
									<ShieldCheck className="h-3 w-3" />
									address verified
								</Badge>
							) : (
								<Badge tone="danger" dot>
									<ShieldAlert className="h-3 w-3" />
									address mismatch
								</Badge>
							)}
						</div>
					</Card>

					{/* Out-of-band digest: derived locally from the bytes and
					    cross-checked against the relay's claimed digest. The one
					    check that survives malware on the signer's own device. */}
					<DigestVerify
						transactionBytes={proposal.transactionBytes}
						expectedDigest={proposal.digest}
					/>

					{/* Shared security review — same view every member sees. */}
					<TransactionSecurityReview
						network={proposal.network}
						multisig={proposal.multisig.address}
						transactionBytes={proposal.transactionBytes}
						analysisData={analysis.data}
						analysisPending={analysis.isPending}
						sim={sim}
						collapseEffects={isPkg}
					/>

					{/* Publish/upgrade: local recompile-verify + attestations. */}
					<PublishUpgradeVerifyPanel proposal={proposal} />

					{/* Raw PTB */}
					<Card className="p-6">
						<div className="mb-3 flex items-center justify-between gap-3">
							<div className="text-[11px] font-semibold uppercase tracking-[1px] text-faint">
								Transaction data (verify independently)
							</div>
							<CopyChip
								text={proposal.transactionBytes}
								label="Copy bytes"
							/>
						</div>
						<pre className="max-h-48 overflow-auto rounded-lg border border-border bg-field p-4 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
							{proposal.transactionBytes}
						</pre>

						{/* How to check these exact bytes locally. */}
						<div className="mt-3 rounded-lg border border-border bg-field/40 p-4 text-[12px] leading-relaxed text-muted-foreground">
							<div className="mb-2 flex items-center gap-1.5 font-medium text-foreground">
								<Terminal className="h-3.5 w-3.5" />
								Verify these bytes locally
							</div>
							<p className="mb-2">
								This is the exact transaction your wallet
								will sign. Decode it on your own machine to
								confirm it does only what you expect — and
								nothing more:
							</p>
							<ol className="mb-2 ml-4 list-decimal space-y-1">
								<li>
									Click{' '}
									<span className="font-medium">
										Copy bytes
									</span>{' '}
									above.
								</li>
								<li>Run this in your terminal:</li>
							</ol>
							<div className="relative">
								<pre className="overflow-auto rounded-md border border-border bg-field p-3 pr-20 font-mono text-[11px] text-foreground">
									{DECODE_CMD}
								</pre>
								<div className="absolute right-2 top-2">
									<CopyChip
										text={DECODE_CMD}
										label="Copy"
									/>
								</div>
							</div>
							<p className="mt-2 text-faint">
								<code>$(pbpaste)</code> reads the bytes you
								just copied (macOS). On Linux use{' '}
								<code>
									"$(xclip -selection clipboard -o)"
								</code>{' '}
								instead.{' '}
								{isPkg ? (
									<>
										The output should be a single{' '}
										<code>Publish</code>/
										<code>Upgrade</code> command for the
										package you reviewed — no extra
										transfers or calls.
									</>
								) : (
									<>
										The decoded commands, inputs, and
										recipients should match exactly what you
										intend to approve — and nothing more.
									</>
								)}
							</p>
							{(proposal.kind === 'publish' ||
								proposal.kind === 'upgrade') && (
								<p className="mt-2 text-faint">
									To also prove the bytecode matches the
									source, recompile and match the digest —
									see{' '}
									<span className="font-medium">
										“Run locally to verify”
									</span>{' '}
									above.
								</p>
							)}
						</div>
					</Card>
				</div>

				{/* RIGHT — signature timeline + actions */}
				<div className="space-y-4">
					<Card className="p-6">
						<div className="mb-5 flex items-center justify-between">
							<span className="text-sm font-semibold">
								Signature records
							</span>
							<SignerProgress
								signed={signedCount}
								total={members.length}
								ready={ready}
								seeds={members.map((m) => m.publicKey)}
							/>
						</div>
						<div className="flex flex-col">
							{members.map((m, i) => {
								const did = signedPks.includes(m.publicKey);
								const addr = safeMemberAddress(m.publicKey);
								const last = i === members.length - 1;
								return (
									<div
										key={m.publicKey}
										className="flex gap-3.5"
									>
										<div className="flex flex-col items-center">
											{did ? (
												<Avatar seed={addr} size={30} />
											) : (
												<span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-muted text-faint">
													<Clock className="h-3.5 w-3.5" />
												</span>
											)}
											{!last && (
												<span className="my-1 min-h-6 w-0.5 flex-1 bg-border" />
											)}
										</div>
										<div className="flex-1 pb-4">
											<div className="flex items-center gap-2">
												<span className="font-mono text-[13px] font-medium text-foreground">
													{formatAddress(addr)}
												</span>
												<span className="text-faint">
													· w{m.weight}
												</span>
											</div>
											<div
												className={`mt-0.5 text-xs ${
													did
														? 'text-success'
														: 'text-warning'
												}`}
											>
												{did
													? 'Signed'
													: 'Awaiting signature'}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</Card>

					{/* Actions */}
					<Card className="space-y-3 p-5">
						{isPending ? (
							<>
								{isPkg &&
									account &&
									isMember &&
									!hasSigned &&
									!ready && (
										<div className="space-y-2 rounded-lg border border-border bg-field p-3 text-[12px]">
											<p className="text-faint">
												Confirm you verified this locally
												(self-reported — recorded for the
												other signers):
											</p>
											<label className="flex items-center gap-2 text-foreground">
												<input
													type="checkbox"
													checked={reproduced}
													onChange={(e) =>
														setReproduced(e.target.checked)
													}
												/>
												I reproduced the build digest
											</label>
											<label className="flex items-center gap-2 text-foreground">
												<input
													type="checkbox"
													checked={reviewedDiff}
													onChange={(e) =>
														setReviewedDiff(
															e.target.checked,
														)
													}
												/>
												I read the source / diff
											</label>
										</div>
									)}

								<div className="flex flex-wrap gap-2.5">
									{/* Discard: the proposer can withdraw their own proposal
									    anytime; anyone else only once rejects make the
									    threshold unreachable. */}
									{account &&
										isMember &&
										(isProposer || unreachable) && (
											<Button
												variant="danger"
												loading={cancel.isPending}
												onClick={() =>
													cancel.mutate(proposal.id)
												}
												className="flex-1"
											>
												<Ban className="h-4 w-4" />
												{isProposer ? 'Cancel' : 'Discard'}
											</Button>
										)}
									{account &&
										isMember &&
										!hasSigned &&
										!hasRejected &&
										!ready &&
										!unreachable && (
											<Button
												variant="danger"
												loading={reject.isPending}
												onClick={() =>
													reject.mutate(proposal.id)
												}
												className="flex-1"
											>
												<XCircle className="h-4 w-4" />
												Reject
											</Button>
										)}
									{account &&
										isMember &&
										!hasSigned &&
										!hasRejected &&
										!ready && (
											<Button
												disabled={
													!wysiwygReady || !senderMatches
												}
												loading={sign.isPending}
												onClick={() =>
													sign.mutate({
														proposalId: proposal.id,
														transactionBytes:
															proposal.transactionBytes,
														members,
														threshold,
														expectedMultisigAddress:
															address!,
														reproduced,
														reviewedDiff,
													})
												}
												className="flex-[2]"
											>
												<PenLine className="h-4 w-4" />
												Verify &amp; sign
											</Button>
										)}
									{ready && (
										<Button
											variant="success"
											loading={execute.isPending}
											onClick={() =>
												execute.mutate(proposal, {
													onSuccess: () =>
														navigate(
															`/multisig/${address}/transactions`,
														),
												})
											}
											className="flex-[2]"
										>
											<Send className="h-4 w-4" />
											Execute on-chain
										</Button>
									)}
								</div>

								{account &&
									isMember &&
									hasSigned &&
									!ready && (
										<div className="flex items-center justify-center gap-1.5 text-xs text-success">
											<CheckCircle2 className="h-3.5 w-3.5" />
											You signed
										</div>
									)}
								{account &&
									isMember &&
									hasRejected &&
									!unreachable && (
										<div className="flex items-center justify-center gap-1.5 text-xs text-destructive">
											<XCircle className="h-3.5 w-3.5" />
											You rejected
										</div>
									)}
								{unreachable ? (
									<p className="text-center text-xs text-destructive">
										Rejected weight {rejectWeight} —
										approval threshold unreachable. Any
										member can discard this proposal.
									</p>
								) : (
									!ready && (
										<p className="text-center text-xs text-muted-foreground">
											{remaining} more weight to execute
											{rejectWeight > 0
												? ` · ${rejectWeight} rejected`
												: ''}
										</p>
									)
								)}
								{!senderMatches &&
									account &&
									isMember &&
									!hasSigned && (
										<p className="flex items-center justify-center gap-1.5 text-center text-xs font-medium text-destructive">
											<ShieldAlert className="h-3.5 w-3.5 flex-none" />
											This proposal&apos;s transaction does
											not act on this multisig — signing is
											blocked. The relay may be serving
											tampered data.
										</p>
									)}
								{!wysiwygReady &&
									account &&
									isMember &&
									!hasSigned && (
										<p className="text-center text-[11px] text-faint">
											Signing is disabled until decode +
											simulation complete.
										</p>
									)}
								{!account && (
									<p className="text-center text-xs text-muted-foreground">
										Connect your wallet to sign.
									</p>
								)}
							</>
						) : (
							<div
								className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium ${
									isExecuted
										? 'border-success/30 bg-success/10 text-success'
										: isFailed
											? 'border-destructive/30 bg-destructive/10 text-destructive'
											: 'border-border bg-muted text-muted-foreground'
								}`}
							>
								{isExecuted ? (
									<>
										<CheckCircle2 className="h-4 w-4" />
										Executed on-chain — no further action
										needed.
									</>
								) : isFailed ? (
									<>
										<XCircle className="h-4 w-4" />
										Execution failed on-chain.
									</>
								) : (
									<>
										<Ban className="h-4 w-4" />
										Proposal cancelled.
									</>
								)}
							</div>
						)}
					</Card>
				</div>
			</div>
		</div>
	);
}
