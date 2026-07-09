// SPDX-License-Identifier: Apache-2.0
// Build (and freeze) the publish / upgrade transactions with the multisig as
// sender. The frozen base64 bytes are what every signer re-derives and signs.

import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';

import type { BuildArtifact } from './move';

/** Sui on-chain upgrade compatibility policies. */
export const UpgradePolicy = {
	Compatible: 0,
	Additive: 128,
	DepOnly: 192,
} as const;

export type UpgradePolicyValue =
	(typeof UpgradePolicy)[keyof typeof UpgradePolicy];

// Publish/upgrade gas is hard to auto-estimate; set a generous ceiling (unused
// gas is refunded). The multisig must hold at least this much in gas coins.
export const DEFAULT_GAS_BUDGET = 1_000_000_000; // 1 SUI

// The dApp-kit gRPC client; `tx.build` only needs object/gas resolution.
type BuildClient = NonNullable<
	Parameters<Transaction['build']>[0]
>['client'];

/**
 * Publish a new package. The resulting `UpgradeCap` is transferred to the
 * multisig itself, so future upgrades require the same threshold of signatures.
 */
export async function buildPublishTransactionBytes(
	client: BuildClient,
	sender: string,
	artifact: BuildArtifact,
	gasBudget: number = DEFAULT_GAS_BUDGET,
): Promise<string> {
	const tx = new Transaction();
	tx.setSender(sender);
	const [upgradeCap] = tx.publish({
		modules: artifact.modules,
		dependencies: artifact.dependencies,
	});
	tx.transferObjects([upgradeCap], tx.pure.address(sender));
	tx.setGasBudget(gasBudget);
	return toBase64(await tx.build({ client }));
}

/**
 * Upgrade an existing package: authorize → upgrade → commit, using the
 * `UpgradeCap` owned by the multisig.
 */
export async function buildUpgradeTransactionBytes(
	client: BuildClient,
	sender: string,
	params: {
		packageId: string;
		upgradeCapId: string;
		policy: UpgradePolicyValue;
		artifact: BuildArtifact;
		gasBudget?: number;
	},
): Promise<string> {
	const {
		packageId,
		upgradeCapId,
		policy,
		artifact,
		gasBudget = DEFAULT_GAS_BUDGET,
	} = params;
	if (!artifact.digest)
		throw new Error(
			'Build artifact has no digest — re-run sui move build --dump-bytecode-as-base64.',
		);

	const tx = new Transaction();
	tx.setSender(sender);

	const cap = tx.object(upgradeCapId);
	const ticket = tx.moveCall({
		target: '0x2::package::authorize_upgrade',
		arguments: [
			cap,
			tx.pure.u8(policy),
			tx.pure.vector(
				'u8',
				Array.from(fromBase64(artifact.digest)),
			),
		],
	});
	const receipt = tx.upgrade({
		modules: artifact.modules,
		dependencies: artifact.dependencies,
		package: packageId,
		ticket,
	});
	tx.moveCall({
		target: '0x2::package::commit_upgrade',
		arguments: [cap, receipt],
	});
	tx.setGasBudget(gasBudget);

	return toBase64(await tx.build({ client }));
}
