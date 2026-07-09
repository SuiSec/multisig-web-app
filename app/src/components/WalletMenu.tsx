// SPDX-License-Identifier: Apache-2.0

import {
	useCurrentAccount,
	useCurrentWallet,
	useDAppKit,
	useWallets,
} from '@mysten/dapp-kit-react';
import { formatAddress } from '@mysten/sui/utils';
import {
	ChevronDown,
	LogOut,
	ShieldCheck,
	Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useApiAuth } from '../contexts/ApiAuthContext';
import { cn } from '../lib/utils';

export function WalletMenu() {
	const account = useCurrentAccount();
	const wallets = useWallets();
	const currentWallet = useCurrentWallet();
	const dappKit = useDAppKit();
	const {
		isCurrentAddressAuthenticated,
		signAndConnect,
		isConnecting,
		disconnect,
	} = useApiAuth();

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

	async function connect(name: string) {
		try {
			const wallet = wallets.find((w) => w.name === name);
			if (!wallet) return;
			await dappKit.connectWallet({ wallet });
			setOpen(false);
		} catch (e) {
			toast.error((e as Error).message);
		}
	}

	async function fullDisconnect() {
		try {
			await disconnect();
		} finally {
			await dappKit.disconnectWallet();
			setOpen(false);
		}
	}

	if (!account) {
		return (
			<div className="relative" ref={ref}>
				<button
					onClick={() => setOpen((v) => !v)}
					className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					<Wallet className="h-4 w-4" />
					Connect Wallet
					<ChevronDown className="h-3.5 w-3.5" />
				</button>
				{open && (
					<Dropdown>
						<DropdownTitle>Choose Wallet</DropdownTitle>
						{wallets.map((w) => (
							<button
								key={w.name}
								onClick={() => connect(w.name)}
								className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
							>
								{w.icon && (
									<img
										src={w.icon}
										alt=""
										aria-hidden="true"
										width={20}
										height={20}
										className="h-5 w-5 rounded"
									/>
								)}
								{w.name}
							</button>
						))}
						{wallets.length === 0 && (
							<p className="px-3 py-3 text-center text-xs text-muted-foreground">
								No wallets found. Install a Sui wallet
								(e.g.&nbsp;Slush) to continue.
							</p>
						)}
					</Dropdown>
				)}
			</div>
		);
	}

	const authed = isCurrentAddressAuthenticated;

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen((v) => !v)}
				aria-label="Account menu"
				className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			>
				<span
					className={cn(
						'h-2 w-2 rounded-full',
						authed ? 'bg-primary' : 'bg-warning',
					)}
				/>
				<span className="font-mono text-xs">
					{formatAddress(account.address)}
				</span>
				<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
			</button>
			{open && (
				<Dropdown>
					{!authed && (
						<div className="px-3 py-2">
							<p className="mb-2 text-xs text-muted-foreground">
								Verify address ownership to load your
								multisigs.
							</p>
							<button
								onClick={() => signAndConnect()}
								disabled={isConnecting}
								className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
							>
								<ShieldCheck className="h-3.5 w-3.5" />
								{isConnecting
									? 'Signing…'
									: 'Verify Ownership'}
							</button>
						</div>
					)}
					{authed && (
						<div className="px-3 py-2 text-xs text-primary">
							<ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
							Ownership verified
						</div>
					)}
					{currentWallet?.accounts &&
						currentWallet.accounts.length > 1 && (
							<>
								<Divider />
								<DropdownTitle>
									Switch Account
								</DropdownTitle>
								{currentWallet.accounts.map((a) => (
									<button
										key={a.address}
										onClick={() =>
											dappKit.switchAccount({ account: a })
										}
										className={cn(
											'flex w-full items-center px-3 py-2 text-left font-mono text-xs hover:bg-accent',
											a.address === account.address &&
												'text-primary',
										)}
									>
										{formatAddress(a.address)}
									</button>
								))}
							</>
						)}
					<Divider />
					<button
						onClick={fullDisconnect}
						className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
					>
						<LogOut className="h-4 w-4" />
						Disconnect
					</button>
				</Dropdown>
			)}
		</div>
	);
}

function Dropdown({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="absolute right-0 top-full z-50 mt-1.5 min-w-56 overflow-hidden rounded-lg border border-border bg-popover py-1.5 shadow-xl">
			{children}
		</div>
	);
}

function DropdownTitle({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<p className="border-b border-border px-3 pb-2 pt-1 text-xs font-medium text-muted-foreground">
			{children}
		</p>
	);
}

function Divider() {
	return <div className="my-1 border-t border-border" />;
}
