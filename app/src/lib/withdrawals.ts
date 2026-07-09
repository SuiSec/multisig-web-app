// SPDX-License-Identifier: Apache-2.0
// Decode the account-balance withdrawal authorizations carried in a PTB's
// inputs. Sui's account-balance feature lets a transaction pull funds straight
// from the owner's account balance; the authorization is a PTB input
// (CallArg::FundsWithdrawal) whose `reservation` caps how much may be taken.
//
// The cap lives in the SIGNED TransactionData — `reservation.MaxAmountU64` — so
// it is exactly what every signer authorizes, regardless of what the contract
// ends up moving. It is a ceiling (the `limit`), not the executed amount: the
// real debit shows up in the simulated balance changes and can be lower. We
// surface the ceiling so members can sanity-check it (a limit near the full
// balance is the dangerous case) before approving.

import { Transaction } from '@mysten/sui/transactions';

export interface FundsWithdrawal {
	/** Authorization ceiling (`reservation.MaxAmountU64`) in the coin's base
	 *  units (MIST for SUI). The most this input lets the tx withdraw. */
	limit: bigint;
	/** Fully-qualified balance type, e.g. `0x2::sui::SUI`. */
	coinType: string;
	/** Whose account balance is debited. */
	from: 'sender' | 'sponsor';
}

// Shape of a FundsWithdrawal CallArg in @mysten/sui's transaction data model.
interface FundsWithdrawalInput {
	FundsWithdrawal?: {
		reservation: { MaxAmountU64?: string | number };
		typeArg: { Balance?: string };
		withdrawFrom: { Sender?: true; Sponsor?: true };
	};
}

/**
 * Parse the FundsWithdrawal inputs out of a transaction's bytes. Returns one
 * entry per account-balance withdrawal authorization, or an empty array when
 * the transaction carries none. The bytes are the same ones the dry-run/analyzer
 * already consume, so parsing them again here is a pure read.
 */
export function parseFundsWithdrawals(
	transactionBytes: string,
): FundsWithdrawal[] {
	const { inputs } = Transaction.from(
		transactionBytes,
	).getData();
	const out: FundsWithdrawal[] = [];
	for (const input of inputs as FundsWithdrawalInput[]) {
		const w = input.FundsWithdrawal;
		if (!w) continue;
		out.push({
			limit: BigInt(w.reservation?.MaxAmountU64 ?? 0),
			coinType: w.typeArg?.Balance ?? 'unknown',
			from: w.withdrawFrom?.Sponsor ? 'sponsor' : 'sender',
		});
	}
	return out;
}
