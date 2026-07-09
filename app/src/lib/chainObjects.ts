// SPDX-License-Identifier: Apache-2.0
// Owned non-coin objects (NFTs, UpgradeCap, …) for a multisig, read from the
// chain via Sui GraphQL. We keep only objects with the `store` ability
// (`hasPublicTransfer` — i.e. real key+store transferable assets) and surface
// their Display metadata (name/image/description) when present. gRPC's
// ObjectResponse has no Display, which is why this goes through GraphQL.

import { suiGraphqlRequest } from './suiGraphql';

export interface ChainObject {
	id: string;
	type: string; // full type repr
	typeLabel: string; // short "module::Name"
	name: string | null;
	imageUrl: string | null;
	description: string | null;
}

export interface ChainObjectPage {
	items: ChainObject[];
	nextCursor: string | null;
	hasMore: boolean;
}

const QUERY = `query Objs($owner: SuiAddress!, $after: String) {
  objects(filter: { owner: $owner }, first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      address
      asMoveObject {
        hasPublicTransfer
        contents { type { repr } display { output } }
      }
    }
  }
}`;

interface ObjNode {
	address: string;
	asMoveObject: {
		hasPublicTransfer?: boolean;
		contents: {
			type: { repr: string };
			display: {
				output: Record<string, unknown> | null;
			} | null;
		} | null;
	} | null;
}

function isCoin(typeRepr: string): boolean {
	return /::coin::Coin(<|$)/.test(typeRepr);
}

/** "0x…2::package::UpgradeCap<…>" → "package::UpgradeCap". */
function shortType(repr: string): string {
	const base = repr.split('<')[0];
	const parts = base.split('::');
	return parts.length >= 2
		? parts.slice(-2).join('::')
		: base;
}

// Display image urls are often ipfs://; map to a public gateway so <img> loads.
function normalizeImage(url: unknown): string | null {
	if (typeof url !== 'string' || !url) return null;
	if (url.startsWith('ipfs://'))
		return `https://ipfs.io/ipfs/${url.slice('ipfs://'.length)}`;
	return url;
}

function pick(
	out: Record<string, unknown> | null,
	...keys: string[]
): string | null {
	if (!out) return null;
	for (const k of keys) {
		const v = out[k];
		if (typeof v === 'string' && v.trim()) return v;
	}
	return null;
}

export interface ObjectDisplay {
	type: string;
	typeLabel: string;
	name: string | null;
	imageUrl: string | null;
	description: string | null;
}

// The current Sui GraphQL `ObjectFilter` has no `objectIds`, so a by-id lookup
// goes through `multiGetObjects(keys:)` (keys are `ObjectKey { address }`).
const BY_IDS_QUERY = `query Disp($keys: [ObjectKey!]!) {
  multiGetObjects(keys: $keys) {
    address
    asMoveObject { contents { type { repr } display { output } } }
  }
}`;

/**
 * Type + Display metadata for specific object ids (id → display). Used by the
 * transaction-effects view to enrich objects whose ownership changes. Objects
 * not found (e.g. freshly created in the simulated tx, so not yet on chain) come
 * back as null and are simply absent from the result — the caller shows what it
 * has. Position/NFT objects with a registered Display return name/image_url.
 */
export async function fetchObjectsDisplay(
	network: string,
	ids: string[],
): Promise<Record<string, ObjectDisplay>> {
	if (ids.length === 0) return {};
	const data = await suiGraphqlRequest<{
		multiGetObjects: (ObjNode | null)[];
	}>(network, BY_IDS_QUERY, {
		keys: ids.map((address) => ({ address })),
	});

	const out: Record<string, ObjectDisplay> = {};
	for (const n of data.multiGetObjects) {
		if (!n) continue;
		const mo = n.asMoveObject;
		if (!mo || !mo.contents) continue;
		const type = mo.contents.type.repr;
		const display = mo.contents.display?.output ?? null;
		out[n.address] = {
			type,
			typeLabel: shortType(type),
			name: pick(display, 'name', 'title'),
			imageUrl: normalizeImage(
				pick(display, 'image_url', 'img_url', 'image'),
			),
			description: pick(display, 'description'),
		};
	}
	return out;
}

/** A page of the multisig's transferable (key+store) non-coin objects. */
export async function fetchMultisigObjects(
	network: string,
	address: string,
	after: string | null = null,
): Promise<ChainObjectPage> {
	const data = await suiGraphqlRequest<{
		objects: {
			pageInfo: {
				hasNextPage: boolean;
				endCursor: string | null;
			};
			nodes: ObjNode[];
		};
	}>(network, QUERY, { owner: address, after });

	const items: ChainObject[] = [];
	for (const n of data.objects.nodes) {
		const mo = n.asMoveObject;
		if (!mo || !mo.contents) continue;
		const type = mo.contents.type.repr;
		// Only real key+store assets, and not coins (shown separately).
		if (!mo.hasPublicTransfer || isCoin(type)) continue;
		const out = mo.contents.display?.output ?? null;
		items.push({
			id: n.address,
			type,
			typeLabel: shortType(type),
			name: pick(out, 'name', 'title'),
			imageUrl: normalizeImage(
				pick(out, 'image_url', 'img_url', 'image'),
			),
			description: pick(out, 'description'),
		});
	}

	return {
		items,
		nextCursor: data.objects.pageInfo.endCursor,
		hasMore: data.objects.pageInfo.hasNextPage,
	};
}
