// SPDX-License-Identifier: Apache-2.0
// Inline "Swap SUI → WAL" panel shown on the publish / upgrade / archive pages
// so the proposer can top up WAL (to pay Walrus storage) without leaving the
// flow. WAL only trades on Cetus mainnet, so the panel renders on mainnet only.
// The heavy Cetus bundle stays code-split behind a disclosure — it loads only
// when the user expands the panel, not on every page visit.

import { useCurrentNetwork } from '@mysten/dapp-kit-react';
import { ChevronDown, Coins } from 'lucide-react';
import { useTheme } from 'next-themes';
import { lazy, Suspense, useEffect, useState } from 'react';

import { cn } from '../lib/utils';
import { Card, Spinner } from './ui/kit';

// Code-split the heavy Cetus bundle, but expose the same import promise so we
// can warm it on hover/focus — otherwise the first click only kicks off the
// chunk download and the panel feels like it needs a second click to open.
const importWidget = () => import('./CetusSwapWidget');
const CetusSwapWidget = lazy(importWidget);

export function WalSwapPanel() {
	const network = useCurrentNetwork();
	const { resolvedTheme } = useTheme();
	const [open, setOpen] = useState(false);

	// The Cetus widget bundles Radix Themes, which rewrites the `light`/`dark`
	// class on <html> to its own appearance — the same class next-themes owns,
	// so opening/closing the widget hijacks the app's dark/light mode. While the
	// widget is mounted, pin <html> back to the app theme (and restore on close),
	// so Cetus can't clobber it. next-themes doesn't observe the DOM, so this is
	// the only thing keeping the two in sync.
	useEffect(() => {
		if (!open || !resolvedTheme) return;
		const root = document.documentElement;
		const pin = () => {
			if (root.classList.contains(resolvedTheme)) return;
			root.classList.remove('light', 'dark');
			root.classList.add(resolvedTheme);
		};
		pin();
		const observer = new MutationObserver(pin);
		observer.observe(root, {
			attributes: true,
			attributeFilter: ['class'],
		});
		return () => {
			observer.disconnect();
			pin(); // re-assert after Cetus unmounts
		};
	}, [open, resolvedTheme]);

	// Swap-to-WAL only exists on mainnet; hide the panel everywhere else.
	if (network !== 'mainnet') return null;

	return (
		<Card className="overflow-hidden p-0">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				onMouseEnter={() => void importWidget()}
				onFocus={() => void importWidget()}
				className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-foreground transition hover:bg-accent"
			>
				<Coins className="h-4 w-4 text-primary" />
				Need WAL? Swap SUI → WAL
				<span className="ml-auto text-xs text-muted-foreground">
					Powered by Cetus · your own wallet
				</span>
				<ChevronDown
					className={cn(
						'h-4 w-4 text-muted-foreground transition-transform',
						open && 'rotate-180',
					)}
				/>
			</button>
			{open && (
				<div className="border-t border-border p-1">
					<Suspense
						fallback={<Spinner label="Loading swap…" />}
					>
						<CetusSwapWidget />
					</Suspense>
				</div>
			)}
		</Card>
	);
}
