// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { Check, ChevronDown, Server } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { STORAGE_NETWORK_KEY } from '../lib/constants';
import {
	clearRpcBaseUrl,
	getRpcHost,
	isCustomRpc,
	setRpcBaseUrl,
	validateRpcUrl,
} from '../lib/rpc';
import { cn } from '../lib/utils';
import { ThemeToggle } from './ThemeToggle';
import { WalletMenu } from './WalletMenu';

function networkLabel(network: string): string {
	return `Sui ${network.charAt(0).toUpperCase()}${network.slice(1)}`;
}

function NetworkMenu() {
	const network = useCurrentNetwork();
	const dappKit = useDAppKit();
	const networks = dappKit.networks as readonly string[];

	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function onDoc(e: MouseEvent) {
			if (
				ref.current &&
				!ref.current.contains(e.target as Node)
			)
				setOpen(false);
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setOpen(false);
		}
		document.addEventListener('mousedown', onDoc);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDoc);
			document.removeEventListener('keydown', onKey);
		};
	}, []);

	function select(n: string) {
		setOpen(false);
		if (n === network) return;
		dappKit.switchNetwork(n as never);
		// Persist so main.tsx restores this choice as defaultNetwork on reload.
		localStorage.setItem(STORAGE_NETWORK_KEY, n);
	}

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen((v) => !v)}
				aria-label="Switch network"
				className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			>
				<span className="h-[7px] w-[7px] flex-none rounded-full bg-success" />
				{networkLabel(network)}
				<ChevronDown className="h-3.5 w-3.5" />
			</button>
			{open && (
				<div className="absolute right-0 top-full z-50 mt-1.5 min-w-44 overflow-hidden rounded-lg border border-border bg-popover py-1.5 shadow-xl">
					<p className="border-b border-border px-3 pb-2 pt-1 text-xs font-medium text-muted-foreground">
						Network
					</p>
					{networks.map((n) => (
						<button
							key={n}
							onClick={() => select(n)}
							className={cn(
								'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent',
								n === network && 'text-primary',
							)}
						>
							{networkLabel(n)}
							{n === network && (
								<Check className="h-3.5 w-3.5" />
							)}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function RpcMenu() {
	const network = useCurrentNetwork() as
		'mainnet' | 'testnet';
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState('');
	const [error, setError] = useState<string | null>(null);
	const ref = useRef<HTMLDivElement>(null);

	const host = getRpcHost(network);
	const custom = isCustomRpc(network);

	useEffect(() => {
		function onDoc(e: MouseEvent) {
			if (
				ref.current &&
				!ref.current.contains(e.target as Node)
			)
				setOpen(false);
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setOpen(false);
		}
		document.addEventListener('mousedown', onDoc);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDoc);
			document.removeEventListener('keydown', onKey);
		};
	}, []);

	// A pinned endpoint only takes effect on the next client build (startup), so
	// apply by reloading — same pattern as the network switcher's persistence.
	function save() {
		try {
			validateRpcUrl(draft);
			setRpcBaseUrl(network, draft);
			setError(null);
			location.reload();
		} catch (e) {
			setError((e as Error).message);
		}
	}
	function reset() {
		clearRpcBaseUrl(network);
		location.reload();
	}

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => {
					setDraft('');
					setError(null);
					setOpen((v) => !v);
				}}
				aria-label="Simulation RPC endpoint"
				title={`Simulations run against ${host}`}
				className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] text-muted-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			>
				<Server className="h-3.5 w-3.5" />
				<span className="hidden max-w-[180px] truncate sm:inline">
					{host}
				</span>
				{custom && (
					<span className="rounded bg-primary/15 px-1 text-[10px] font-semibold uppercase text-primary">
						pinned
					</span>
				)}
				<ChevronDown className="h-3.5 w-3.5" />
			</button>
			{open && (
				<div className="absolute right-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-lg border border-border bg-popover p-3 shadow-xl">
					<p className="text-xs font-medium text-foreground">
						Simulation endpoint
					</p>
					<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
						The security review is only as trustworthy as
						the fullnode that simulates it. A compromised
						endpoint can return a misleading result. Pin a
						fullnode you trust.
					</p>
					<div className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
						{host}
						{!custom && (
							<span className="ml-1 not-italic text-muted-foreground/70">
								(Mysten default)
							</span>
						)}
					</div>
					<input
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && save()}
						placeholder="https://your-fullnode:443"
						spellCheck={false}
						autoComplete="off"
						className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-foreground outline-none focus:border-primary"
					/>
					{error && (
						<p className="mt-1 text-[11px] text-destructive">
							{error}
						</p>
					)}
					<div className="mt-2.5 flex items-center gap-2">
						<button
							onClick={save}
							disabled={!draft.trim()}
							className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
						>
							Pin &amp; reload
						</button>
						{custom && (
							<button
								onClick={reset}
								className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-accent"
							>
								Reset to default
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export function Topbar() {
	return (
		<header className="sticky top-0 z-30 flex h-[66px] items-center justify-end gap-3.5 border-b border-border bg-card/80 px-6 backdrop-blur md:px-8">
			<RpcMenu />
			<NetworkMenu />
			<ThemeToggle />
			<WalletMenu />
		</header>
	);
}
