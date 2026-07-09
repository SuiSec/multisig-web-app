// SPDX-License-Identifier: Apache-2.0

import { formatAddress } from '@mysten/sui/utils';
import {
	ArrowLeftRight,
	Boxes,
	ChevronDown,
	Clock,
	Coins,
	LayoutGrid,
	Mail,
	Plus,
	Settings,
	Users,
	UsersRound,
	Wallet,
	type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
	NavLink,
	useLocation,
	useNavigate,
} from 'react-router-dom';

import { useUserMultisigs } from '../hooks/multisigs';
import { cn } from '../lib/utils';
import { Avatar } from './ui/kit';

function useActiveMultisig() {
	const { pathname } = useLocation();
	const m = pathname.match(/^\/multisig\/(0x[0-9a-fA-F]+)/);
	return m?.[1] ?? null;
}

export function Sidebar() {
	const active = useActiveMultisig();
	const { data: multisigs } = useUserMultisigs();
	const current = multisigs?.find(
		(m) => m.address === active,
	);

	return (
		<aside className="hidden w-[238px] shrink-0 flex-col border-r border-border bg-sidebar px-4 py-5 md:flex">
			{/* Brand */}
			<div className="flex items-center gap-2.5 px-2 pb-5">
				<img
					src="/logo.png"
					alt="MultiSig"
					className="h-8 w-8"
				/>
				<span className="font-display text-[17px] font-semibold tracking-[0.3px]">
					MultiSig
				</span>
			</div>

			{/* Wallet selector */}
			<MultisigSwitcher
				active={active}
				currentName={current?.name}
			/>

			{/* Nav */}
			<nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto">
				{active && (
					<>
						<Item
							to={`/multisig/${active}`}
							end
							icon={Wallet}
						>
							Overview
						</Item>
						<Item
							to={`/multisig/${active}/assets`}
							icon={Coins}
						>
							Assets
						</Item>
						<Item
							to={`/multisig/${active}/transactions`}
							icon={ArrowLeftRight}
						>
							Transactions
						</Item>
						<Item
							to={`/multisig/${active}/pending`}
							icon={Clock}
						>
							Pending
						</Item>
						<Item
							to={`/multisig/${active}/members`}
							icon={UsersRound}
						>
							Members
						</Item>
						<Item
							to={`/multisig/${active}/contracts`}
							icon={Boxes}
						>
							Contracts
						</Item>
						<Item
							to={`/multisig/${active}/settings`}
							icon={Settings}
						>
							Settings
						</Item>
						<div className="my-2.5 border-t border-border-soft" />
					</>
				)}

				<Item to="/" end icon={LayoutGrid}>
					Multisigs
				</Item>
				<Item to="/apps" icon={Users}>
					Connect dApp
				</Item>
				<Item to="/invitations" icon={Mail}>
					Invitations
				</Item>
			</nav>

			{/* Footer action */}
			<NavLink
				to="/create"
				className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
			>
				<Plus className="h-4 w-4" />
				New Multisig
			</NavLink>
			<a
				href="https://x.com/suisecurity"
				target="_blank"
				rel="noreferrer"
				aria-label="Follow @suisecurity on X"
				className="mt-3 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
			>
				<svg
					viewBox="0 0 24 24"
					aria-hidden="true"
					className="h-4 w-4 fill-current"
				>
					<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.733-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
				</svg>
				@suisecurity
			</a>
		</aside>
	);
}

function MultisigSwitcher({
	active,
	currentName,
}: {
	active: string | null;
	currentName?: string | null;
}) {
	const { data: multisigs } = useUserMultisigs();
	const navigate = useNavigate();
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
		document.addEventListener('mousedown', onDoc);
		return () =>
			document.removeEventListener('mousedown', onDoc);
	}, []);

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen((v) => !v)}
				aria-label="Switch multisig"
				className="shadow-card flex w-full items-center gap-2.5 rounded-[10px] border border-border bg-card px-3.5 py-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
			>
				{active ? (
					<Avatar
						seed={active}
						size={26}
						className="rounded-[7px]"
					/>
				) : (
					<span className="h-[26px] w-[26px] flex-none rounded-[7px] bg-gradient-to-br from-success to-primary" />
				)}
				<span className="min-w-0 flex-1">
					<span className="block truncate text-[13px] font-semibold text-foreground">
						{active
							? currentName || 'Multisig'
							: 'All multisigs'}
					</span>
					<span className="block font-mono text-[11px] text-faint">
						{active
							? formatAddress(active)
							: 'Select a vault'}
					</span>
				</span>
				<ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
			</button>
			{open && (
				<div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl">
					<button
						onClick={() => {
							navigate('/');
							setOpen(false);
						}}
						className="w-full px-3.5 py-2 text-left text-sm hover:bg-accent"
					>
						All multisigs
					</button>
					{multisigs?.map((m) => (
						<button
							key={m.address}
							onClick={() => {
								navigate(`/multisig/${m.address}`);
								setOpen(false);
							}}
							className={cn(
								'flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-accent',
								m.address === active && 'bg-accent',
							)}
						>
							<Avatar
								seed={m.address}
								size={24}
								className="rounded-[6px]"
							/>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm">
									{m.name || 'Untitled'}
								</span>
								<span className="block font-mono text-[11px] text-faint">
									{formatAddress(m.address)}
								</span>
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function Item({
	to,
	end,
	icon: Icon,
	children,
}: {
	to: string;
	end?: boolean;
	icon: LucideIcon;
	children: React.ReactNode;
}) {
	return (
		<NavLink
			to={to}
			end={end}
			className={({ isActive }) =>
				cn(
					'flex items-center gap-3 rounded-lg border-l-2 px-3.5 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					isActive
						? 'border-primary bg-primary/[0.09] font-semibold text-foreground'
						: 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
				)
			}
		>
			{({ isActive }) => (
				<>
					<Icon
						className={cn(
							'h-[18px] w-[18px]',
							isActive ? 'text-primary' : 'text-faint',
						)}
					/>
					{children}
				</>
			)}
		</NavLink>
	);
}
