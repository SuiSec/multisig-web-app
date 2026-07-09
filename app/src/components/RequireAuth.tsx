// SPDX-License-Identifier: Apache-2.0

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ShieldCheck, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { Button, EmptyState } from './ui/kit';

export function RequireAuth({
	children,
}: {
	children: ReactNode;
}) {
	const account = useCurrentAccount();
	const {
		isCurrentAddressAuthenticated,
		signAndConnect,
		isConnecting,
	} = useApiAuth();

	if (!account) {
		return (
			<EmptyState
				icon={<Wallet className="h-8 w-8" />}
				title="Connect your wallet"
				body="Connect the member wallet you use for this multisig to continue."
			/>
		);
	}

	if (!isCurrentAddressAuthenticated) {
		return (
			<EmptyState
				icon={<ShieldCheck className="h-8 w-8" />}
				title="Verify address ownership"
				body="Sign a message to prove you own this address. The relay never holds keys — this only authenticates your session."
				action={
					<Button
						onClick={() => signAndConnect()}
						loading={isConnecting}
					>
						<ShieldCheck className="h-4 w-4" />
						Verify ownership
					</Button>
				}
			/>
		);
	}

	return <>{children}</>;
}
