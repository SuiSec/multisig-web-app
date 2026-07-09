// SPDX-License-Identifier: Apache-2.0
// Owned objects (NFTs, UpgradeCap, …) as a card grid. If an object has a Sui
// Display, its image/name render; otherwise we fall back to an identicon.
// Each card links to the explorer and offers a Transfer action.

import { ExternalLink, Send } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { ChainObject } from '../lib/chainObjects';
import {
	explorerObjectUrl,
	type Network,
} from '../lib/constants';
import { ObjectThumb } from './ObjectThumb';

export function ObjectsGrid({
	objects,
	network,
	address,
}: {
	objects: ChainObject[];
	network: string;
	address: string;
}) {
	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
			{objects.map((o) => {
				const label = o.name ?? o.typeLabel;
				return (
					<div
						key={o.id}
						className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card"
					>
						<a
							href={explorerObjectUrl(
								o.id,
								network as Network,
							)}
							target="_blank"
							rel="noreferrer noopener"
							className="block aspect-square w-full overflow-hidden bg-muted"
						>
							<div className="flex h-full w-full items-center justify-center">
								<ObjectThumb
									id={o.id}
									label={label}
									imageUrl={o.imageUrl}
									fill
									className="transition group-hover:scale-[1.03]"
								/>
							</div>
						</a>
						<div className="flex flex-1 flex-col gap-2 p-3">
							<div className="min-w-0">
								<a
									href={explorerObjectUrl(
										o.id,
										network as Network,
									)}
									target="_blank"
									rel="noreferrer noopener"
									className="flex items-center gap-1.5 hover:text-primary"
								>
									<span className="truncate text-[13px] font-semibold">
										{label}
									</span>
									<ExternalLink className="h-3 w-3 flex-none text-faint" />
								</a>
								<div className="truncate font-mono text-[11px] text-faint">
									{o.typeLabel}
								</div>
							</div>
							<Link
								to={`/multisig/${address}/propose?object=${o.id}&label=${encodeURIComponent(label)}`}
								className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-semibold transition hover:border-primary/60 hover:bg-accent"
							>
								<Send className="h-3.5 w-3.5" />
								Transfer
							</Link>
						</div>
					</div>
				);
			})}
		</div>
	);
}
