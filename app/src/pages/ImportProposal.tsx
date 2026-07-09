// SPDX-License-Identifier: Apache-2.0
// Import a raw, fully-built Sui transaction (base64 TransactionData) as a
// proposal — for multisig transactions that can't be assembled in the web app
// (complex PTBs built via the CLI / a script). The user pastes the transaction
// bytes; we run the same WYSIWYS security review (dry-run + analysis) as every
// other signing surface BEFORE asking the wallet to sign, then post it as a
// proposal for the other members to co-sign.
//
// Mirrors the relay's `validateProposedTransaction` checks client-side so the
// user gets immediate feedback instead of a round-trip rejection:
//   1. parses as a transaction,
//   2. is fully resolved,
//   3. sender === this multisig address.

import { useCurrentNetwork } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import {
	formatAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import {
	ArrowLeft,
	FileSignature,
	Loader2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
	Link,
	useNavigate,
	useParams,
} from 'react-router-dom';

import {
	TransactionSecurityReview,
	type SimulationState,
} from '../components/TransactionSecurityReview';
import {
	Button,
	Card,
	Field,
	Input,
} from '../components/ui/kit';
import {
	useDryRun,
	useTransactionAnalysis,
} from '../hooks/analysis';
import { useCreateProposal } from '../hooks/proposals';

type Parsed =
	| {
			ok: true;
			bytes: string;
			sender: string;
			commands: number;
	  }
	| { ok: false; error: string };

// Strip whitespace/newlines the CLI may wrap base64 output with, then mirror
// the relay's validation so the wallet is only ever asked to sign a tx that
// will actually be accepted.
function parseBytes(
	raw: string,
	address: string,
): Parsed | null {
	const bytes = raw.replace(/\s+/g, '');
	if (!bytes) return null;

	let tx: Transaction;
	try {
		tx = Transaction.from(bytes);
	} catch {
		return {
			ok: false,
			error:
				'Could not parse — expected base64 BCS transaction bytes (a fully-built TransactionData, e.g. from `sui client … --serialize-unsigned-transaction`).',
		};
	}

	const data = tx.getData();

	if (!tx.isFullyResolved())
		return {
			ok: false,
			error:
				'Transaction is not fully resolved. Build it with the multisig as sender and gas selected (the serialized-unsigned-transaction output), not a bare TransactionKind.',
		};

	if (!data.sender)
		return {
			ok: false,
			error: 'Transaction has no sender set.',
		};

	if (
		normalizeSuiAddress(data.sender) !==
		normalizeSuiAddress(address)
	)
		return {
			ok: false,
			error: `Sender must be this multisig (${formatAddress(
				address,
			)}), but the transaction's sender is ${formatAddress(
				data.sender,
			)}.`,
		};

	return {
		ok: true,
		bytes,
		sender: data.sender,
		commands: data.commands.length,
	};
}

export function ImportProposal() {
	const { address } = useParams<{ address: string }>();
	const navigate = useNavigate();
	const network = useCurrentNetwork();

	const analysis = useTransactionAnalysis();
	const dryRun = useDryRun();
	const createProposal = useCreateProposal();

	const [bytes, setBytes] = useState('');
	const [description, setDescription] = useState('');

	const parsed = useMemo(
		() => (address ? parseBytes(bytes, address) : null),
		[bytes, address],
	);
	const okBytes = parsed?.ok ? parsed.bytes : null;

	// Auto-run the security review (dry-run + analysis) as soon as the pasted
	// bytes parse and target this multisig — same WYSIWYS surface as Capture /
	// the proposal detail page. Re-runs whenever the valid bytes change; clears
	// stale results when the input becomes empty/invalid.
	useEffect(() => {
		if (!okBytes) {
			analysis.reset();
			dryRun.reset();
			return;
		}
		analysis.mutate(okBytes);
		dryRun.mutate(okBytes);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [okBytes]);

	const simulating = dryRun.isPending || analysis.isPending;
	const reviewReady =
		dryRun.isSuccess && analysis.isSuccess;
	const canPropose = !!okBytes && reviewReady;

	const sim: SimulationState = {
		pending: dryRun.isPending,
		success: dryRun.isSuccess,
		errorMessage: dryRun.isError
			? (dryRun.error as Error).message
			: undefined,
		data: dryRun.data ?? null,
	};

	async function submit() {
		if (!address || !okBytes || !canPropose) return;
		await createProposal.mutateAsync({
			multisigAddress: address,
			transactionBytes: okBytes,
			description: description.trim() || undefined,
		});
		navigate(`/multisig/${address}/pending`);
	}

	return (
		<div className="space-y-6">
			<Link
				to={`/multisig/${address}`}
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" /> Back to overview
			</Link>

			<div>
				<h1 className="font-display text-[22px] font-semibold tracking-tight">
					Import transaction
				</h1>
				<p className="text-sm text-muted-foreground">
					Paste a fully-built Sui transaction whose sender
					is this multisig. It's simulated and analyzed
					first; then your connected wallet signs the exact
					bytes and it's posted as a proposal for the other
					members to approve. Use this for transactions that
					can't be assembled in the app — e.g. complex PTBs
					built with the Sui CLI.
				</p>
			</div>

			<Card className="space-y-5 p-5">
				<Field
					label="Transaction bytes (base64)"
					hint="The serialized, fully-resolved transaction — e.g. the output of `sui client … --serialize-unsigned-transaction`. Whitespace is ignored."
				>
					<textarea
						className="h-40 w-full resize-y rounded-lg border border-border bg-field px-3.5 py-3 font-mono text-xs outline-none transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
						value={bytes}
						autoComplete="off"
						autoCorrect="off"
						spellCheck={false}
						onChange={(e) => setBytes(e.target.value)}
						placeholder="AAAB…"
					/>
				</Field>

				{parsed && !parsed.ok && (
					<p className="text-[13px] text-destructive">
						{parsed.error}
					</p>
				)}

				{parsed?.ok && (
					<div className="rounded-lg border border-border bg-field px-3.5 py-3 text-xs">
						<div className="flex justify-between gap-4">
							<span className="text-muted-foreground">
								Sender
							</span>
							<span className="font-mono">
								{formatAddress(parsed.sender)}
							</span>
						</div>
						<div className="mt-1.5 flex justify-between gap-4">
							<span className="text-muted-foreground">
								Commands
							</span>
							<span className="font-mono">
								{parsed.commands}
							</span>
						</div>
					</div>
				)}

				<Field
					label="Description (optional)"
					hint="A note for the other signers so they can recognize this proposal. Off-chain only — it is not part of the signed transaction and is never stored on-chain."
				>
					<Input
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="e.g. Rotate admin cap — built via CLI, see #ops"
					/>
				</Field>
			</Card>

			{/* Pre-sign security review — same surface every member sees. */}
			{okBytes && simulating && (
				<div className="flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/[0.06] px-4 py-3 text-sm text-foreground">
					<Loader2 className="h-4 w-4 flex-none animate-spin text-primary" />
					<span>
						Simulating transaction… reviewing balance
						changes and checking it would succeed. This
						isn't an error — please wait.
					</span>
				</div>
			)}

			{okBytes && (
				<TransactionSecurityReview
					network={network}
					multisig={address!}
					transactionBytes={okBytes}
					analysisData={analysis.data}
					analysisPending={analysis.isPending}
					sim={sim}
				/>
			)}

			<div className="flex items-center gap-3">
				<Button
					disabled={!canPropose}
					loading={createProposal.isPending}
					onClick={submit}
				>
					<FileSignature className="h-4 w-4" />
					Sign &amp; propose
				</Button>
				{okBytes && !reviewReady && (
					<span className="text-xs text-muted-foreground">
						{simulating
							? 'Simulating…'
							: dryRun.isError
								? 'Simulation failed — signing is disabled (see the review above).'
								: 'Waiting for simulation to finish.'}
					</span>
				)}
			</div>
		</div>
	);
}
