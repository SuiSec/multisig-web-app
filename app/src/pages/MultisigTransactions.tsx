// SPDX-License-Identifier: Apache-2.0
// Executed-transaction history — read directly from the chain (Sui GraphQL),
// not from the relay. The relay deletes proposals once executed; the chain is
// the source of truth for what actually happened.

import { useCurrentNetwork } from '@mysten/dapp-kit-react';
import {
	CheckCircle2,
	ExternalLink,
	Receipt,
	XCircle,
} from 'lucide-react';
import { useParams } from 'react-router-dom';

import { MultisigHeader } from '../components/MultisigHeader';
import {
	Badge,
	Button,
	Card,
	EmptyState,
	ErrorState,
	Spinner,
} from '../components/ui/kit';
import { useMultisigChainTransactions } from '../hooks/chainHistory';
import { useGetMultisig } from '../hooks/multisigs';
import { graphqlAvailable } from '../lib/chainHistory';
import {
	explorerTxUrl,
	type Network,
} from '../lib/constants';

function shortDigest(d: string): string {
	return `${d.slice(0, 8)}…${d.slice(-6)}`;
}

function netGasSui(
	gas: {
		computation: string;
		storage: string;
		rebate: string;
	} | null,
): string {
	if (!gas) return '—';
	const mist =
		BigInt(gas.computation) +
		BigInt(gas.storage) -
		BigInt(gas.rebate);
	const sui = Number(mist) / 1e9;
	return `${sui.toLocaleString(undefined, { maximumFractionDigits: 6 })} SUI`;
}

export function MultisigTransactions() {
	const { address } = useParams<{ address: string }>();
	const network = useCurrentNetwork();
	const {
		data: multisig,
		isLoading,
		isError,
		error,
	} = useGetMultisig(address);

	const available = graphqlAvailable(network);
	const txs = useMultisigChainTransactions(
		available ? address : undefined,
		network,
	);

	if (isError)
		return (
			<ErrorState
				title="Couldn't load this multisig"
				message={(error as Error).message}
			/>
		);
	if (isLoading || !multisig)
		return <Spinner label="Loading multisig…" />;

	const items =
		txs.data?.pages.flatMap((p) => p.items) ?? [];

	return (
		<div className="space-y-6">
			<MultisigHeader multisig={multisig} />

			<div>
				<div className="mb-3 flex items-center justify-between">
					<h2 className="text-sm font-semibold">
						Executed transactions
					</h2>
					<Badge tone="muted">on-chain · {network}</Badge>
				</div>

				{!available ? (
					<EmptyState
						icon={<Receipt className="h-8 w-8" />}
						title="History not available on this network"
						body="On-chain transaction history is read via Sui GraphQL, which isn't hosted for this network."
					/>
				) : txs.isLoading ? (
					<Spinner label="Reading on-chain history…" />
				) : txs.isError ? (
					<ErrorState
						title="Couldn't read on-chain history"
						message={(txs.error as Error).message}
					/>
				) : items.length === 0 ? (
					<EmptyState
						icon={<Receipt className="h-8 w-8" />}
						title="No executed transactions yet"
						body="Transactions that reach threshold and execute on-chain will appear here, read straight from the chain."
					/>
				) : (
					<Card className="divide-y divide-border p-0">
						{items.map((tx) => {
							const ok = tx.status === 'SUCCESS';
							return (
								<a
									key={tx.digest}
									href={explorerTxUrl(
										tx.digest,
										network as Network,
									)}
									target="_blank"
									rel="noreferrer noopener"
									className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-accent"
								>
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-mono text-[13px] font-medium">
												{shortDigest(tx.digest)}
											</span>
											{ok ? (
												<Badge tone="ok">
													<CheckCircle2 className="h-3 w-3" />
													success
												</Badge>
											) : (
												<Badge tone="danger">
													<XCircle className="h-3 w-3" />
													{tx.status?.toLowerCase() ??
														'failed'}
												</Badge>
											)}
										</div>
										<div className="mt-0.5 text-[12px] text-muted-foreground">
											{tx.timestampMs
												? new Date(
														tx.timestampMs,
													).toLocaleString()
												: 'pending finality'}
											{tx.checkpoint != null && (
												<> · ckpt {tx.checkpoint}</>
											)}
										</div>
									</div>
									<div className="flex items-center gap-3 text-right">
										<span className="font-mono text-[12px] text-muted-foreground">
											gas {netGasSui(tx.gas)}
										</span>
										<ExternalLink className="h-3.5 w-3.5 flex-none text-faint" />
									</div>
								</a>
							);
						})}
					</Card>
				)}

				{txs.hasNextPage && (
					<div className="mt-4 flex justify-center">
						<Button
							variant="outline"
							loading={txs.isFetchingNextPage}
							onClick={() => txs.fetchNextPage()}
						>
							Load older
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
