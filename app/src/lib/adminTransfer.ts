// SPDX-License-Identifier: Apache-2.0
// Detect privileged / high-value object transfers in a simulated transaction's
// effects: an object whose simulated output owner is an address OTHER than this
// multisig, AND whose type is one of:
//   • 0x2::package::UpgradeCap        → contract-upgrade authority
//   • a type whose name contains "admin" → admin authority
//   • a DeFi position / ownership-cap / burn-proof — a VALUE-BEARING receipt:
//     a Cetus/BlueFin/FlowX/Turbos LP position, a SuiLend ObligationOwnerCap,
//     a Cetus LP burn proof, etc. Whoever holds it controls the underlying
//     funds, so handing it to another address moves real value out of the vault.
// Handing any of these to a different address is high-severity, so every member
// must see it before signing.
//
// Reads the gRPC simulate result, which the dry-run runs with `objectTypes: true`
// (see hooks/analysis.ts). On @mysten/sui's gRPC client that yields, on success,
// `{ Transaction: { objectTypes: Record<objectId, type>, effects.changedObjects } }`
// — both synchronous — where each changed object carries its `outputOwner`.

import { normalizeSuiAddress } from '@mysten/sui/utils';

export interface PrivilegedTransfer {
	objectId: string;
	/** Full Move type, e.g. `0x2::package::UpgradeCap`. */
	type: string;
	/** Last struct segment, e.g. `UpgradeCap` / `Position`. */
	typeName: string;
	/** Protocol name for a recognized DeFi type (e.g. `Cetus CLMM`), else null. */
	protocol: string | null;
	/** Address the object would be owned by after execution. */
	newOwner: string;
	reason: 'upgrade-cap' | 'admin' | 'value-object';
}

// Loose shapes for the bits of the simulate result we read.
interface ChangedOwner {
	$kind?: string;
	AddressOwner?: string;
	ConsensusAddressOwner?: { owner?: string };
}
interface ChangedObject {
	objectId?: string;
	inputOwner?: ChangedOwner | null;
	outputOwner?: ChangedOwner | null;
	/** 'Created' | 'Deleted' | 'None' (mutated) — matches lib/txEffects.ts. */
	idOperation?: string;
}
interface SimData {
	Transaction?: {
		objectTypes?: Record<string, string>;
		effects?: { changedObjects?: ChangedObject[] };
	};
}

// Known mainnet DeFi value-bearing object types → protocol label. These are
// receipts whose holder controls real funds — transferring one hands over the
// position/obligation itself. The label is shown to the signer so they can tell
// at a glance which protocol's position is leaving. Heuristics below catch the
// same families on other protocols/networks; this map is the high-confidence,
// human-labeled core.
const KNOWN_VALUE_TYPES = new Map<string, string>([
	[
		'0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::lending_market::ObligationOwnerCap',
		'SuiLend',
	],
	[
		'0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb::position::Position',
		'Cetus CLMM',
	],
	[
		'0x12d73de9a6bc3cb658ec9dc0fe7de2662be1cea5c76c092fcc3606048cdbac27::lp_burn::CetusLPBurnProof',
		'Cetus',
	],
	[
		'0x3492c874c1e3b3e2984e8c41b589e642d4d0a5d6459e5a9cfc2d52fd7c89c267::position::Position',
		'BlueFin',
	],
	[
		'0x25929e7f29e0a30eb4e692952ba1b5b65a3a4d65ab5f2a32e1ba3edcb587f26d::position::Position',
		'FlowX',
	],
	[
		'0x361dd589b98e8fcda9a7ee53b85efabef3569d00416640d2faa516e3801d7ffc::pool::PoolLsp',
		'SuiSwap',
	],
	[
		'0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1::position_nft::TurbosPositionNFT',
		'Turbos',
	],
	[
		'0x5664f9d3fd82c84023870cfbda8ea84e14c8dd56ce557ad2116e0668581a682b::position::Position',
		'Cetus DLMM',
	],
]);

/** Last struct-name segment of a Move type, stripped of any type arguments. */
function structName(type: string): string {
	const base = type.split('<')[0];
	return base.split('::').pop() ?? '';
}

/** 0x2::package::UpgradeCap, in any address form of 0x2. */
function isUpgradeCap(type: string): boolean {
	const base = type.split('<')[0];
	return base.endsWith('::package::UpgradeCap');
}

/** The object's struct name mentions "admin" (case-insensitive). */
function isAdminType(type: string): boolean {
	return /admin/i.test(structName(type));
}

/** A `0x2::coin::Coin<...>`. Plain coin movement is shown elsewhere, not here. */
function isCoinType(type: string): boolean {
	return /::coin::Coin(<|$)/.test(type);
}

/**
 * A value-bearing DeFi receipt: an LP/lending Position, an ownership capability
 * (…OwnerCap), or an LP burn proof. Curated known types plus a name heuristic so
 * new protocols are still caught (false positives are harmless — it only adds a
 * "confirm this is intended" warning, never blocks).
 */
function isValueObjectType(type: string): boolean {
	const base = type.split('<')[0];
	if (KNOWN_VALUE_TYPES.has(base)) return true;
	const name = structName(type);
	return /(Position|PositionNFT|OwnerCap|BurnProof)$/.test(
		name,
	);
}

/** Protocol label for a curated value type, or null for heuristic-only matches. */
function valueProtocol(type: string): string | null {
	return KNOWN_VALUE_TYPES.get(type.split('<')[0]) ?? null;
}

