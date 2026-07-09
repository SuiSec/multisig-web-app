// SPDX-License-Identifier: Apache-2.0

import { MultiSigPublicKey } from '@mysten/sui/multisig';

import { extractPublicKeyFromBase64 } from './wallet';

interface MemberLike {
	publicKey: string;
	weight: number;
}

/**
 * Reconstruct the MultiSigPublicKey from members + threshold.
 * Used both to combine signatures and — crucially — to locally re-derive the
 * multisig address so the client never trusts a server-supplied address.
 */
export function multisigPublicKey(
	members: MemberLike[],
	threshold: number,
): MultiSigPublicKey {
	return MultiSigPublicKey.fromPublicKeys({
		threshold,
		publicKeys: members.map((m) => ({
			publicKey: extractPublicKeyFromBase64(m.publicKey),
			weight: m.weight,
		})),
	});
}

export function deriveMultisigAddress(
	members: MemberLike[],
	threshold: number,
): string {
	return multisigPublicKey(
		members,
		threshold,
	).toSuiAddress();
}

/** Derive a single member's Sui address from their public key. */
export function memberAddress(publicKey: string): string {
	return extractPublicKeyFromBase64(
		publicKey,
	).toSuiAddress();
}

/** Sum the weights of members who have signed. */
export function signedWeight(
	members: MemberLike[],
	signedPublicKeys: string[],
): number {
	const set = new Set(signedPublicKeys);
	return members.reduce(
		(acc, m) => acc + (set.has(m.publicKey) ? m.weight : 0),
		0,
	);
}

/**
 * Whether reject votes have made the approval threshold unreachable: even if
 * every non-rejecting member signed, the combined weight would fall short.
 * Mirrors the relay's `isProposalUnreachable`.
 */
export function proposalUnreachable(
	members: MemberLike[],
	threshold: number,
	rejectedPublicKeys: string[],
): boolean {
	const totalWeight = members.reduce(
		(acc, m) => acc + m.weight,
		0,
	);
	const rejectWeight = signedWeight(
		members,
		rejectedPublicKeys,
	);
	return totalWeight - rejectWeight < threshold;
}
