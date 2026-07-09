// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { useQuery } from '@tanstack/react-query';
import {
	ArrowLeft,
	ShieldCheck,
	UploadCloud,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
	Link,
	useNavigate,
	useParams,
} from 'react-router-dom';

import { MoveArtifactInput } from '../components/MoveArtifactInput';
import {
	TransactionSecurityReview,
	type SimulationState,
} from '../components/TransactionSecurityReview';
import {
	Badge,
	Button,
	Card,
	Field,
	Input,
} from '../components/ui/kit';
import { WalSwapPanel } from '../components/WalSwapPanel';
import {
	useDryRun,
	useTransactionAnalysis,
} from '../hooks/analysis';
import { useCreateProposal } from '../hooks/proposals';
import { useArchiveToWalrus } from '../hooks/walrus';
import { attestationMessageBytes } from '../lib/attestation';
import type {
	BuildArtifact,
	ProjectSource,
} from '../lib/move';
import { buildPublishTransactionBytes } from '../lib/publishTx';
import { zipProjectSource } from '../lib/walrus';

export function PublishPackage() {
	const { address } = useParams<{ address: string }>();
	const navigate = useNavigate();
	const dappKit = useDAppKit();
	const client = dappKit.getClient();
	const network = useCurrentNetwork();
	const account = useCurrentAccount();
	const createProposal = useCreateProposal();
	const archive = useArchiveToWalrus();
	const analysis = useTransactionAnalysis();
	const dryRun = useDryRun();

	const [artifact, setArtifact] =
		useState<BuildArtifact | null>(null);
	const [source, setSource] =
		useState<ProjectSource | null>(null);
	const [toolchain, setToolchain] = useState('');
	const [gitRepo, setGitRepo] = useState('');
	const [gitCommit, setGitCommit] = useState('');
	const [description, setDescription] = useState('');

	// Build the publish tx as soon as an artifact is pasted, so the security
	// review can simulate/decode it before the proposal is created.
	const build = useQuery({
		queryKey: [
			'publish-build',
			address,
			artifact?.digest,
			artifact?.dependencies.join(','),
			artifact?.modules.length,
		],
		queryFn: () =>
			buildPublishTransactionBytes(
				client,
				address!,
				artifact!,
			),
		enabled: !!address && !!artifact,
		retry: false,
	});

	const bytes = build.data;
	useEffect(() => {
		if (!bytes) return;
		analysis.mutate(bytes);
		dryRun.mutate(bytes);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bytes]);

	const sim: SimulationState = {
		pending: dryRun.isPending,
		success: dryRun.isSuccess,
		errorMessage: dryRun.isError
			? (dryRun.error as Error).message
			: undefined,
		data: dryRun.data ?? null,
	};

	async function submit() {
		if (!address || !bytes || !artifact || !account) return;

		// Archive the source to Walrus at proposal time so reviewers can verify
		// (recompile → compare buildDigest) BEFORE signing. packageId/txDigest
		// are unknown pre-execution; the authoritative packageRecords row is
		// written on execution. Storage (WAL + gas) is paid by the proposer's
		// own wallet.
		let sourceBlobId: string | null = null;
		if (source && source.files.length > 0) {
			const res = await archive.mutateAsync({
				bytes: zipProjectSource(source.files),
				owner: account.address,
			});
			sourceBlobId = res.blobId;
		}

		// Attestation (attribution): bind source blob + build digest + tx digest
		// with the proposer's wallet, so reviewers can confirm who proposed what.
		let attestation: string | null = null;
		if (sourceBlobId && artifact.digest) {
			const txDigest =
				await Transaction.from(bytes).getDigest();
			const { signature } =
				await dappKit.signPersonalMessage({
					message: attestationMessageBytes(
						sourceBlobId,
						artifact.digest,
						txDigest,
					),
				});
			attestation = signature;
		}

		await createProposal.mutateAsync({
			multisigAddress: address,
			transactionBytes: bytes,
			description: description || 'Publish Move package',
			kind: 'publish',
			buildDigest: artifact.digest || null,
			sourceBlobId,
			toolchain: toolchain.trim() || null,
			gitRepo: gitRepo.trim() || null,
			gitCommit: gitCommit.trim() || null,
			attestation,
		});
		navigate(`/multisig/${address}/pending`);
	}

	return (
		<div className="space-y-6">
			<Link
				to={`/multisig/${address}`}
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" /> Back to multisig
			</Link>

			<div className="flex items-center justify-between gap-3">
				<div>
					<h1 className="font-display text-[22px] font-semibold tracking-tight">
						Publish Move package
					</h1>
					<p className="text-sm text-muted-foreground">
						Compile locally, then publish under this
						multisig. The transaction is frozen with the
						multisig as sender and posted as a proposal.
					</p>
				</div>
				<Link
					to={`/multisig/${address}/upgrade`}
					className="shrink-0 text-sm font-medium text-primary hover:underline"
				>
					Upgrade instead →
				</Link>
			</div>

			<Card className="space-y-5 p-5">
				<MoveArtifactInput
					onArtifact={setArtifact}
					onSource={setSource}
				/>

				<div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/[0.06] px-3.5 py-3">
					<ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-primary" />
					<p className="text-[12.5px] leading-relaxed text-muted-foreground">
						Publishing mints an{' '}
						<span className="font-medium text-foreground">
							UpgradeCap
						</span>{' '}
						and transfers it to this multisig, so every
						future upgrade needs the same threshold of
						signatures.
					</p>
				</div>

				<div className="rounded-lg border border-border bg-card/60 px-3.5 py-3 text-[12px] leading-relaxed text-muted-foreground">
					<span className="font-medium text-foreground">
						Before you submit — funding:
					</span>{' '}
					this multisig is the transaction sender, so{' '}
					<span className="font-medium text-foreground">
						it must hold some SUI
					</span>{' '}
					for gas. Archiving the source to Walrus also costs{' '}
					<span className="font-mono">WAL</span> + gas from{' '}
					<span className="font-medium text-foreground">
						your own wallet
					</span>{' '}
					(get WAL via the{' '}
					<span className="font-medium text-foreground">
						Swap
					</span>{' '}
					panel below).
				</div>

				<Field
					label="Toolchain (optional)"
					hint="The sui CLI version you built with (paste `sui --version`). Recorded so reviewers can reproduce the exact bytecode."
				>
					<Input
						value={toolchain}
						onChange={(e) => setToolchain(e.target.value)}
						placeholder="sui 1.x.y"
					/>
				</Field>

				<div className="grid grid-cols-2 gap-4">
					<Field
						label="Git repo (optional)"
						hint="Lets reviewers diff against history."
					>
						<Input
							value={gitRepo}
							onChange={(e) => setGitRepo(e.target.value)}
							placeholder="https://github.com/org/repo"
						/>
					</Field>
					<Field label="Git commit (optional)">
						<Input
							className="font-mono text-xs"
							value={gitCommit}
							spellCheck={false}
							onChange={(e) => setGitCommit(e.target.value)}
							placeholder="full commit hash"
						/>
					</Field>
				</div>

				<Field
					label="Description (optional)"
					hint="A note for the other signers. Off-chain only — not part of the signed transaction, never stored on-chain."
				>
					<Input
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Publish defi_core v1"
					/>
				</Field>

				<Button
					disabled={!bytes || !account}
					loading={
						build.isFetching ||
						archive.isPending ||
						createProposal.isPending
					}
					onClick={submit}
				>
					<UploadCloud className="h-4 w-4" />
					Build, sign &amp; propose
				</Button>
			</Card>

			<WalSwapPanel />

			{build.isError && (
				<Badge tone="danger">
					Could not build publish tx:{' '}
					{(build.error as Error).message}
				</Badge>
			)}

			{bytes && (
				<TransactionSecurityReview
					network={network}
					multisig={address!}
					transactionBytes={bytes}
					analysisData={analysis.data}
					analysisPending={analysis.isPending}
					sim={sim}
				/>
			)}
		</div>
	);
}
