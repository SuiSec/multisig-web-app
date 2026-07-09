// SPDX-License-Identifier: Apache-2.0
// Decode a PTB command's `Pure` inputs by their Move parameter type for the AI
// summary. The wallet-sdk analyzer leaves every Pure argument as opaque base64
// `bytes`; the UI decodes them per-type in CapturedTxDetails before display, but
// the data handed to the LLM did NOT — so the model saw `u71WMt7K…` instead of
// `0xbbbd…` and could only report the raw base64. This applies the SAME typed
// decode (decodePure) to each command's pures so the model reads human-readable
// addresses/amounts. Non-Pure arguments pass through untouched.

import type {
	AnalyzedCommand,
	AnalyzedCommandArgument,
} from '@mysten/wallet-sdk';

import type { OpenSignature } from './paramRisk';
import {
	decodePure,
	paramBody,
	pureTypeName,
} from './pureValue';

/** Swap a Pure arg's base64 `bytes` for its decoded value + declared type. Any
 *  non-Pure argument (Object/Result/GasCoin/Withdrawal) is returned as-is. */
function decodePureArg(
	arg: AnalyzedCommandArgument,
	typeName: string | null,
): unknown {
	if (arg?.$kind !== 'Pure') return arg;
	return {
		$kind: 'Pure',
		valueType: typeName ?? 'unknown',
		value: decodePure(arg.bytes, typeName),
	};
}

/**
 * A copy of `c` with every Pure input decoded by its Move type — mirroring the
 * per-kind type assignment the UI uses (MoveCall params from the function
 * signature; `address` for a TransferObjects recipient; `u64` for SplitCoins
 * amounts). Commands with no typed pures are returned unchanged.
 */
export function decodeCommandPures(
	c: AnalyzedCommand,
): unknown {
	switch (c.$kind) {
		case 'MoveCall': {
			const params = (c.function?.parameters ??
				[]) as unknown as OpenSignature[];
			return {
				...c,
				arguments: c.arguments.map((arg, i) =>
					decodePureArg(
						arg,
						pureTypeName(paramBody(params[i])),
					),
				),
			};
		}
		case 'TransferObjects':
			return {
				...c,
				address: decodePureArg(c.address, 'address'),
			};
		case 'SplitCoins':
			return {
				...c,
				amounts: c.amounts.map((a) =>
					decodePureArg(a, 'u64'),
				),
			};
		default:
			return c;
	}
}
