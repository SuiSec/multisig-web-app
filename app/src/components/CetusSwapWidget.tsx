// SPDX-License-Identifier: Apache-2.0
// Embedded Cetus swap terminal, themed to the Vault design system and locked to
// SUI → WAL (to fund Walrus storage). Uses the app's connected wallet
// (independentWallet: false) — Cetus never holds keys. Default-exported so
// callers can React.lazy() it and keep the large Cetus tree code-split.

import { CetusSwap } from '@cetusprotocol/terminal';

import '@cetusprotocol/terminal/dist/style.css';

import { useCurrentNetwork } from '@mysten/dapp-kit-react';
import { useTheme } from 'next-themes';

import { SUI_TYPE, WAL_TYPE } from '../lib/coins';

// Vault design tokens (index.css) → Cetus WidgetTheme, per mode.
const LIGHT_THEME = {
	bg_primary: '#FFFFFF',
	primary: '#2563EB',
	text_primary: '#0B1A33',
	text_secondary: '#5B6B85',
	success: '#059669',
	warning: '#D97706',
	error: '#DC2626',
	btn_text: '#FFFFFF',
};

const DARK_THEME = {
	bg_primary: '#0F1B30',
	primary: '#3B82F6',
	text_primary: '#E8EEF8',
	text_secondary: '#8FA3C0',
	success: '#34D399',
	warning: '#FBBF24',
	error: '#F87171',
	btn_text: '#FFFFFF',
};

export default function CetusSwapWidget() {
	const network = useCurrentNetwork();
	const { resolvedTheme } = useTheme();
	const dark = resolvedTheme === 'dark';

	return (
		<CetusSwap
			initProps={{
				defaultFromToken: SUI_TYPE,
				defaultToToken:
					WAL_TYPE[network] ?? WAL_TYPE.mainnet,
				independentWallet: false,
				themeType: dark ? 'Dark' : 'Light',
				theme: dark ? DARK_THEME : LIGHT_THEME,
			}}
		/>
	);
}
