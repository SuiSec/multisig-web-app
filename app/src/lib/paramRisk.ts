// SPDX-License-Identifier: Apache-2.0
// Static risk read of a MoveCall's PARAMETER TYPES — independent of simulation.
//
// Simulation shows what the CURRENT contract code moves. But the amount a
// contract can actually take is bounded by what you HAND IT, which the function
// signature reveals:
//   • `&mut Coin<T>` / `&mut Balance<T>` — the contract may withdraw ANY amount
//     (up to the full balance). Simulation reflects today's code; an upgrade or
//     state-dependent logic can take more after you sign.
//   • `Coin<T>` by value — the whole coin is surrendered.
//   • a `*Cap` capability by value / `&mut` — privileged authority is handed over.
//   • `&<Cap>` immutable — the call is merely Cap-gated: the capability is
//     borrowed for the duration of the call, not transferred and not mutated.
//     Informational, NOT a warning: admin entry points legitimately require it.
//   • `&mut <object>` — the object's contents can be mutated.
//   • `&T` immutable / primitives — read-only, benign.
//
// This is deterministic; we compute it client-side rather than trusting an LLM.
//
// One exception: the FRAMEWORK SYSTEM PACKAGES (0x1 MoveStdlib, 0x2 Sui,
// 0x3 SuiSystem). These are immutable — an attacker can't upgrade them or hide
// logic in them, and their behavior is public and audited. Handing a coin /
// balance / withdrawal to e.g. `0x2::coin::send_funds` is NOT an unbounded
// authorization, so we don't flag params of calls into these packages. The
// drain-risk reasoning only holds for arbitrary (upgradeable) third-party code.

import { normalizeSuiAddress } from '@mysten/sui/utils';

// 'info' is a NOTE, not a warning: something worth naming in the UI (this is a
// Cap-gated call) that carries no extra authorization beyond the call itself.
export type ParamRisk = 'high' | 'medium' | 'info' | 'none';

/** What the flagged parameter is, so callers can word their own summaries. */
export type ParamKind =
	'coin' | 'withdrawal' | 'capability' | 'object';

const FRAMEWORK_PACKAGES = new Set(
	['0x1', '0x2', '0x3'].map((a) => normalizeSuiAddress(a)),
);

/** True for the immutable system packages (0x1 / 0x2 / 0x3). */
export function isFrameworkPackage(
	packageId: string,
): boolean {
	return FRAMEWORK_PACKAGES.has(
		normalizeSuiAddress(packageId),
	);
}

// Mirrors @mysten/sui Experimental_SuiClientTypes.OpenSignature (kept local so
// this module doesn't couple to an experimental namespace path).
type RefType = 'mutable' | 'immutable' | 'unknown' | null;
interface SigBody {
	$kind: string;
	vector?: SigBody;
	datatype?: {
		typeName: string;
		typeParameters: SigBody[];
	};
	index?: number;
}
export interface OpenSignature {
	reference: RefType;
	body: SigBody;
}

function shortType(typeName: string): string {
	// "0x2::coin::Coin" → "coin::Coin"
	const parts = typeName.split('::');
	return parts.length >= 2
		? parts.slice(-2).join('::')
		: typeName;
}

function formatBody(b: SigBody, full: boolean): string {
	switch (b.$kind) {
		case 'vector':
			return `vector<${b.vector ? formatBody(b.vector, full) : '?'}>`;
		case 'datatype': {
			if (!b.datatype) return 'datatype';
			const name = full
				? b.datatype.typeName
				: shortType(b.datatype.typeName);
			const args = b.datatype.typeParameters.map((t) =>
				formatBody(t, full),
			);
			return args.length
				? `${name}<${args.join(', ')}>`
				: name;
		}
		case 'typeParameter':
			return `T${b.index ?? ''}`;
		default:
			return b.$kind; // u64, bool, address, unknown, …
	}
}

/**
 * Human-readable signature. `full=false` (default) abbreviates type names for
 * the UI (`&mut coin::Coin<sui::SUI>`); `full=true` keeps the complete
 * `0x…::module::Type` ids (used when feeding the AI).
 */
export function formatParam(
	sig: OpenSignature,
	full = false,
): string {
	const prefix =
		sig.reference === 'mutable'
			? '&mut '
			: sig.reference === 'immutable'
				? '&'
				: '';
	return `${prefix}${formatBody(sig.body, full)}`;
}

function fullTypeName(b: SigBody): string | null {
	return b.$kind === 'datatype'
		? (b.datatype?.typeName ?? null)
		: null;
}

function isCoinLike(typeName: string): boolean {
	return (
		typeName.endsWith('::coin::Coin') ||
		typeName.endsWith('::balance::Balance') ||
		typeName.endsWith('::token::Token')
	);
}

function isCapability(typeName: string): boolean {
	const last = typeName.split('::').pop() ?? '';
	return (
		/Cap$/.test(last) ||
		last === 'AdminCap' ||
		last === 'TreasuryCap'
	);
}

