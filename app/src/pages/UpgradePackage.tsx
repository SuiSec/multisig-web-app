// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpCircle } from 'lucide-react';
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
import {
	buildUpgradeTransactionBytes,
	UpgradePolicy,
	type UpgradePolicyValue,
} from '../lib/publishTx';
import { cn } from '../lib/utils';
import { zipProjectSource } from '../lib/walrus';

const POLICIES: {
	label: string;
	value: UpgradePolicyValue;
	hint: string;
}[] = [
	{
		label: 'Compatible',
		value: UpgradePolicy.Compatible,
		hint: 'Default — backward-compatible changes',
	},
	{
		label: 'Additive',
		value: UpgradePolicy.Additive,
		hint: 'Only add new functions/structs',
	},
	{
		label: 'Dep-only',
		value: UpgradePolicy.DepOnly,
		hint: 'Only change dependencies',
	},
];

export function UpgradePackage() {
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

	const [packageId, setPackageId] = useState('');
	const [upgradeCapId, setUpgradeCapId] = useState('');
	const [policy, setPolicy] = useState<UpgradePolicyValue>(
		UpgradePolicy.Compatible,
	);
	const [artifact, setArtifact] =
		useState<BuildArtifact | null>(null);
	const [source, setSource] =
		useState<ProjectSource | null>(null);
	const [toolchain, setToolchain] = useState('');
	const [gitRepo, setGitRepo] = useState('');
	const [gitCommit, setGitCommit] = useState('');
	const [description, setDescription] = useState('');

	const valid =
		!!address &&
		!!artifact &&
		!!artifact.digest &&
		isValidSuiAddress(packageId) &&
		isValidSuiAddress(upgradeCapId);

	// Build the upgrade tx (authorize → upgrade → commit) as soon as the inputs
	// are valid, so the security review can decode/simulate it.
	const build = useQuery({
		queryKey: [
			'upgrade-build',
			address,
			packageId,
			upgradeCapId,
			policy,
			artifact?.digest,
			artifact?.dependencies.join(','),
			artifact?.modules.length,
		],
		queryFn: () =>
			buildUpgradeTransactionBytes(client, address!, {
				packageId,
				upgradeCapId,
				policy,
				artifact: artifact!,
			}),
		enabled: valid,
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

		// Archive source at proposal time (with packageId known, since this is an
		// upgrade) so reviewers can diff against the live package + recompile to
		// the buildDigest before signing. Storage (WAL + gas) is paid by the
		// proposer's own wallet.
		let sourceBlobId: string | null = null;
		if (source && source.files.length > 0) {
			const res = await archive.mutateAsync({
				bytes: zipProjectSource(source.files),
				owner: account.address,
			});
			sourceBlobId = res.blobId;
		}

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
			description:
				description || `Upgrade ${packageId.slice(0, 10)}…`,
			kind: 'upgrade',
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
				to={`/multisig/${address}/publish`}
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" /> Back to publish
			</Link>

			<div>
				<h1 className="font-display text-[22px] font-semibold tracking-tight">
					Upgrade Move package
				</h1>
				<p className="text-sm text-muted-foreground">
					Authorize → upgrade → commit, using the UpgradeCap
					held by this multisig.
				</p>
			</div>

			<Card className="space-y-5 p-5">
				<Field label="Package ID">
					<Input
						className="font-mono text-xs"
						value={packageId}
						autoComplete="off"
						spellCheck={false}
						onChange={(e) => setPackageId(e.target.value)}
						placeholder="0x… (the package to upgrade)"
					/>
				</Field>
				<Field
					label="UpgradeCap object ID"
					hint="The UpgradeCap owned by this multisig"
				>
					<Input
						className="font-mono text-xs"
						value={upgradeCapId}
						autoComplete="off"
						spellCheck={false}
						onChange={(e) =>
							setUpgradeCapId(e.target.value)
						}
						placeholder="0x…"
					/>
				</Field>

				<Field label="Upgrade policy">
					<div className="grid grid-cols-3 gap-2">
						{POLICIES.map((p) => (
							<button
								key={p.value}
								type="button"
								onClick={() => setPolicy(p.value)}
								title={p.hint}
								className={cn(
									'rounded-lg border px-3 py-2.5 text-sm font-semibold transition',
									policy === p.value
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border bg-field text-muted-foreground hover:bg-accent',
								)}
							>
								{p.label}
							</button>
						))}
					</div>
				</Field>

				<MoveArtifactInput
					onArtifact={setArtifact}
					onSource={setSource}
				/>

				<div className="rounded-lg border border-border bg-card/60 px-3.5 py-3 text-[12px] leading-relaxed text-muted-foreground">
					<span className="font-medium text-foreground">
						Before you submit:
					</span>{' '}
					use the{' '}
					<span className="font-medium text-foreground">
						UpgradeCap this multisig owns
					</span>
					, and make sure the multisig holds some{' '}
					<span className="font-medium text-foreground">
						SUI
					</span>{' '}
					for gas (it’s the sender). Archiving to Walrus
					also costs <span className="font-mono">WAL</span>{' '}
					+ gas from your own wallet (get WAL via the{' '}
					<span className="font-medium text-foreground">
						Swap
					</span>{' '}
					panel below). Rebuild the artifact with the same{' '}
					<span className="font-mono">sui</span> version the
					package was published with.
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
						hint="Lets reviewers diff against the previous version."
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
						placeholder="Upgrade defi_core to v4"
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
					<ArrowUpCircle className="h-4 w-4" />
					Build, sign &amp; propose
				</Button>
			</Card>

			<WalSwapPanel />

			{build.isError && (
				<Badge tone="danger">
					Could not build upgrade tx:{' '}
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
