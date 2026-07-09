// SPDX-License-Identifier: Apache-2.0
// Pushes the signed-in wallet's multisig list to the MultiSig browser extension
// (if installed). The extension's content script reads this window message
// (origin-gated) and mirrors it into extension storage — so the extension never
// needs to reach the wallet or carry a cross-site cookie. Public data only
// (addresses + composite public keys; no private keys).

import { useCurrentNetwork } from '@mysten/dapp-kit-react';
import { useEffect } from 'react';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { useUserMultisigs } from '../hooks/multisigs';

// Must match extension/lib/protocol.ts → APP_TO_EXT.
const APP_TO_EXT = 'msw:app->ext';

export function ExtensionSync() {
	const network = useCurrentNetwork();
	const { isCurrentAddressAuthenticated } = useApiAuth();
	const { data: multisigs } = useUserMultisigs();

	useEffect(() => {
		if (!isCurrentAddressAuthenticated || !multisigs)
			return;
		window.postMessage(
			{
				channel: APP_TO_EXT,
				type: 'multisigs',
				network,
				multisigs: multisigs.map((m) => ({
					address: m.address,
					name: m.name ?? '',
					publicKey: m.publicKey,
				})),
			},
			window.location.origin,
		);
	}, [isCurrentAddressAuthenticated, multisigs, network]);

	return null;
}