/** Address an output owner assigns the object to, or null if it's not an address owner. */
function ownerAddress(
	owner: ChangedOwner | null | undefined,
): string | null {
	if (!owner) return null;
	if (owner.$kind === 'AddressOwner')
		return owner.AddressOwner ?? null;
	if (owner.$kind === 'ConsensusAddressOwner')
		return owner.ConsensusAddressOwner?.owner ?? null;
	// Shared / Immutable / ObjectOwner — not a transfer to a plain address.
	return null;
}

/**
 * Privileged / high-value objects (UpgradeCap, admin-named, or a DeFi
 * position/cap) that the simulation shows ending up owned by an address other
 * than `multisig`. Empty when the dry-run hasn't run, failed, or moves no such
 * object away from the vault.
 */
export function detectPrivilegedTransfers(
	simData: unknown,
	multisig: string,
): PrivilegedTransfer[] {
	const tx = (simData as SimData | null)?.Transaction;
	const changed = tx?.effects?.changedObjects;
	const types = tx?.objectTypes;
	if (!changed || !types) return [];

	const self = normalizeSuiAddress(multisig);
	const out: PrivilegedTransfer[] = [];

	for (const change of changed) {
		const id = change.objectId;
		if (!id) continue;
		const type = types[id];
		if (!type) continue;

		const upgrade = isUpgradeCap(type);
		const admin = !upgrade && isAdminType(type);
		const value =
			!upgrade && !admin && isValueObjectType(type);
		if (!upgrade && !admin && !value) continue;

		const newOwner = ownerAddress(change.outputOwner);
		if (!newOwner) continue;
		// Staying with the multisig (e.g. a publish that sends the UpgradeCap to the
		// vault, as intended) is not a transfer away — skip it.
		if (normalizeSuiAddress(newOwner) === self) continue;

		out.push({
			objectId: id,
			type,
			typeName: structName(type),
			protocol: value ? valueProtocol(type) : null,
			newOwner,
			reason: upgrade
				? 'upgrade-cap'
				: admin
					? 'admin'
					: 'value-object',
		});
	}
	return out;
}

export interface UnrecognizedTransfer {
	objectId: string;
	/** Full Move type, or null if the simulation didn't report one. */
	type: string | null;
	/** Last struct segment, or "unknown" when the type is unavailable. */
	typeName: string;
	/** Address the object would be owned by after execution. */
	newOwner: string;
}

/**
 * G3 — a non-coin object the multisig OWNS that the simulation shows leaving to
 * another address, whose type the privileged-transfer allowlist did NOT already
 * flag (not an UpgradeCap, admin cap, or known value receipt). The allowlist is
 * finite, so a novel admin/position type would otherwise slip through as a
 * silent green. This is the amber catch-all: "an object we don't recognize is
 * leaving your control — confirm it's intended." Lower severity than
 * {@link detectPrivilegedTransfers} (never blocks), so it stays amber, not red.
 *
 * Scoped to objects whose INPUT owner was this multisig (so newly-created
 * pass-through objects, gas, and coins don't create noise) and whose OUTPUT
 * owner is a different ADDRESS. An object the multisig CONSUMES — burned, wrapped
 * into another object, or turned into a shared object (e.g. redeeming/burning an
 * NFT the vault held) — does not end up owned by another address, so it is NOT a
 * "leaving your control" transfer and is intentionally not flagged.
 */
export function detectUnrecognizedTransfers(
	simData: unknown,
	multisig: string,
): UnrecognizedTransfer[] {
	const tx = (simData as SimData | null)?.Transaction;
	const changed = tx?.effects?.changedObjects;
	if (!changed) return [];
	const types = tx?.objectTypes ?? {};

	const self = normalizeSuiAddress(multisig);
	const out: UnrecognizedTransfer[] = [];

	for (const change of changed) {
		const id = change.objectId;
		if (!id) continue;
		const type = types[id];

		// Consumed by this transaction — burned/deleted. It didn't go to
		// anyone, so it's not a transfer away (redeeming/burning an NFT the
		// multisig held is normal). The output-owner check below also filters
		// these out, but skip explicitly so the intent is unambiguous.
		if (change.idOperation === 'Deleted') continue;

		// Coins are handled by the balance-flow panel; skip them here.
		if (type && isCoinType(type)) continue;
		// Already surfaced (in red) by the privileged-transfer detector.
		if (
			type &&
			(isUpgradeCap(type) ||
				isAdminType(type) ||
				isValueObjectType(type))
		)
			continue;

		// Only an object that ends up owned by a DIFFERENT ADDRESS is a
		// transfer away. No address owner in the output (wrapped into another
		// object, or made shared/immutable) means it was consumed, not sent.
		const newOwner = ownerAddress(change.outputOwner);
		if (!newOwner || normalizeSuiAddress(newOwner) === self)
			continue;
		// Only warn about objects the multisig actually held — not gas, not
		// objects freshly created and forwarded as part of the intended flow.
		const prevOwner = ownerAddress(change.inputOwner);
		if (
			!prevOwner ||
			normalizeSuiAddress(prevOwner) !== self
		)
			continue;

		out.push({
			objectId: id,
			type: type ?? null,
			typeName: type ? structName(type) : 'unknown',
			newOwner,
		});
	}
	return out;
}
