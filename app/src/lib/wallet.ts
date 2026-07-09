// SPDX-License-Identifier: Apache-2.0
// Adapted from Mysten Labs' Sagat (Apache-2.0).

import {
	SIGNATURE_SCHEME_TO_FLAG,
	SIGNATURE_SCHEME_TO_SIZE,
	type PublicKey,
} from '@mysten/sui/cryptography';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1PublicKey } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1PublicKey } from '@mysten/sui/keypairs/secp256r1';
import { fromBase64 } from '@mysten/sui/utils';

// Parse a Sui-flagged base64 public key (flag || key) into a PublicKey.
export const extractPublicKeyFromBase64 = (
	publicKey: string,
): PublicKey => {
	const bytes = fromBase64(publicKey);

	if (
		bytes.length ===
		SIGNATURE_SCHEME_TO_SIZE.ED25519 + 1
	) {
		const flag = bytes[0];
		const data = bytes.slice(1);
		if (flag !== SIGNATURE_SCHEME_TO_FLAG.ED25519)
			throw new Error(
				'Public keys must carry a Sui flag (use toSuiPublicKey(), not toBase64()).',
			);
		return new Ed25519PublicKey(data);
	}

	if (
		bytes.length ===
		SIGNATURE_SCHEME_TO_SIZE.Secp256k1 + 1
	) {
		const flag = bytes[0];
		const data = bytes.slice(1);
		if (flag === SIGNATURE_SCHEME_TO_FLAG.Secp256k1)
			return new Secp256k1PublicKey(data);
		if (flag === SIGNATURE_SCHEME_TO_FLAG.Secp256r1)
			return new Secp256r1PublicKey(data);
	}

	throw new Error(
		'Only Ed25519, Secp256k1, and Secp256r1 Sui-flagged public keys are supported.',
	);
};
