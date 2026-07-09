// SPDX-License-Identifier: Apache-2.0
// Decode a PTB `Pure` input's base64 bytes into a human-readable value, using
// the Move parameter's declared type. Primitives (uXX / bool / address /
// String) decode to a clean value; anything we can't decode by type (an unknown
// or composite type) is shown as raw `0x…` hex — an intentional, explicit
// fallback so the reviewer always sees SOMETHING faithful to the signed bytes,
// never a thrown error that blanks the whole review.

import { bcs } from '@mysten/sui/bcs';
import { fromBase64, toHex } from '@mysten/sui/utils';

import type { OpenSignature } from './paramRisk';

// Local mirror of paramRisk's SigBody (kept private; only the shape we read).
interface SigBody {
	$kind: string;
	vector?: SigBody;
	datatype?: {
		typeName: string;
		typeParameters: SigBody[];
	};
}

/** Short, display-friendly type name for a parameter body (`u64`, `vector<u8>`,
 *  `string::String`, …). Returns null when there's no body to read. */
export function pureTypeName(
	body?: SigBody,
): string | null {
	if (!body) return null;
	switch (body.$kind) {
		case 'vector':
			return `vector<${pureTypeName(body.vector) ?? '?'}>`;
		case 'datatype':
			return body.datatype
				? body.datatype.typeName
						.split('::')
						.slice(-2)
						.join('::')
				: 'datatype';
		case 'typeParameter':
			return 'T';
		default:
			return body.$kind; // u8, u16, …, bool, address
	}
}

/** The body of a MoveCall parameter signature (drops the &/&mut reference). */
export function paramBody(
	sig?: OpenSignature,
): SigBody | undefined {
	return sig?.body as unknown as SigBody | undefined;
}

const STRING_TYPES = new Set([
	'string::String',
	'ascii::String',
	'std::string::String',
	'std::ascii::String',
]);

/**
 * Decode `base64` pure bytes per `typeName`. Falls back to `0x…` hex for types
 * we don't special-case, or if a typed decode doesn't apply — both are
 * deliberate display representations, not error-swallowing.
 */
export function decodePure(
	base64: string,
	typeName: string | null,
): string {
	const bytes = fromBase64(base64);
	switch (typeName) {
		case 'u8':
			return String(bcs.u8().parse(bytes));
		case 'u16':
			return String(bcs.u16().parse(bytes));
		case 'u32':
			return String(bcs.u32().parse(bytes));
		case 'u64':
			return bcs.u64().parse(bytes);
		case 'u128':
			return bcs.u128().parse(bytes);
		case 'u256':
			return bcs.u256().parse(bytes);
		case 'bool':
			return String(bcs.bool().parse(bytes));
		case 'address':
			return bcs.Address.parse(bytes);
	}
	if (typeName && STRING_TYPES.has(typeName))
		return bcs.string().parse(bytes);
	// Unknown / composite type → faithful raw hex of the signed bytes.
	return `0x${toHex(bytes)}`;
}
