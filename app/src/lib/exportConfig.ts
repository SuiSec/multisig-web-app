// SPDX-License-Identifier: Apache-2.0
// Build a portable, non-custodial description of a Sui native multisig.
//
// A Sui multisig address is `blake2b(flag ‖ threshold ‖ (pubkey,weight)…)`, so
// the *addresses* alone cannot reconstruct it — the member **public keys**,
// their weights, and the threshold are required. This module assembles exactly
// that (all public, no private material) so users can rebuild the multisig on
// any other platform (SDK `MultiSigPublicKey.fromPublicKeys` or the Sui CLI).

import type { MultisigWithMembers } from '@mysten/sagat';
import { SIGNATURE_SCHEME_TO_FLAG } from '@mysten/sui/cryptography';
import { fromBase64 } from '@mysten/sui/utils';

import { memberAddress } from './multisig';

const FLAG_TO_SCHEME: Record<number, string> =
	Object.fromEntries(
		Object.entries(SIGNATURE_SCHEME_TO_FLAG).map(
			([scheme, flag]) => [flag as number, scheme],
		),
	);

export interface ExportedMember {
	/** Derived Sui address — for reference only; not used to reconstruct. */
	address: string;
	/** Sui-flagged base64 public key (`toSuiPublicKey()`) — the canonical input. */
	publicKey: string;
	/** ED25519 | Secp256k1 | Secp256r1 | … */
	scheme: string;
	weight: number;
}

export interface MultisigConfig {
	schema: 'sui-multisig-config@1';
	address: string;
	threshold: number;
	/** Composite multisig public key, base64 (`MultiSigPublicKey.toRawBytes()`). */
	multisigPublicKey: string;
	members: ExportedMember[];
}

export function buildMultisigConfig(
	multisig: MultisigWithMembers,
): MultisigConfig {
	const members = [...multisig.members]
		.sort((a, b) => a.order - b.order)
		.map((m): ExportedMember => {
			const flag = fromBase64(m.publicKey)[0];
			return {
				address: memberAddress(m.publicKey),
				publicKey: m.publicKey,
				scheme: FLAG_TO_SCHEME[flag] ?? `flag-${flag}`,
				weight: m.weight,
			};
		});

	return {
		schema: 'sui-multisig-config@1',
		address: multisig.address,
		threshold: multisig.threshold,
		multisigPublicKey: multisig.publicKey,
		members,
	};
}

export function configToJSON(
	config: MultisigConfig,
): string {
	return JSON.stringify(config, null, 2);
}

/**
 * The `sui keytool multi-sig-address` invocation that reproduces this address.
 * `--pks` takes Base64 public keys each prefixed with their scheme flag, which
 * is exactly the `publicKey` we store (`toSuiPublicKey()`).
 */
export function configToCli(
	config: MultisigConfig,
): string {
	const pks = config.members
		.map((m) => m.publicKey)
		.join(' ');
	const weights = config.members
		.map((m) => m.weight)
		.join(' ');
	return `sui keytool multi-sig-address --threshold ${config.threshold} --pks ${pks} --weights ${weights}`;
}
