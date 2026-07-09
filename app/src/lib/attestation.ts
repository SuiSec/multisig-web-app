// SPDX-License-Identifier: Apache-2.0
// Proposer attestation: a personal-message signature binding the uploaded source
// (Walrus blob) + the claimed build digest + the proposal's tx digest. It is
// attribution/non-repudiation ("I, the proposer, built tx T from source S"), NOT
// the security anchor — that's each signer's local recompile. The relay stores
// it verbatim; reviewers verify it client-side against the proposer's address.

import { verifyPersonalMessageSignature } from '@mysten/sui/verify';

/** Canonical, stable message bound by the attestation (signer == verifier). */
export function attestationMessage(
	sourceBlobId: string,
	buildDigest: string,
	txDigest: string,
): string {
	return [
		'multiSigWeb package attestation v1',
		`blob:${sourceBlobId}`,
		`digest:${buildDigest}`,
		`tx:${txDigest}`,
	].join('\n');
}

export const attestationMessageBytes = (
	sourceBlobId: string,
	buildDigest: string,
	txDigest: string,
): Uint8Array =>
	new TextEncoder().encode(
		attestationMessage(sourceBlobId, buildDigest, txDigest),
	);

/**
 * Verify a proposal's attestation against the proposer's address. Returns
 * 'valid' | 'invalid' | 'none' (nothing to verify). A verification failure is a
 * legitimate negative result, not a swallowed error.
 */
export async function verifyAttestation(p: {
	attestation: string | null;
	sourceBlobId: string | null;
	buildDigest: string | null;
	digest: string;
	proposerAddress: string;
}): Promise<'valid' | 'invalid' | 'none'> {
	if (!p.attestation || !p.sourceBlobId || !p.buildDigest)
		return 'none';
	try {
		await verifyPersonalMessageSignature(
			attestationMessageBytes(
				p.sourceBlobId,
				p.buildDigest,
				p.digest,
			),
			p.attestation,
			{ address: p.proposerAddress },
		);
		return 'valid';
	} catch {
		return 'invalid';
	}
}
