// SPDX-License-Identifier: Apache-2.0
// Portions adapted from Mysten Labs' Sagat (Apache-2.0).

export const CONFIG = {
	AUTH_EXPIRY_MINUTES: 30,
	COPY_FEEDBACK_DURATION: 2000,
	REFETCH_INTERVAL: 60000,
	STALE_TIME: 300000,
	MAX_MEMBERS: 10,
	MIN_MEMBERS: 2,
	MIN_THRESHOLD: 1,
	DEFAULT_NETWORK: 'testnet' as const,
	DEFAULT_PAGE_SIZE: 20,
	// Prefer SuiVision (https://suivision.xyz). Network is a subdomain
	// (mainnet has none); tx pages live under /txblock/<digest>.
	EXPLORER_URLS: {
		mainnet: 'https://suivision.xyz',
		testnet: 'https://testnet.suivision.xyz',
	},
} as const;

export type Network = keyof typeof CONFIG.EXPLORER_URLS;

// Persisted selected network. main.tsx seeds dApp-kit's defaultNetwork from
// this on load; the Topbar switcher writes it so the choice survives reload.
export const STORAGE_NETWORK_KEY = 'msw:network';

export function explorerTxUrl(
	digest: string,
	network: Network,
): string {
	return `${CONFIG.EXPLORER_URLS[network]}/txblock/${digest}`;
}

export function explorerObjectUrl(
	id: string,
	network: Network,
): string {
	return `${CONFIG.EXPLORER_URLS[network]}/object/${id}`;
}

export function explorerPackageUrl(
	id: string,
	network: Network,
): string {
	return `${CONFIG.EXPLORER_URLS[network]}/package/${id}?tab=Code`;
}

export function explorerAddressUrl(
	address: string,
	network: Network,
): string {
	return `${CONFIG.EXPLORER_URLS[network]}/account/${address}`;
}

export function explorerCoinUrl(
	coinType: string,
	network: Network,
): string {
	return `${CONFIG.EXPLORER_URLS[network]}/coin/${coinType}`;
}
