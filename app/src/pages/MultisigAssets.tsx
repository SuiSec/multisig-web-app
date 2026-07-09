// SPDX-License-Identifier: Apache-2.0
// Assets = fungible coins (with logos, via gRPC + coin metadata) AND owned
// key+store objects (NFTs, UpgradeCap, … with Display, via Sui GraphQL).

import { useCurrentNetwork } from '@mysten/dapp-kit-react';
import {
	Boxes,
	CircleDollarSign,
	Coins,
} from 'lucide-react';
import { useParams } from 'react-router-dom';

import { AssetsList } from '../components/AssetsList';
import { MultisigHeader } from '../components/MultisigHeader';
import { ObjectsGrid } from '../components/ObjectsGrid';
import {
	Button,
	Card,
	EmptyState,
	ErrorState,
	Spinner,
} from '../components/ui/kit';
import { useBalances } from '../hooks/balances';
import { useMultisigObjects } from '../hooks/chainObjects';
import { useGetMultisig } from '../hooks/multisigs';
import { useMultisigTokens } from '../hooks/tokens';
import { graphqlAvailable } from '../lib/suiGraphql';

export function MultisigAssets() {
	const { address } = useParams<{ address: string }>();
	const network = useCurrentNetwork();
	const {
		data: multisig,
		isLoading,
		isError: msigError,
		error: msigErr,
	} = useGetMultisig(address);
	const {
		data: assets,
		isLoading: loadingAssets,
		isError,
		error,
	} = useBalances(address);

	const objectsAvailable = graphqlAvailable(network);
	const tokens = useMultisigTokens(
		objectsAvailable ? address : undefined,
	);
	const objects = useMultisigObjects(
		objectsAvailable ? address : undefined,
		network,
	);
	const objectItems =
		objects.data?.pages.flatMap((p) => p.items) ?? [];

	if (msigError)
		return (
			<ErrorState
				title="Couldn't load this multisig"
				message={(msigErr as Error).message}
			/>
		);
	if (isLoading || !multisig)
		return <Spinner label="Loading multisig…" />;

	return (
		<div className="space-y-8">
			<MultisigHeader multisig={multisig} />

			{/* Coins */}
			<div>
				<h2 className="mb-3 text-sm font-semibold">
					Coins
				</h2>
				{loadingAssets && (
					<Spinner label="Reading on-chain balances…" />
				)}
				{isError && (
					<Card className="p-5 text-sm text-destructive">
						Failed to read balances:{' '}
						{(error as Error).message}
					</Card>
				)}
				{!loadingAssets &&
					!isError &&
					(assets?.length ?? 0) === 0 && (
						<EmptyState
							icon={<Coins className="h-8 w-8" />}
							title="No coins yet"
							body="Coins transferred to this multisig will appear here."
						/>
					)}
				{(assets?.length ?? 0) > 0 && (
					<AssetsList assets={assets!} address={address} />
				)}
			</div>

			{/* Tokens (closed-loop): 0x2::token::Token<T> */}
			<div>
				<h2 className="mb-1 text-sm font-semibold">
					Tokens
				</h2>
				<p className="mb-3 text-xs text-faint">
					Closed-loop tokens (<code>0x2::token::Token</code>
					) this multisig holds. Their transfers are
					governed by each token’s on-chain policy, so
					they’re shown read-only.
				</p>
				{!objectsAvailable ? (
					<EmptyState
						icon={<CircleDollarSign className="h-8 w-8" />}
						title="Tokens unavailable on this network"
						body="Closed-loop tokens are read via Sui GraphQL, which isn’t hosted for this network."
					/>
				) : tokens.isLoading ? (
					<Spinner label="Reading closed-loop tokens…" />
				) : tokens.isError ? (
					<Card className="p-5 text-sm text-destructive">
						Failed to read tokens:{' '}
						{(tokens.error as Error).message}
					</Card>
				) : (tokens.data?.length ?? 0) === 0 ? (
					<EmptyState
						icon={<CircleDollarSign className="h-8 w-8" />}
						title="No closed-loop tokens"
						body="Closed-loop Token<T> balances this multisig holds will appear here."
					/>
				) : (
					<Card>
						<AssetsList assets={tokens.data!} />
					</Card>
				)}
			</div>

			{/* Objects (key + store): NFTs, UpgradeCap, … */}
			<div>
				<h2 className="mb-3 text-sm font-semibold">
					Objects
				</h2>
				{!objectsAvailable ? (
					<EmptyState
						icon={<Boxes className="h-8 w-8" />}
						title="Objects unavailable on this network"
						body="Owned objects are read via Sui GraphQL, which isn't hosted for this network."
					/>
				) : objects.isLoading ? (
					<Spinner label="Reading owned objects…" />
				) : objects.isError ? (
					<Card className="p-5 text-sm text-destructive">
						Failed to read objects:{' '}
						{(objects.error as Error).message}
					</Card>
				) : objectItems.length === 0 ? (
					<EmptyState
						icon={<Boxes className="h-8 w-8" />}
						title="No objects yet"
						body="Transferable (key + store) objects this multisig owns — NFTs, UpgradeCap, etc. — will appear here."
					/>
				) : (
					<>
						<ObjectsGrid
							objects={objectItems}
							network={network}
							address={address!}
						/>
						{objects.hasNextPage && (
							<div className="mt-4 flex justify-center">
								<Button
									variant="outline"
									loading={objects.isFetchingNextPage}
									onClick={() => objects.fetchNextPage()}
								>
									Load more
								</Button>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
