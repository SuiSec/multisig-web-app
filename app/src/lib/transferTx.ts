// SPDX-License-Identifier: Apache-2.0
// Build coin / object transfer transactions with the multisig as sender. The
// frozen bytes become a proposal (the initiator's signature is the first vote).

import { Transaction } from '@mysten/sui/transactions';
import {
	normalizeStructTag,
	toBase64,
} from '@mysten/sui/utils';

// The build client is ClientWithCoreApi — `.core` carries getCoins etc.
type BuildClient = NonNullable<
	NonNullable<Parameters<Transaction['build']>[0]>['client']
>;

// Minimal view of the coin reader on `client.core` (the SDK exposes several
// overlapping CoreClient types; we only need listCoins → object ids).
interface CoinReader {
	core: {
		listCoins: (opts: {
			owner: string;
			coinType: string;
		}) => Promise<{ objects: { objectId: string }[] }>;
	};
}

/** Parse a decimal amount string into base units exactly (no float error). */
export function toBaseUnits(
	amount: string,
	decimals: number,
): bigint {
	const [whole, frac = ''] = amount.trim().split('.');
	const fracPadded = (frac + '0'.repeat(decimals)).slice(
		0,
		decimals,
	);
	return (
		BigInt(whole || '0') * 10n ** BigInt(decimals) +
		BigInt(fracPadded || '0')
	);
}

const SUI_TYPE = '0x2::sui::SUI';
// Keep a little SUI as a coin to pay THIS transaction's gas: the accumulator is
// only credited at commit, so gas for this tx can't come from coins we deposit
// here. Comfortably covers a multi-command sweep PTB.
const GAS_RESERVE = 50_000_000n; // 0.05 SUI

/** `coin::send_funds<T>(coin, to)` — deposit a Coin<T> into `to`'s accumulator. */
function sendCoin(
	tx: Transaction,
	coin:
		| ReturnType<Transaction['splitCoins']>[number]
		| ReturnType<Transaction['object']>,
	type: string,
	to: string,
) {
	tx.moveCall({
		target: '0x2::coin::send_funds',
		typeArguments: [type],
		arguments: [coin, tx.pure.address(to)],
	});
}

/**
 * Build a coin transfer that (a) sends `amount` of `coinType` into the
 * recipient's address balance accumulator and (b) migrates the sender's
 * remaining coin-form holdings — across ALL coin types in `sweep` — into the
 * sender's OWN accumulator. After it executes the multisig holds (almost)
 * everything as address balance, so later transfers are lock-free.
 *
 * The transfer amount is funded from coin objects when the type has enough in
 * coin form, otherwise from a FundsWithdrawal. A small SUI coin (`GAS_RESERVE`)
 * is always left behind to pay this tx's gas.
 */
