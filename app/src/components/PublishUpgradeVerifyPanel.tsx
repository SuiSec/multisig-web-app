// SPDX-License-Identifier: Apache-2.0
// Pre-sign verification panel for publish/upgrade proposals. The relay is
// zero-trust: it cannot prove the opaque bytecode in the tx came from any
// particular source. The only meaningful check is LOCAL — recompile the source
// and confirm its digest equals the buildDigest the proposer claims (which is
// the same bytes you're signing). This panel surfaces the claimed values and a
// copy-paste command; the green check only ever comes from the signer's own run.

import type { PublicProposal } from '@mysten/sagat';
import { Transaction } from '@mysten/sui/transactions';
import {
	formatAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';
import { useQuery } from '@tanstack/react-query';
import {
	BadgeCheck,
	Check,
	Copy,
	ExternalLink,
	FileCode2,
	ShieldAlert,
	ShieldQuestion,
	TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';

import { usePackageAnchor } from '../hooks/packages';
import { apiClient } from '../lib/api';
import { verifyAttestation } from '../lib/attestation';
import { memberAddress } from '../lib/multisig';
import { walrusBlobUrl } from '../lib/walrus';
import { SourceArchiveBrowser } from './SourceArchiveBrowser';
import { Card } from './ui/kit';

function shortDigest(d: string): string {
	return d.length > 20
		? `${d.slice(0, 12)}…${d.slice(-6)}`
		: d;
}

/** The package being upgraded (decoded from the tx); null for publish. */
function upgradedPackageId(
	p: PublicProposal,
): string | null {
	if (p.kind !== 'upgrade') return null;
	try {
		const data = Transaction.from(
			p.transactionBytes,
		).getData();
		const cmd = data.commands.find(
			(c) => c.$kind === 'Upgrade',
		);
		return cmd && 'Upgrade' in cmd
			? cmd.Upgrade.package
			: null;
	} catch {
		return null;
	}
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
			className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-accent"
		>
			{copied ? (
				<Check className="h-3 w-3 text-success" />
			) : (
				<Copy className="h-3 w-3" />
			)}
			{copied ? 'Copied' : 'Copy'}
		</button>
	);
}

// A user may paste a GitHub/GitLab *web* URL that points at a branch and a
// subdirectory (e.g. `https://github.com/org/repo/tree/main/pkg`). That form is
// not cloneable, and the package's Move.toml lives in the subdirectory — so the
// build has to `cd` into it. Normalize whatever was entered into the three
// pieces the verify script actually needs.
function parseGitRepo(raw: string): {
	cloneUrl: string;
	branch: string;
	subdir: string;
} {
	const url = raw.trim().replace(/\/+$/, '');
	// `…/repo[.git][/-]/(tree|blob|src)/<branch>[/<subdir…>]`
	// (the optional `/-` segment is GitLab's separator).
	const m = url.match(
		/^(https?:\/\/[^/]+\/[^/]+\/[^/]+?)(?:\.git)?(?:\/-)?\/(?:tree|blob|src)\/([^/]+)(?:\/(.+))?$/,
	);
	if (m) {
		return {
			cloneUrl: m[1],
			branch: m[2],
			subdir: m[3] ?? '',
		};
	}
	return { cloneUrl: url, branch: 'main', subdir: '' };
}

function buildVerifyScript(
	p: PublicProposal,
	baselineCommit: string | null,
): string {
	const digest =
		p.buildDigest ?? '<no buildDigest on proposal>';
	const lines: string[] = [
		'# Verify LOCALLY — the relay is untrusted; this check is the real one.',
	];
	if (p.gitRepo && p.gitCommit) {
		const { cloneUrl, branch, subdir } = parseGitRepo(
			p.gitRepo,
		);
		lines.push(
			`git clone ${cloneUrl} pkg && cd pkg && git fetch`,
			`git merge-base --is-ancestor ${p.gitCommit} origin/${branch} || echo "WARN: commit not on ${branch}"`,
			`git verify-commit ${p.gitCommit} || echo "WARN: commit not signed"`,
			`git checkout ${p.gitCommit}`,
		);
		if (subdir) {
			lines.push(
				`cd ${subdir}   # package root (Move.toml lives here)`,
			);
		}
	} else if (p.sourceBlobId) {
		lines.push(
			'# Source archived to Walrus as a .zip (Move.toml + Move.lock + sources/):',
			`curl -s "${walrusBlobUrl(p.network, p.sourceBlobId)}" -o source.zip`,
			'unzip -o source.zip -d pkg && cd pkg',
		);
	} else {
		lines.push(
			'# No source provided — obtain the package source out-of-band.',
		);
	}
	lines.push(
		'# `sui` emits .digest as a byte array; normalise to base64 like the app does.',
		'BUILD_JSON="$(sui move build --dump-bytecode-as-base64)"',
		'if [ "$(jq -r \'.digest | type\' <<<"$BUILD_JSON")" = array ]; then',
		'  LOCAL_DIGEST="$(jq -r \'.digest[]\' <<<"$BUILD_JSON" \\',
		'    | while read -r n; do printf "\\\\$(printf \'%03o\' "$n")"; done | base64 | tr -d \'\\n\')"',
		'else',
		'  LOCAL_DIGEST="$(jq -r \'.digest\' <<<"$BUILD_JSON")"',
		'fi',
		`test "$LOCAL_DIGEST" = "${digest}" \\`,
		'  && echo "✓ digest matches — source == the bytecode you are signing" \\',
		'  || { echo "✗ MISMATCH — DO NOT SIGN"; }',
	);
	if (p.kind === 'upgrade') {
		const prev = baselineCommit ?? '<prev-commit>';
		lines.push(
			'# Upgrade: anchor the PREVIOUS source to the live on-chain package,',
			'# then diff to see exactly what changed:',
			'sui client verify-source --path ../prev   # baseline == on-chain bytecode',
			`git diff ${prev}..${p.gitCommit ?? '<this-commit>'} -- sources/`,
		);
	}
	return lines.join('\n');
}

function safeAddr(pk: string): string {
	try {
		return memberAddress(pk);
	} catch {
		return pk;
	}
}

export function PublishUpgradeVerifyPanel({
	proposal,
}: {
	proposal: PublicProposal;
}) {
	const isPkg =
		proposal.kind === 'publish' ||
		proposal.kind === 'upgrade';

	// Verify the proposer attestation against their address (client-side).
	const attest = useQuery({
		queryKey: ['attestation', proposal.digest],
		queryFn: () =>
			verifyAttestation({
				attestation: proposal.attestation,
				sourceBlobId: proposal.sourceBlobId,
				buildDigest: proposal.buildDigest,
				digest: proposal.digest,
				proposerAddress: proposal.proposerAddress,
			}),
		enabled: isPkg,
	});

	// Baseline (upgrade only): is there a verified record for the live package?
	const pkgId = upgradedPackageId(proposal);
	const baseline = useQuery({
		queryKey: ['baseline', pkgId, proposal.network],
		queryFn: () =>
			apiClient.getPackageRecords(pkgId!, proposal.network),
		enabled: !!pkgId,
	});
	const baselineRecord = baseline.data?.find(
		(r) => !!r.blobId,
	);
	// Anchor the baseline to chain too. A forged baseline would steer the signer
	// to diff against an attacker-chosen commit ("look, only a tiny change"), so
	// trust it ONLY if the chain confirms its provenance AND it is the package
	// actually being upgraded.
	const baselineAnchor = usePackageAnchor(baselineRecord);

	if (!isPkg) return null;

	const baselineAnchored =
		baselineAnchor.data?.ok === true &&
		!!baselineRecord &&
		!!pkgId &&
		normalizeSuiAddress(baselineRecord.packageId) ===
			normalizeSuiAddress(pkgId);

	const script = buildVerifyScript(
		proposal,
		baselineAnchored
			? (baselineRecord?.gitCommit ?? null)
			: null,
	);

	return (
		<Card className="space-y-4 p-6">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<ShieldQuestion className="h-4 w-4 text-primary" />
					<span className="text-sm font-semibold">
						{proposal.kind === 'publish'
							? 'Publish'
							: 'Upgrade'}{' '}
						verification
					</span>
				</div>
				<AttestationBadge state={attest.data} />
			</div>

			<p className="text-[12.5px] leading-relaxed text-muted-foreground">
				This proposal {proposal.kind}es a Move package. The
				transaction carries compiled bytecode — you can’t
				read it. Verify on your own machine that the source
				below recompiles to the claimed digest (which is the
				bytecode you’re signing). The relay can’t prove this
				for you.
			</p>

			{/* Claimed values */}
			<div className="space-y-2 rounded-lg border border-border bg-field p-4 text-[12px]">
				<div className="flex items-center justify-between gap-3">
					<span className="text-faint">Build digest</span>
					<span className="font-mono text-foreground">
						{proposal.buildDigest
							? shortDigest(proposal.buildDigest)
							: '— (not provided)'}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-faint">Toolchain</span>
					<span className="font-mono text-foreground">
						{proposal.toolchain || '— (not provided)'}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-faint">Source archive</span>
					{proposal.sourceBlobId ? (
						<a
							href={walrusBlobUrl(
								proposal.network,
								proposal.sourceBlobId,
							)}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
						>
							<FileCode2 className="h-3 w-3" />
							Source .zip
							<ExternalLink className="h-3 w-3" />
						</a>
					) : (
						<span className="text-faint">
							— (not uploaded)
						</span>
					)}
				</div>
				{proposal.gitRepo && (
					<div className="flex items-center justify-between gap-3">
						<span className="text-faint">Git</span>
						<span className="font-mono text-foreground">
							{proposal.gitRepo}
							{proposal.gitCommit
								? `@${proposal.gitCommit.slice(0, 10)}`
								: ''}
						</span>
					</div>
				)}
			</div>

			{/* Browse the archived source folder in-browser (no local unzip). */}
			{proposal.sourceBlobId && (
				<div className="rounded-lg border border-border bg-field/40 p-4">
					<SourceArchiveBrowser
						network={proposal.network}
						blobId={proposal.sourceBlobId}
					/>
				</div>
			)}

			{/* Baseline (upgrade only): chain-anchored, loud-degrade if missing. */}
			{proposal.kind === 'upgrade' && (
				<BaselineNotice
					pending={
						(baseline.isLoading ||
							baselineAnchor.isLoading) &&
						!!pkgId
					}
					hasPkgId={!!pkgId}
					record={
						baselineAnchored ? baselineRecord : undefined
					}
				/>
			)}

			{/* Verify command */}
			<div>
				<div className="mb-2 flex items-center justify-between">
					<span className="text-[11px] font-semibold uppercase tracking-[1px] text-faint">
						Run locally to verify
					</span>
					<CopyButton text={script} />
				</div>
				<pre className="max-h-64 overflow-auto rounded-lg border border-border bg-field p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
					{script}
				</pre>
			</div>

			{/* Per-signer attestation (self-reported; relay does not verify) */}
			{proposal.signatures.length > 0 && (
				<div>
					<div className="mb-2 text-[11px] font-semibold uppercase tracking-[1px] text-faint">
						Signer attestations
					</div>
					<div className="space-y-1.5">
						{proposal.signatures.map((s) => (
							<div
								key={s.publicKey}
								className="flex items-center justify-between gap-3 text-[12px]"
							>
								<span className="font-mono text-foreground">
									{formatAddress(safeAddr(s.publicKey))}
								</span>
								<span className="flex gap-1.5">
									<AttestBadge
										on={s.reproduced}
										label="reproduced digest"
									/>
									<AttestBadge
										on={s.reviewedDiff}
										label="read diff"
									/>
								</span>
							</div>
						))}
					</div>
				</div>
			)}
		</Card>
	);
}

function AttestationBadge({
	state,
}: {
	state: 'valid' | 'invalid' | 'none' | undefined;
}) {
	if (state === 'valid')
		return (
			<span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-[11px] font-medium text-success">
				<BadgeCheck className="h-3 w-3" />
				proposer attestation
			</span>
		);
	if (state === 'invalid')
		return (
			<span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
				<ShieldAlert className="h-3 w-3" />
				attestation INVALID
			</span>
		);
	return null;
}

function BaselineNotice({
	pending,
	hasPkgId,
	record,
}: {
	pending: boolean;
	hasPkgId: boolean;
	record:
		| {
				blobId: string;
				gitCommit: string | null;
				version: number | null;
		  }
		| undefined;
}) {
	if (pending)
		return (
			<div className="rounded-lg border border-border bg-field px-3.5 py-2.5 text-[12px] text-muted-foreground">
				Checking for a verified baseline of the live
				package…
			</div>
		);
	if (record)
		return (
			<div className="rounded-lg border border-success/30 bg-success/[0.07] px-3.5 py-2.5 text-[12px] text-foreground">
				<span className="font-semibold text-success">
					Chain-anchored baseline
				</span>{' '}
				for the live package
				{record.version != null
					? ` (v${record.version})`
					: ''}{' '}
				— its on-chain publish was verified. Diff against it
				(command below) and still read the full change set
				before trusting any “small diff”.
			</div>
		);
	// No record (or couldn't decode the package id) → loud degrade.
	return (
		<div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-[12px] text-foreground">
			<TriangleAlert className="mt-0.5 h-4 w-4 flex-none text-warning" />
			<span>
				<span className="font-semibold">
					No trusted baseline.
				</span>{' '}
				{hasPkgId
					? 'The live package has no verified source record (it may have been published outside this tool), so a diff has no trustworthy starting point.'
					: 'Could not determine the package being upgraded from the transaction.'}{' '}
				Do not rely on a “small diff” — read the FULL
				source.
			</span>
		</div>
	);
}

function AttestBadge({
	on,
	label,
}: {
	on: boolean;
	label: string;
}) {
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
				on
					? 'border-success/40 bg-success/10 text-success'
					: 'border-border bg-muted text-faint'
			}`}
		>
			{on && <Check className="h-2.5 w-2.5" />}
			{label}
		</span>
	);
}
