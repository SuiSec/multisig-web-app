// SPDX-License-Identifier: Apache-2.0

export const SUI_TYPE = '0x2::sui::SUI';

// WAL (Walrus token) coin types, used to pay for Walrus storage. Verify the
// per-network package id against the current Walrus deployment before relying
// on it for production swaps.
export const WAL_TYPE: Record<string, string> = {
	mainnet:
		'0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
	testnet:
		'0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL',
};

export function isSuiType(coinType: string): boolean {
	return (
		coinType === SUI_TYPE || coinType.endsWith('::sui::SUI')
	);
}

/** Last segment of a coin type, e.g. `0x2::sui::SUI` → `SUI`. */
export function coinSymbolFromType(
	coinType: string,
): string {
	return coinType.split('::').slice(-1)[0] ?? coinType;
}

/**
 * Format a raw on-chain amount (smallest unit) into a human string.
 * `decimals === null` means metadata was unavailable — we show the raw
 * integer rather than guessing a scale.
 */
export function formatUnits(
	raw: bigint,
	decimals: number | null,
	maxFractionDigits = 4,
): string {
	if (decimals === null) return raw.toLocaleString();
	if (decimals === 0) return raw.toLocaleString();
	const neg = raw < 0n;
	const abs = neg ? -raw : raw;
	const base = 10n ** BigInt(decimals);
	const whole = abs / base;
	const frac = abs % base;
	const fracStr = frac
		.toString()
		.padStart(decimals, '0')
		.slice(0, maxFractionDigits)
		.replace(/0+$/, '');
	return (
		(neg ? '−' : '') +
		whole.toLocaleString() +
		(fracStr ? `.${fracStr}` : '')
	);
}