export async function buildCoinTransferBytes(
	client: BuildClient,
	sender: string,
	opts: {
		coinType: string;
		isSui: boolean;
		amount: bigint;
		recipient: string;
		/** Every coin type the sender holds in coin form, with its total coin-
		 *  form amount — all migrated into the sender's accumulator. The
		 *  transferred `coinType` may be included; its `amount` goes to the
		 *  recipient and the remainder to the sender. Empty = migrate nothing. */
		sweep?: {
			coinType: string;
			isSui: boolean;
			coinRaw: bigint;
		}[];
	},
): Promise<string> {
	const tx = new Transaction();
	tx.setSender(sender);

	const sweep = opts.sweep ?? [];
	const sameType = (a: string, b: string) =>
		normalizeStructTag(a) === normalizeStructTag(b);
	const transferredCoinRaw =
		sweep.find((s) => sameType(s.coinType, opts.coinType))
			?.coinRaw ?? 0n;
	// Fund the transfer from coins when the type holds enough in coin form;
	// otherwise pull it from the accumulator (caller guarantees one source
	// fully covers `amount`).
	const fundFromCoin = transferredCoinRaw >= opts.amount;
	let transferDone = false;

	const reader = client as unknown as CoinReader;

	// --- SUI leg: route through tx.gas so a gas coin is always available. ---
	const suiTotal =
		sweep.find((s) => s.isSui)?.coinRaw ?? 0n;
	if (suiTotal > 0n) {
		const { objects } = await reader.core.listCoins({
			owner: sender,
			coinType: SUI_TYPE,
		});
		// Leave one SUI coin for the SDK to pick as gas (tx.gas); fold the rest in.
		if (objects.length > 1)
			tx.mergeCoins(
				tx.gas,
				objects.slice(1).map((o) => tx.object(o.objectId)),
			);
		let consumed = 0n;
		if (opts.isSui && fundFromCoin) {
			const [out] = tx.splitCoins(tx.gas, [opts.amount]);
			sendCoin(tx, out, SUI_TYPE, opts.recipient);
			consumed = opts.amount;
			transferDone = true;
		}
		const sweepAmt = suiTotal - consumed - GAS_RESERVE;
		if (sweepAmt > 0n) {
			const [s] = tx.splitCoins(tx.gas, [sweepAmt]);
			sendCoin(tx, s, SUI_TYPE, sender);
		}
	}

	// --- Non-SUI legs: deposit each type's whole coin balance into the sender's
	//     accumulator, carving out the transfer amount when it's this type. ---
	for (const s of sweep) {
		if (s.isSui) continue;
		const { objects } = await reader.core.listCoins({
			owner: sender,
			coinType: s.coinType,
		});
		if (objects.length === 0) continue;
		const primary = tx.object(objects[0].objectId);
		if (objects.length > 1)
			tx.mergeCoins(
				primary,
				objects.slice(1).map((o) => tx.object(o.objectId)),
			);
		if (
			sameType(s.coinType, opts.coinType) &&
			fundFromCoin
		) {
			const [out] = tx.splitCoins(primary, [opts.amount]);
			sendCoin(tx, out, s.coinType, opts.recipient);
			transferDone = true;
			if (s.coinRaw > opts.amount)
				sendCoin(tx, primary, s.coinType, sender);
		} else {
			sendCoin(tx, primary, s.coinType, sender);
		}
	}

	// --- Transfer funded from the accumulator (type not held in coin form). The
	//     PTB only references tx.gas if there were SUI coins to sweep; otherwise
	//     gas is paid from the SUI address balance. ---
	if (!transferDone) {
		// `withdrawal` yields a `funds_accumulator::Withdrawal<Balance<T>>`, not a
		// `Balance<T>`; redeem it into a Balance before depositing into the
		// recipient's accumulator (`balance::send_funds` takes `Balance<T>`).
		const withdrawal = tx.withdrawal({
			amount: opts.amount,
			type: opts.coinType,
		});
		const [balance] = tx.moveCall({
			target: '0x2::balance::redeem_funds',
			typeArguments: [opts.coinType],
			arguments: [withdrawal],
		});
		tx.moveCall({
			target: '0x2::balance::send_funds',
			typeArguments: [opts.coinType],
			arguments: [balance, tx.pure.address(opts.recipient)],
		});
	}

	return toBase64(await tx.build({ client }));
}

/**
 * Deposit coins into the multisig's OWN address balance accumulator
 * (`0x2::coin::send_funds`). This is the one-time "seed" step: it consumes a
 * coin object (so it does lock that coin for this proposal), but afterwards the
 * balance can fund lock-free transfers — see `buildCoinTransferBytes`'
 * `fromAccountBalance` path. Recipient is the sender itself.
 */
export async function buildAccountBalanceDepositBytes(
	client: BuildClient,
	sender: string,
	opts: {
		coinType: string;
		isSui: boolean;
		amount: bigint;
	},
): Promise<string> {
	const tx = new Transaction();
	tx.setSender(sender);

	let coin;
	if (opts.isSui) {
		// Gas coin is SUI — split the deposit amount off it.
		[coin] = tx.splitCoins(tx.gas, [opts.amount]);
	} else {
		const { objects } = await (
			client as unknown as CoinReader
		).core.listCoins({
			owner: sender,
			coinType: opts.coinType,
		});
		if (!objects || objects.length === 0)
			throw new Error('No coins of this type to deposit.');
		const primary = tx.object(objects[0].objectId);
		if (objects.length > 1)
			tx.mergeCoins(
				primary,
				objects.slice(1).map((o) => tx.object(o.objectId)),
			);
		[coin] = tx.splitCoins(primary, [opts.amount]);
	}

	tx.moveCall({
		target: '0x2::coin::send_funds',
		typeArguments: [opts.coinType],
		arguments: [coin, tx.pure.address(sender)],
	});

	return toBase64(await tx.build({ client }));
}

export async function buildObjectTransferBytes(
	client: BuildClient,
	sender: string,
	opts: { objectId: string; recipient: string },
): Promise<string> {
	const tx = new Transaction();
	tx.setSender(sender);
	tx.transferObjects(
		[tx.object(opts.objectId)],
		opts.recipient,
	);
	return toBase64(await tx.build({ client }));
}
