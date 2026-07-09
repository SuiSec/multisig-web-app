// SPDX-License-Identifier: Apache-2.0
// Structured Transaction Effects from a simulation result: per-address coin
// balance deltas and object ownership changes. Driven by the simulated
// `effects.changedObjects` (+ the `objectTypes` map and `balanceChanges`), so it
// reflects the REAL outcome — an ownership change is captured whether it came
// from a plain `TransferObjects`, a `transfer` Move call, or an NFT-marketplace
// purchase that hands the object to a new owner. The relay never simulates; this
// parses what the client-side dry-run returned.

/** A resolved object owner. `address` is set only for address-like owners. */
export interface OwnerRef {
	kind:
		| 'address'
		| 'object'
		| 'shared'
		| 'immutable'
		| 'unknown';
	address: string | null;
}

export type ObjectOp =
	'created' | 'deleted' | 'transferred' | 'mutated';

export interface ObjectChange {
	objectId: string;
	/** Full Move type, or null if the simulation didn't report it. */
	type: string | null;
	isCoin: boolean;
	from: OwnerRef | null;
	to: OwnerRef | null;
	operation: ObjectOp;
}

export interface CoinDelta {
	address: string;
	coinType: string;
	amount: bigint;
}

export interface TxEffects {
	coinDeltas: CoinDelta[];
	objectChanges: ObjectChange[];
}

interface RawOwner {
	$kind: string;
	AddressOwner?: string;
	ObjectOwner?: string;
	ConsensusAddressOwner?: { owner: string };
}

function ownerRef(o: RawOwner | null): OwnerRef | null {
	if (!o) return null;
	switch (o.$kind) {
		case 'AddressOwner':
			return {
				kind: 'address',
				address: o.AddressOwner ?? null,
			};
		case 'ConsensusAddressOwner':
			return {
				kind: 'address',
				address: o.ConsensusAddressOwner?.owner ?? null,
			};
		case 'ObjectOwner':
			return {
				kind: 'object',
				address: o.ObjectOwner ?? null,
			};
		case 'Shared':
			return { kind: 'shared', address: null };
		case 'Immutable':
			return { kind: 'immutable', address: null };
		default:
			return { kind: 'unknown', address: null };
	}
}

function isCoinType(type: string): boolean {
	return /::coin::Coin(<|$)/.test(type);
}

interface RawChangedObject {
	objectId: string;
	inputOwner: RawOwner | null;
	outputOwner: RawOwner | null;
	idOperation: string;
}

/** Parse a SimulateTransactionResult into structured effects (null if absent). */
export function parseTxEffects(
	simData: unknown,
): TxEffects | null {
	const data = simData as {
		Transaction?: unknown;
		FailedTransaction?: unknown;
	} | null;
	const tx = (data?.Transaction ??
		data?.FailedTransaction) as
		| {
				effects?: { changedObjects?: RawChangedObject[] };
				objectTypes?: Record<string, string>;
				balanceChanges?: {
					address: string;
					coinType: string;
					amount: string;
				}[];
		  }
		| undefined;
	if (!tx?.effects) return null;

	const objectTypes = tx.objectTypes ?? {};
	const coinDeltas: CoinDelta[] = (
		tx.balanceChanges ?? []
	).map((b) => ({
		address: b.address,
		coinType: b.coinType,
		amount: BigInt(b.amount),
	}));

	const objectChanges: ObjectChange[] = [];
	for (const c of tx.effects.changedObjects ?? []) {
		const type = objectTypes[c.objectId] ?? null;
		const from = ownerRef(c.inputOwner);
		const to = ownerRef(c.outputOwner);
		let operation: ObjectOp;
		if (c.idOperation === 'Created') operation = 'created';
		else if (c.idOperation === 'Deleted')
			operation = 'deleted';
		else if (
			from?.kind === 'address' &&
			to?.kind === 'address' &&
			from.address !== to.address
		)
			operation = 'transferred';
		else operation = 'mutated';
		objectChanges.push({
			objectId: c.objectId,
			type,
			isCoin: type ? isCoinType(type) : false,
			from,
			to,
			operation,
		});
	}

	return { coinDeltas, objectChanges };
}
