// SPDX-License-Identifier: Apache-2.0
// Chain anchor for relay-supplied package verification records.
//
// The relay is untrusted, coordination-only storage: it can serve a `package_record`
// with any `multisigAddress`/`blobId`/`buildDigest` it likes (a poisoned or
// MITM'd relay, or — until the server-side binding lands — any logged-in user).
// This re-derives the record's provenance from the CHAIN, so a forged record is
// rejected no matter who wrote it. It is the real trust anchor; the relay's row
// is only a pointer. Every "verified/green" signal in the UI must gate on this.

import { SuiGrpcClient } from '@mysten/sui/grpc';
import {
	formatAddress,
	normalizeSuiAddress,
} from '@mysten/sui/utils';

export interface AnchorResult {
	ok: boolean;
	reason?: string;
}

/** What `anchorPackageRecord` needs off a PackageRecord. */
export type AnchorableRecord = {
	packageId: string;
	multisigAddress: string;
	txDigest: string;
};

/**
 * Verify a package record against the chain: fetch the recorded publish/upgrade
 * transaction and assert it (a) succeeded, (b) was sent by the recorded multisig,
 * and (c) actually wrote the recorded package id. Any mismatch ⇒ forged
 * provenance. A negative result is a legitimate verdict, not a swallowed error;
 * a thrown error (tx not found, RPC failure) surfaces via the query's error state
 * and the UI must likewise treat it as "not anchored".
 */
export async function anchorPackageRecord(
	client: SuiGrpcClient,
	record: AnchorableRecord,
): Promise<AnchorResult> {
	const result = await client.getTransaction({
		digest: record.txDigest,
		include: { effects: true, transaction: true },
	});

	const tx = result.Transaction;
	if (!tx)
		return {
			ok: false,
			reason:
				'Recorded transaction is not a finalized success on-chain.',
		};

	if (!tx.effects?.status?.success)
		return {
			ok: false,
			reason:
				'The recorded transaction did not execute successfully on-chain.',
		};

	const sender = tx.transaction?.sender;
	if (
		!sender ||
		normalizeSuiAddress(sender) !==
			normalizeSuiAddress(record.multisigAddress)
	)
		return {
			ok: false,
			reason: `On-chain sender (${
				sender ? formatAddress(sender) : 'unknown'
			}) is not the recorded multisig — provenance does not match the chain.`,
		};

	const wrotePackage = tx.effects.changedObjects?.some(
		(o) =>
			o.outputState === 'PackageWrite' &&
			normalizeSuiAddress(o.objectId) ===
				normalizeSuiAddress(record.packageId),
	);
	if (!wrotePackage)
		return {
			ok: false,
			reason:
				'The recorded transaction did not publish/upgrade the recorded package id.',
		};

	return { ok: true };
}
