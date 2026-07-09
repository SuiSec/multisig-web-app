// SPDX-License-Identifier: Apache-2.0
// WYSIWYS byte-integrity guard (G1).
//
// The security review — analysis, dry-run, withdrawal ceilings, sender binding —
// is all derived from a proposal's `transactionBytes`. But the wallet does not
// sign that string directly: dApp-kit takes `Transaction.from(bytes)` and calls
// `.build()` again before signing. If that rebuild is not byte-identical to the
// stored bytes (e.g. the proposal's bytes were not fully resolved, so build()
// re-picks gas coins or re-resolves object versions), then what the user
// REVIEWED and what the wallet SIGNS can differ — the classic "display A, sign B"
// gap that blind-signing attacks exploit.
//
// A canonical multisig proposal must be fully resolved and deterministic: every
// signer signs the exact same digest, so `Transaction.from(bytes).build()` must
// return `bytes` unchanged. This guard asserts that invariant and refuses
// otherwise — fail loud, never sign bytes we didn't simulate.

import type { ClientWithCoreApi } from '@mysten/sui/client';
import {
	Transaction,
	TransactionDataBuilder,
} from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';

export const NON_CANONICAL_TX_ERROR =
	'Refusing to proceed: rebuilding these transaction bytes produced different bytes, ' +
	'so what was simulated and displayed may differ from what your wallet would sign. ' +
	'A valid multisig proposal must be fully resolved and deterministic. Do not sign — ' +
	'the relay may be serving non-canonical or tampered bytes.';

/**
 * Rebuild `transactionBytes` and assert the result is byte-identical. Returns
 * the built `Uint8Array` (ready to hand to `simulateTransaction`) so callers can
 * simulate the exact bytes they just verified. Throws {@link NON_CANONICAL_TX_ERROR}
 * on any mismatch.
 *
 * `build({ client })` needs the client to resolve anything unresolved — and if
 * it DOES resolve something, that's precisely the non-canonical case we reject.
 */
export async function assertCanonicalTxBytes(
	transactionBytes: string,
	client: ClientWithCoreApi,
): Promise<Uint8Array> {
	const built = await Transaction.from(
		transactionBytes,
	).build({
		client,
	});
	if (toBase64(built) !== transactionBytes)
		throw new Error(NON_CANONICAL_TX_ERROR);
	return built;
}

/**
 * The transaction digest, computed PURELY from the (base64) transaction bytes —
 * `toBase58(hashTypedData("TransactionData", bytes))`. No relay, no network, no
 * client. This is the fingerprint of the entire TransactionData (sender, gas,
 * every command and input, expiration); the wallet signs over it and every
 * co-signer of the same proposal must produce the identical value. Deriving it
 * locally — rather than trusting the relay-supplied `proposal.digest` — is what
 * lets a signer cross-check it against their wallet screen, their co-signers,
 * and an independent second device to catch bytes tampered on their own machine.
 */
export function deriveTxDigest(
	transactionBytes: string,
): string {
	return TransactionDataBuilder.getDigestFromBytes(
		fromBase64(transactionBytes),
	);
}
