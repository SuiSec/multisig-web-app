// SPDX-License-Identifier: Apache-2.0
// Provider wiring adapted from Mysten Labs' Sagat (Apache-2.0).

import {
	createDAppKit,
	DAppKitProvider,
} from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { registerWalletConnectWallet } from '@mysten/walletconnect-wallet';
import {
	QueryClient,
	QueryClientProvider,
} from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';

import App from './App.tsx';
import { ThemedToaster } from './components/ThemeToggle.tsx';
import { ApiAuthProvider } from './contexts/ApiAuthContext.tsx';
import {
	CONFIG,
	STORAGE_NETWORK_KEY,
} from './lib/constants.ts';
import { getRpcBaseUrl } from './lib/rpc.ts';
// Self-hosted fonts (Fontsource) — no external CDN, so no user-IP leak to
// Google and no breakage under a strict CSP / Walrus portal. Weights mirror
// what the old Google Fonts <link> requested. Families are referenced by name
// in index.css (--font-display / --font-sans / --font-mono).
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './index.css';

type SuiNetwork = 'testnet' | 'mainnet';

const storedNetwork =
	(localStorage.getItem(
		STORAGE_NETWORK_KEY,
	) as SuiNetwork) || CONFIG.DEFAULT_NETWORK;

// gRPC-web endpoint per network. We deliberately avoid JSON-RPC entirely;
// Sui serves gRPC-web on the same fullnode host. We only serve mainnet and
// testnet. The endpoint is user-pinnable (lib/rpc.ts): the whole security
// review only means what the simulating fullnode says, so a user can point at
// a fullnode they trust. Clients are created once here, so a changed pin takes
// effect on reload (the RPC settings UI reloads after saving).
const newClient = (network: SuiNetwork) =>
	new SuiGrpcClient({
		network,
		baseUrl: getRpcBaseUrl(network),
	});

export const dAppKit = createDAppKit({
	networks: ['mainnet', 'testnet'],
	createClient: (network) => newClient(network),
	defaultNetwork: storedNetwork,
});

// Register types for hook type inference
declare module '@mysten/dapp-kit-react' {
	interface Register {
		dAppKit: typeof dAppKit;
	}
}

// WalletConnect-as-user-wallet is optional; only register when configured.
const wcProjectId = import.meta.env
	.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
if (wcProjectId) {
	registerWalletConnectWallet({
		projectId: wcProjectId,
		getClient: (chain) => newClient(chain as SuiNetwork),
		metadata: {
			walletName: 'WalletConnect',
			icon: 'https://walletconnect.org/walletconnect-logo.png',
			enabled: true,
			id: 'walletconnect',
		},
	});
}

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: false,
			refetchOnWindowFocus: false,
			staleTime: CONFIG.STALE_TIME,
		},
	},
});

ReactDOM.createRoot(
	document.getElementById('root')!,
).render(
	<React.StrictMode>
		<HelmetProvider>
			<ThemeProvider
				attribute="class"
				defaultTheme="light"
				enableSystem
			>
				<QueryClientProvider client={queryClient}>
					<DAppKitProvider dAppKit={dAppKit}>
						<ApiAuthProvider>
							<BrowserRouter>
								<App />
							</BrowserRouter>
						</ApiAuthProvider>
					</DAppKitProvider>
				</QueryClientProvider>
				<ThemedToaster />
			</ThemeProvider>
		</HelmetProvider>
	</React.StrictMode>,
);
