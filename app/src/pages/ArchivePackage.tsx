// SPDX-License-Identifier: Apache-2.0
// Post-execution: archive a published/upgraded package's source to Walrus and
// bind packageId → blobId in the relay so it becomes verifiable. The proposer
// uploads from their own wallet (public data; no multisig signing needed).

import {
	useCurrentAccount,
	useCurrentNetwork,
} from '@mysten/dapp-kit-react';
import { isValidSuiAddress } from '@mysten/sui/utils';
import { Archive, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import {
	Link,
	useNavigate,
	useParams,
} from 'react-router-dom';

import { MoveArtifactInput } from '../components/MoveArtifactInput';
import {
	Button,
	Card,
	Field,
	Input,
} from '../components/ui/kit';
import { WalSwapPanel } from '../components/WalSwapPanel';
import { useRecordPackage } from '../hooks/packages';
import { useArchiveToWalrus } from '../hooks/walrus';
import type {
	BuildArtifact,
	ProjectSource,
} from '../lib/move';
import { zipProjectSource } from '../lib/walrus';

export function ArchivePackage() {
	const { address } = useParams<{ address: string }>();
	const navigate = useNavigate();
	const network = useCurrentNetwork();
	const account = useCurrentAccount();
	const archive = useArchiveToWalrus();
	const record = useRecordPackage();

	const [packageId, setPackageId] = useState('');
	const [txDigest, setTxDigest] = useState('');
	const [name, setName] = useState('');
	const [version, setVersion] = useState('');
	const [artifact, setArtifact] =
		useState<BuildArtifact | null>(null);
	const [source, setSource] =
		useState<ProjectSource | null>(null);

	const valid =
		!!address &&
		!!account &&
		!!artifact &&
		isValidSuiAddress(packageId) &&
		txDigest.trim().length > 0;

	const busy = archive.isPending || record.isPending;

	async function submit() {
		if (!address || !account || !artifact) return;
		const { blobId } = await archive.mutateAsync({
			bytes: zipProjectSource(source?.files ?? []),
			owner: account.address,
		});
		await record.mutateAsync({
			packageId,
			network,
			multisigAddress: address,
			blobId,
			buildDigest: artifact.digest || null,
			txDigest: txDigest.trim(),
			name: name.trim() || source?.packageName || null,
			version: version ? Number(version) : null,
		});
		navigate(`/package/${packageId}?network=${network}`);
	}

	return (
		<div className="space-y-6">
			<Link
				to={`/multisig/${address}/contracts`}
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" /> Back to contracts
			</Link>

			<div>
				<h1 className="font-display text-[22px] font-semibold tracking-tight">
					Archive &amp; verify
				</h1>
				<p className="text-sm text-muted-foreground">
					After a publish/upgrade executes, upload its
					source to Walrus and bind it to the on-chain
					package id. Your wallet pays the WAL storage fee.
				</p>
			</div>

			<Card className="space-y-5 p-5">
				<Field
					label="Package ID"
					hint="From the executed publish/upgrade"
				>
					<Input
						className="font-mono text-xs"
						value={packageId}
						spellCheck={false}
						onChange={(e) => setPackageId(e.target.value)}
						placeholder="0x…"
					/>
				</Field>
				<Field label="Publish/upgrade tx digest">
					<Input
						className="font-mono text-xs"
						value={txDigest}
						spellCheck={false}
						onChange={(e) => setTxDigest(e.target.value)}
						placeholder="e.g. 7Hn4…"
					/>
				</Field>
				<div className="grid grid-cols-2 gap-4">
					<Field label="Name (optional)">
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="defi_core"
						/>
					</Field>
					<Field label="Version (optional)">
						<Input
							type="number"
							value={version}
							onChange={(e) => setVersion(e.target.value)}
							placeholder="1"
						/>
					</Field>
				</div>

				<MoveArtifactInput
					onArtifact={setArtifact}
					onSource={setSource}
				/>

				<div className="flex items-center justify-end gap-3">
					<Button
						disabled={!valid}
						loading={busy}
						onClick={submit}
					>
						<Archive className="h-4 w-4" />
						Upload to Walrus &amp; record
					</Button>
				</div>
			</Card>

			<WalSwapPanel />
		</div>
	);
}
