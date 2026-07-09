// SPDX-License-Identifier: Apache-2.0
// Transaction analysis + dry-run, adapted from Mysten Labs' Sagat (Apache-2.0).

import { useDAppKit } from '@mysten/dapp-kit-react';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import {
	analyze,
	analyzers,
	type AnalyzedCommand,
	type BalanceFlowsResult,
	type TransactionAnalysisIssue,
} from '@mysten/wallet-sdk';
import { useMutation } from '@tanstack/react-query';

import { assertCanonicalTxBytes } from '../lib/txIntegrity';

type AccessLevel = 'read' | 'mutate' | 'transfer';

type Section<T> =
	| { result: T; issues?: never }
	| { result?: never; issues: TransactionAnalysisIssue[] };

export interface TransactionAnalysis {
	commands: Section<AnalyzedCommand[]>;
	accessLevel: Section<Record<string, AccessLevel>>;
	balanceFlows: Section<BalanceFlowsResult>;
	issues: TransactionAnalysisIssue[];
}

const selected = {
	commands: analyzers.commands,
	accessLevel: analyzers.accessLevel,
	balanceFlows: analyzers.balanceFlows,
};

export function useTransactionAnalysis() {
	const client = useDAppKit().getClient();
	return useMutation({
		mutationFn: async (transactionBytes: string) => {
			const result = await analyze(selected, {
				transaction: transactionBytes,
				client: client as ClientWithCoreApi,
				balanceFlows: { excludeGasBudget: true },
			});
			return result as unknown as TransactionAnalysis;
		},
		retry: false,
	});
}

export function useDryRun() {
	const client = useDAppKit().getClient();
	return useMutation({
		mutationFn: async (transactionBytes: string) => {
			// G1: rebuild and assert byte-for-byte equality, then simulate the
			// EXACT bytes we verified. This ties the WYSIWYS sign gate (which
			// keys off dryRun.isSuccess) to the guarantee that the simulated,
			// displayed, and to-be-signed bytes are one and the same.
			const built = await assertCanonicalTxBytes(
				transactionBytes,
				client as ClientWithCoreApi,
			);
			const result = await client.simulateTransaction({
				transaction: built,
				include: {
					effects: true,
					balanceChanges: true,
					events: true,
					transaction: true,
					objectTypes: true,
				},
			});
			if (result.FailedTransaction) {
				throw new Error(
					result.FailedTransaction.effects.status.error
						?.message ?? 'Transaction would fail',
				);
			}
			return result;
		},
		retry: false,
	});
}
