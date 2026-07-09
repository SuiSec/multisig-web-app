// SPDX-License-Identifier: Apache-2.0
// Out-of-band digest verification (defends the signer-device-malware vector).
//
// Client-side simulation and byte-integrity checks defend against a malicious
// RELAY or frontend. They do NOT defend against malware on the signer's OWN
// machine that swaps the bytes between a legitimate frontend and the hardware
// wallet — in the Radiant Capital compromise that vector even bypassed a
// Tenderly simulation. The one thing that survives such tampering is the
// transaction digest: change one bit of the bytes and the digest changes.
//
// So we derive the digest LOCALLY from the exact bytes (never trust the
// relay-supplied `proposal.digest`) and show it prominently, with the one
// instruction that actually catches device-internal tampering: compare this
// value against what your wallet/hardware screen shows, what your co-signers
// see, and — ideally — an independent second device. All co-signers of one
// proposal sign the identical digest, so a mismatch anywhere means tampering.

import {
	AlertTriangle,
	Check,
	Copy,
	Fingerprint,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { deriveTxDigest } from '../lib/txIntegrity';
import { Card } from './ui/kit';

export function DigestVerify({
	transactionBytes,
	/** The digest the relay claims for this proposal (URL / identifier). When it
	 *  doesn't match the digest derived from the bytes, the relay served bytes
	 *  that aren't the proposal you navigated to — a hard, red mismatch. */
	expectedDigest,
}: {
	transactionBytes: string;
	expectedDigest?: string;
}) {
	const [copied, setCopied] = useState(false);

	const derived = useMemo(() => {
		try {
			return deriveTxDigest(transactionBytes);
		} catch {
			return null;
		}
	}, [transactionBytes]);

	if (!derived)
		return (
			<Card className="border-destructive/50 bg-destructive/10 p-5">
				<div className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
					<AlertTriangle className="h-4 w-4 flex-none" />
					Could not derive a digest from these bytes
				</div>
				<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
					The transaction bytes could not be decoded, so no
					digest could be computed. Do not sign — the data
					may be corrupt or tampered.
				</p>
			</Card>
		);

	const mismatch =
		!!expectedDigest && expectedDigest !== derived;

	return (
		<Card
			className={`p-5 ${
				mismatch
					? 'border-destructive/50 bg-destructive/10'
					: 'border-primary/30 bg-primary/[0.04]'
			}`}
		>
			<div className="flex items-center justify-between gap-3">
				<div
					className={`flex items-center gap-1.5 text-sm font-semibold ${
						mismatch
							? 'text-destructive'
							: 'text-foreground'
					}`}
				>
					{mismatch ? (
						<AlertTriangle className="h-4 w-4 flex-none" />
					) : (
						<Fingerprint className="h-4 w-4 flex-none" />
					)}
					{mismatch
						? 'Digest mismatch — do not sign'
						: 'Transaction digest — verify before signing'}
				</div>
				<button
					type="button"
					onClick={() => {
						void navigator.clipboard.writeText(derived);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
					className="inline-flex flex-none items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-accent"
				>
					{copied ? (
						<Check className="h-3 w-3 text-success" />
					) : (
						<Copy className="h-3 w-3" />
					)}
					{copied ? 'Copied' : 'Copy'}
				</button>
			</div>

			{/* The digest itself — full, large, selectable. This is the value to
			    read out and compare, so it must not be truncated. */}
			<div className="mt-3 rounded-lg border border-border bg-field p-3 font-mono text-[13px] leading-relaxed break-all select-all text-foreground">
				{derived}
			</div>

			{mismatch ? (
				<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
					This is the digest computed locally from the bytes
					the relay served. It does{' '}
					<span className="font-semibold text-destructive">
						not
					</span>{' '}
					match the digest this proposal claims (
					<span className="font-mono">
						{expectedDigest}
					</span>
					). The relay may be serving bytes that belong to a
					different transaction. Do not sign.
				</p>
			) : (
				<div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
					<p>
						Computed locally from the transaction bytes —
						not supplied by the server. Change one bit of
						the transaction and this value changes. Before
						you approve, confirm it matches all three:
					</p>
					<ul className="ml-4 list-disc space-y-1">
						<li>
							the digest your{' '}
							<span className="font-medium text-foreground">
								wallet / hardware screen
							</span>{' '}
							shows when you approve;
						</li>
						<li>
							what your{' '}
							<span className="font-medium text-foreground">
								co-signers
							</span>{' '}
							see — every signer of this proposal signs the
							identical digest;
						</li>
						<li>
							ideally, a check on an{' '}
							<span className="font-medium text-foreground">
								independent second device
							</span>
							.
						</li>
					</ul>
					<p>
						If it differs anywhere, the bytes were tampered
						— even malware on your own machine can't change
						the transaction without changing this digest.
						Stop and do not sign.
					</p>
				</div>
			)}
		</Card>
	);
}