/**
 * Indices of a call's type arguments that are COIN TYPES — i.e. the `T` of a
 * `Coin<T>` / `Balance<T>` / `Token<T>` parameter. Derived from the parameter
 * signatures: each such param's first type parameter points (by `index`) at the
 * call's type-argument list. Lets the UI link only genuine coin types to the
 * explorer's coin page, leaving other generics as plain (copyable) text.
 */
export function coinTypeArgIndices(
	parameters: OpenSignature[],
): Set<number> {
	const set = new Set<number>();
	for (const p of parameters) {
		const b = p.body;
		if (b.$kind !== 'datatype' || !b.datatype) continue;
		if (!isCoinLike(b.datatype.typeName)) continue;
		const tp = b.datatype.typeParameters[0];
		if (
			tp &&
			tp.$kind === 'typeParameter' &&
			typeof tp.index === 'number'
		)
			set.add(tp.index);
	}
	return set;
}

// Sui's account-balance feature (0x2::funds_accumulator::Withdrawal): a value
// passed by the PTB that authorizes withdrawing up to its `limit` from the
// owner's account balance. Same drain risk as a coin, bounded by `limit`.
function isAccountWithdrawal(typeName: string): boolean {
	return typeName.endsWith(
		'::funds_accumulator::Withdrawal',
	);
}

export interface AssessedParam {
	signature: string;
	risk: ParamRisk;
	/** Set whenever `risk !== 'none'`. */
	kind?: ParamKind;
	reason?: string;
}

/** Classify one parameter by its type/reference. */
export function assessParam(
	sig: OpenSignature,
): AssessedParam {
	const signature = formatParam(sig);
	const typeName = fullTypeName(sig.body);

	if (typeName && isCoinLike(typeName)) {
		if (sig.reference === 'mutable')
			return {
				signature,
				risk: 'high',
				kind: 'coin',
				reason:
					'Mutable coin/balance reference — the contract can withdraw any amount; the figure shown is only the current code’s behavior and may change.',
			};
		if (sig.reference === null)
			return {
				signature,
				risk: 'high',
				kind: 'coin',
				reason:
					'Coin/balance passed by value — the entire object is surrendered to the contract.',
			};
	}

	if (typeName && isAccountWithdrawal(typeName))
		return {
			signature,
			risk: 'high',
			kind: 'withdrawal',
			reason:
				'Account-balance withdrawal — authorizes the contract to take up to its limit from your account balance. Check the limit argument; a limit near your full balance is dangerous.',
		};

	if (typeName && isCapability(typeName)) {
		// Borrowed immutably: the Cap only proves authority for THIS call. It
		// isn't transferred and can't be mutated, and every admin entry point
		// needs one — so it's a note, not a risk.
		if (sig.reference === 'immutable')
			return {
				signature,
				risk: 'info',
				kind: 'capability',
				reason:
					'Capability borrowed by reference — this is a Cap-gated (privileged) call. The capability itself is not transferred or modified.',
			};
		return {
			signature,
			risk: 'high',
			kind: 'capability',
			reason:
				sig.reference === 'mutable'
					? 'Mutable capability reference — the contract can modify the capability object itself.'
					: 'Capability passed by value — the capability object is surrendered to the contract.',
		};
	}

	if (sig.reference === 'mutable' && typeName)
		return {
			signature,
			risk: 'medium',
			kind: 'object',
			reason:
				'Mutable object reference — the object’s contents can be changed by the contract.',
		};

	return { signature, risk: 'none' };
}

export interface CallRisk {
	/** Per-parameter assessment, in call order. */
	params: AssessedParam[];
	/** Highest risk across params. */
	overall: ParamRisk;
	/** Count of high-risk params. */
	highCount: number;
	/** High-risk params that hand over SPEND power — coins/balances by value or
	 *  by `&mut`, and account-balance withdrawals. These are what "unbounded
	 *  authorization" means; capabilities are counted separately. */
	drainCount: number;
	/** Capability params, borrowed (`risk: 'info'`) or surrendered (`'high'`). */
	capabilityCount: number;
}

const RANK: Record<ParamRisk, number> = {
	none: 0,
	info: 1,
	medium: 2,
	high: 3,
};

export function assessCall(
	parameters: OpenSignature[],
	/** Target package of the call. Calls into the framework system packages
	 *  (0x1/0x2/0x3) are exempt — they're immutable, so no drain risk. */
	packageId?: string,
): CallRisk {
	const trusted = packageId
		? isFrameworkPackage(packageId)
		: false;
	const params = parameters.map((sig) => {
		const a = assessParam(sig);
		// Framework calls can't be backdoored, so don't raise their params.
		return trusted && a.risk !== 'none'
			? { signature: a.signature, risk: 'none' as const }
			: a;
	});
	let overall: ParamRisk = 'none';
	let highCount = 0;
	let drainCount = 0;
	let capabilityCount = 0;
	for (const p of params) {
		if (RANK[p.risk] > RANK[overall]) overall = p.risk;
		if (p.risk === 'high') highCount++;
		if (
			p.risk === 'high' &&
			(p.kind === 'coin' || p.kind === 'withdrawal')
		)
			drainCount++;
		if (p.kind === 'capability') capabilityCount++;
	}
	return {
		params,
		overall,
		highCount,
		drainCount,
		capabilityCount,
	};
}
