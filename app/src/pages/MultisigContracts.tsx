// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import {
	Archive,
	ArrowUpCircle,
	Boxes,
	CheckCircle2,
	UploadCloud,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { MultisigHeader } from '../components/MultisigHeader';
import {
	Badge,
	Button,
	Card,
	EmptyState,
	ErrorState,
	Spinner,
} from '../components/ui/kit';
import { useGetMultisig } from '../hooks/multisigs';
import { useMultisigPackages } from '../hooks/packages';

export function MultisigContracts() {
	const { address } = useParams<{ address: string }>();
	const { data: multisig } = useGetMultisig(address);
	const {
		data: packages,
		isLoading,
		isError,
		error,
	} = useMultisigPackages(address);

	return (
		<div className="space-y-6">
			{multisig && (
				<MultisigHeader
					multisig={multisig}
					action={false}
				/>
			)}

			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-sm font-semibold">
					Smart contracts
				</h2>
				<div className="flex flex-wrap gap-2">
					<Link to={`/multisig/${address}/publish`}>
						<Button className="px-3 py-2 text-sm">
							<UploadCloud className="h-4 w-4" />
							Publish
						</Button>
					</Link>
					<Link to={`/multisig/${address}/upgrade`}>
						<Button
							variant="ghost"
							className="px-3 py-2 text-sm"
						>
							<ArrowUpCircle className="h-4 w-4" />
							Upgrade
						</Button>
					</Link>
					<Link to={`/multisig/${address}/archive`}>
						<Button
							variant="ghost"
							className="px-3 py-2 text-sm"
						>
							<Archive className="h-4 w-4" />
							Archive &amp; verify
						</Button>
					</Link>
				</div>
			</div>

			{isError ? (
				<ErrorState
					title="Couldn't load packages"
					message={(error as Error).message}
				/>
			) : isLoading ? (
				<Spinner label="Loading packages…" />
			) : !packages || packages.length === 0 ? (
				<EmptyState
					icon={<Boxes className="h-8 w-8" />}
					title="No packages yet"
					body="Publish a Move package, then archive its source to Walrus to make it verifiable."
				/>
			) : (
				<Card className="overflow-hidden">
					{packages.map((p, i) => (
						<Link
							key={`${p.packageId}-${p.network}`}
							to={`/package/${p.packageId}?network=${p.network}`}
							className={
								'flex items-center gap-3 px-5 py-4 transition hover:bg-accent ' +
								(i > 0 ? 'border-t border-border-soft' : '')
							}
						>
							<div className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-gradient-to-br from-primary to-[#1D4ED8] text-white">
								<Boxes className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className="truncate text-sm font-semibold">
										{p.name || 'Move package'}
									</span>
									{p.version != null && (
										<span className="font-mono text-xs text-muted-foreground">
											v{p.version}
										</span>
									)}
								</div>
								<span className="font-mono text-xs text-muted-foreground">
									{formatAddress(p.packageId)}
								</span>
							</div>
							<Badge tone="ok" dot>
								<CheckCircle2 className="h-3 w-3" />{' '}
								archived
							</Badge>
						</Link>
					))}
				</Card>
			)}
		</div>
	);
}
