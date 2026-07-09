// SPDX-License-Identifier: Apache-2.0
// Public, no-login verification view for a published/upgraded Move package.
// The source folder is archived to Walrus as a .zip: this page downloads it,
// unzips it in-browser to a browsable file tree (with the whole project as a
// one-click .zip download), and shows the recorded build digest for reviewers
// to reproduce against the on-chain package.

import { formatAddress } from '@mysten/sui/utils';
import {
	Download,
	ExternalLink,
	Loader2,
	ShieldAlert,
	ShieldCheck,
	Terminal,
} from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
	useParams,
	useSearchParams,
} from 'react-router-dom';

import { SourceArchiveBrowser } from '../components/SourceArchiveBrowser';
import {
	Badge,
	Card,
	ErrorState,
	Spinner,
} from '../components/ui/kit';
import {
	usePackageAnchor,
	usePackageRecords,
} from '../hooks/packages';
import {
	explorerAddressUrl,
	explorerPackageUrl,
	explorerTxUrl,
	type Network,
} from '../lib/constants';
import {
	downloadSourceZip,
	walrusBlobUrl,
} from '../lib/walrus';

export function PackageVerification() {
	const { packageId } = useParams<{ packageId: string }>();
	const [params] = useSearchParams();
	const network = params.get('network') ?? undefined;

	const records = usePackageRecords(packageId, network);
	const record = records.data?.[0];
	// The real trust check: re-derive provenance from the chain, not the relay.
	const anchor = usePackageAnchor(record);
	const net = network ?? record?.network ?? 'testnet';
	const [downloading, setDownloading] = useState(false);

	async function download() {
		if (!record) return;
		setDownloading(true);
		try {
			await downloadSourceZip(net, record.blobId);
		} finally {
			setDownloading(false);
		}
	}

	if (records.isError)
		return (
			<ErrorState
				title="Lookup failed"
				message={(records.error as Error).message}
			/>
		);
	if (records.isLoading)
		return <Spinner label="Looking up package…" />;
	if (!record)
		return (
			<ErrorState
				title="No verification record"
				message={`No archived record for ${packageId}. The publisher may not have archived its source yet.`}
			/>
		);

	const zipUrl = walrusBlobUrl(net, record.blobId);

	// Trust signals gate on the chain anchor, never the relay's word. Treat a
	// thrown query error (tx not found / RPC failure) the same as a failed check.
	const anchorPending = anchor.isLoading;
	const anchored = anchor.data?.ok === true;
	const anchorReason =
		anchor.data?.reason ??
		(anchor.error as Error | undefined)?.message ??
		'Could not verify this record against the chain.';

	const shortId = formatAddress(record.packageId);
	const shortAddr = formatAddress(record.multisigAddress);
	const packageTitle = record.name
		? `${record.name} — Verified Sui Move Package`
		: `Package ${shortId} — Verification`;

	return (
		<div className="space-y-6">
			<Helmet>
				<title>{packageTitle} | MultiSig</title>
				<meta
					name="description"
					content={`Source code verification for Sui Move package ${record.packageId} on ${net}. ${anchored ? 'Chain-verified: source is anchored to the on-chain publish transaction.' : 'Source archived on Walrus.'} Published by ${shortAddr}.`}
				/>
				<link
					rel="canonical"
					href={`https://multisig.suisec.app/package/${record.packageId}`}
				/>
				<script type="application/ld+json">
					{JSON.stringify({
						'@context': 'https://schema.org',
						'@type': 'SoftwareSourceCode',
						name:
							record.name ??
							`Sui Move Package ${record.packageId}`,
						identifier: record.packageId,
						runtimePlatform: 'Sui blockchain',
						programmingLanguage: 'Move',
						url: `https://multisig.suisec.app/package/${record.packageId}`,
					})}
				</script>
			</Helmet>
			{/* Hero */}
			<Card className="flex items-center gap-4 bg-gradient-to-r from-primary/[0.06] to-transparent p-5">
				<div
					className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl text-white ${
						anchored
							? 'bg-success'
							: anchorPending
								? 'bg-muted-foreground'
								: 'bg-destructive'
					}`}
				>
					{anchored ? (
						<ShieldCheck className="h-7 w-7" />
					) : anchorPending ? (
						<Loader2 className="h-7 w-7 animate-spin" />
					) : (
						<ShieldAlert className="h-7 w-7" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="font-display text-lg font-semibold">
							{record.name || 'Move package'}
						</span>
						{anchored ? (
							<Badge tone="ok" dot>
								chain-verified
							</Badge>
						) : anchorPending ? (
							<Badge tone="muted">verifying…</Badge>
						) : (
							<Badge tone="danger" dot>
								unverified
							</Badge>
						)}
					</div>
					<a
						href={explorerPackageUrl(
							record.packageId,
							net as Network,
						)}
						target="_blank"
						rel="noreferrer"
						className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary hover:underline"
					>
						{record.packageId}
						<ExternalLink className="h-3 w-3" />
					</a>
					<div className="mt-0.5 text-xs text-muted-foreground">
						{net}
						{record.version != null
							? ` · v${record.version}`
							: ''}
					</div>
				</div>
				<button
					type="button"
					onClick={download}
					disabled={downloading}
					className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground transition hover:border-primary/60 hover:bg-accent disabled:opacity-60"
				>
					<Download className="h-4 w-4" />
					{downloading
						? 'Downloading…'
						: 'Download source .zip'}
				</button>
			</Card>

			{/* On-chain anchor verdict — the relay's record is only trustworthy
			    insofar as the chain confirms its (multisig, package, tx) triple. */}
			{!anchorPending && !anchored && (
				<Card className="flex items-start gap-2 border-destructive/40 bg-destructive/[0.07] p-4 text-[13px] text-foreground">
					<ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-destructive" />
					<span>
						<span className="font-semibold text-destructive">
							Not anchored to chain.
						</span>{' '}
						{anchorReason} Treat the publisher, source
						archive, and build digest below as{' '}
						<span className="font-semibold">
							relay-claimed and unverified
						</span>{' '}
						until you reproduce them against the on-chain
						package yourself.
					</span>
				</Card>
			)}

			<div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
				{/* Left: build digest + reproduce */}
				<div className="space-y-6">
					<Card className="p-5">
						<div className="mb-2 flex items-center gap-2">
							{anchored ? (
								<ShieldCheck className="h-4 w-4 text-success" />
							) : (
								<ShieldAlert className="h-4 w-4 text-muted-foreground" />
							)}
							<h3 className="text-sm font-semibold">
								Recorded build digest
							</h3>
						</div>
						<p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
							The digest the publisher recorded for this
							package. Reproduce it from the archived source
							(right) with the matching toolchain and
							compare against the on-chain package.
						</p>
						<pre className="overflow-auto rounded-lg border border-border bg-field px-3.5 py-3 font-mono text-[11.5px] text-foreground">
							{record.buildDigest || '— (not recorded)'}
						</pre>
					</Card>

					<Card className="p-5">
						<div className="mb-2 flex items-center gap-2">
							<Terminal className="h-4 w-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold">
								Reproduce from source
							</h3>
							<Badge tone="muted">optional</Badge>
						</div>
						<p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
							Download &amp; unzip the source, then rebuild
							with the matching Sui toolchain and confirm
							the digest matches.
						</p>
						<pre className="overflow-auto rounded-lg border border-border bg-field px-3.5 py-3 font-mono text-[11.5px] text-foreground">
							sui move build --dump-bytecode-as-base64
						</pre>
					</Card>
				</div>

				{/* Right: provenance + browsable source tree */}
				<div className="space-y-6">
					<Card className="p-5">
						<h3 className="mb-3 text-sm font-semibold">
							Provenance
						</h3>
						<div className="space-y-2">
							<Row
								label={
									anchored
										? 'Published by'
										: 'Published by (relay-claimed)'
								}
							>
								<a
									href={explorerAddressUrl(
										record.multisigAddress,
										net as Network,
									)}
									target="_blank"
									rel="noreferrer"
									className={`inline-flex items-center gap-1 font-mono text-xs hover:underline ${
										anchored
											? 'text-primary'
											: 'text-muted-foreground'
									}`}
								>
									{formatAddress(record.multisigAddress)}
									<ExternalLink className="h-3 w-3" />
								</a>
							</Row>
							<Row label="Publish tx">
								<a
									href={explorerTxUrl(
										record.txDigest,
										net as Network,
									)}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
								>
									{formatAddress(record.txDigest)}
									<ExternalLink className="h-3 w-3" />
								</a>
							</Row>
							<Row label="Source .zip (Walrus)">
								<a
									href={zipUrl}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
								>
									{formatAddress(record.blobId)}
									<ExternalLink className="h-3 w-3" />
								</a>
							</Row>
						</div>
					</Card>

					<Card className="p-5">
						<SourceArchiveBrowser
							network={net}
							blobId={record.blobId}
						/>
					</Card>
				</div>
			</div>
		</div>
	);
}

function Row({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-3 text-[13px]">
			<span className="text-muted-foreground">{label}</span>
			{children}
		</div>
	);
}
