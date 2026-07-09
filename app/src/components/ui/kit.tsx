// SPDX-License-Identifier: Apache-2.0
// UI primitives for MultiSig — the "Vault" design system.

import { AlertCircle, Loader2 } from 'lucide-react';
import type {
	ButtonHTMLAttributes,
	InputHTMLAttributes,
	ReactNode,
} from 'react';

import { cn } from '../../lib/utils';

type Variant =
	| 'primary'
	| 'outline'
	| 'ghost'
	| 'danger'
	| 'success'
	| 'subtle';

const variants: Record<Variant, string> = {
	primary:
		'bg-primary text-primary-foreground hover:opacity-90',
	outline:
		'border border-border bg-card hover:bg-accent text-foreground',
	ghost:
		'border border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
	danger:
		'bg-destructive/[0.08] text-destructive border border-destructive/40 hover:bg-destructive/[0.14]',
	success:
		'bg-success text-white hover:opacity-90 dark:text-[#06281C]',
	subtle:
		'bg-secondary text-secondary-foreground hover:opacity-90',
};

export function Button({
	variant = 'primary',
	loading,
	className,
	children,
	disabled,
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: Variant;
	loading?: boolean;
}) {
	return (
		<button
			className={cn(
				'inline-flex touch-manipulation items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
				variants[variant],
				className,
			)}
			disabled={disabled || loading}
			{...props}
		>
			{loading && (
				<Loader2 className="h-4 w-4 animate-spin" />
			)}
			{children}
		</button>
	);
}

export function Card({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				'shadow-card rounded-xl border border-border bg-card',
				className,
			)}
		>
			{children}
		</div>
	);
}

export function Input({
	className,
	...props
}: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			className={cn(
				'w-full rounded-lg border border-border bg-field px-3.5 py-3 text-sm outline-none transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring',
				className,
			)}
			{...props}
		/>
	);
}

export function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<label className="block space-y-2">
			<span className="block text-[12.5px] font-medium text-muted-foreground">
				{label}
			</span>
			{children}
			{hint && (
				<span className="block text-[11px] text-faint">
					{hint}
				</span>
			)}
		</label>
	);
}

type Tone = 'ok' | 'warn' | 'danger' | 'muted' | 'info';

const toneStyles: Record<
	Tone,
	{ cls: string; dot: string }
> = {
	ok: {
		cls: 'bg-success/10 text-success border-success/25',
		dot: 'bg-success',
	},
	warn: {
		cls: 'bg-warning/10 text-warning border-warning/25',
		dot: 'bg-warning',
	},
	danger: {
		cls: 'bg-destructive/10 text-destructive border-destructive/25',
		dot: 'bg-destructive',
	},
	info: {
		cls: 'bg-primary/10 text-primary border-primary/25',
		dot: 'bg-primary',
	},
	muted: {
		cls: 'bg-muted text-muted-foreground border-border',
		dot: 'bg-faint',
	},
};

export function Badge({
	tone = 'muted',
	dot = false,
	children,
}: {
	tone?: Tone;
	dot?: boolean;
	children: ReactNode;
}) {
	const t = toneStyles[tone];
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
				t.cls,
			)}
		>
			{dot && (
				<span
					className={cn('h-1.5 w-1.5 rounded-full', t.dot)}
				/>
			)}
			{children}
		</span>
	);
}

// Five fixed gradient ramps (per design spec).
const AVATAR_RAMPS = [
	'linear-gradient(135deg,#3B82F6,#1D4ED8)',
	'linear-gradient(135deg,#34D399,#059669)',
	'linear-gradient(135deg,#7C5CFF,#3B82F6)',
	'linear-gradient(135deg,#FBBF24,#F59E0B)',
	'linear-gradient(135deg,#F87171,#DC2626)',
];

export function rampFor(seed: string): string {
	let h = 0;
	for (let i = 0; i < seed.length; i++)
		h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	return AVATAR_RAMPS[h % AVATAR_RAMPS.length];
}

export function Avatar({
	seed,
	size = 34,
	className,
}: {
	seed: string;
	/** Kept for API compatibility; identicons are seed-only. */
	label?: string;
	size?: number;
	className?: string;
}) {
	// All avatars are GitHub-style identicons now — same look as the header,
	// default circular (callers can override the shape via className).
	return (
		<Identicon
			seed={seed}
			size={size}
			className={cn('rounded-full', className)}
		/>
	);
}

// First-letter badge on a seeded gradient — the fallback for ASSET logos
// (coins/objects) that have no on-chain icon/Display image.
export function InitialBadge({
	seed,
	label,
	size = 34,
	className,
}: {
	seed: string;
	label?: string;
	size?: number;
	className?: string;
}) {
	const initial = (label ?? seed)
		.replace(/^0x/, '')
		.charAt(0)
		.toUpperCase();
	return (
		<div
			className={cn(
				'flex flex-none items-center justify-center rounded-full font-display font-bold text-white',
				className,
			)}
			style={{
				width: size,
				height: size,
				background: rampFor(seed),
				fontSize: size * 0.4,
			}}
		>
			{initial}
		</div>
	);
}

// GitHub-style identicon: a horizontally-mirrored 5×5 pixel grid + a hue,
// both derived deterministically from the seed (FNV-1a → mulberry32 PRNG, no
// deps). Same seed → same pattern, so an address always renders identically.
function identiconData(seed: string): {
	cells: boolean[];
	fg: string;
	bg: string;
} {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	let s = h >>> 0;
	const rand = () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const hue = Math.floor(rand() * 360);
	const src: boolean[] = [];
	for (let i = 0; i < 15; i++) src.push(rand() > 0.5); // 5 rows × 3 cols
	const cells: boolean[] = [];
	for (let row = 0; row < 5; row++)
		for (let col = 0; col < 5; col++) {
			const sc = col < 3 ? col : 4 - col; // mirror cols 3,4 ← 1,0
			cells.push(src[row * 3 + sc]);
		}
	return {
		cells,
		fg: `hsl(${hue} 58% 52%)`,
		bg: `hsl(${hue} 58% 52% / 0.12)`,
	};
}

export function Identicon({
	seed,
	size = 34,
	className,
}: {
	seed: string;
	size?: number;
	className?: string;
}) {
	const { cells, fg, bg } = identiconData(seed);
	return (
		<div
			className={cn(
				'flex flex-none overflow-hidden rounded-md',
				className,
			)}
			style={{ width: size, height: size, background: bg }}
		>
			<svg
				width={size}
				height={size}
				viewBox="-0.5 -0.5 6 6"
				shapeRendering="crispEdges"
				aria-hidden
			>
				{cells.map((on, i) =>
					on ? (
						<rect
							key={i}
							x={i % 5}
							y={Math.floor(i / 5)}
							width={1}
							height={1}
							fill={fg}
						/>
					) : null,
				)}
			</svg>
		</div>
	);
}

/**
 * Overlapping signer avatars + mono `signed / total`.
 * The count turns green at/above the threshold, amber below — the
 * emotional core of the multisig UX.
 */
export function SignerProgress({
	signed,
	total,
	ready,
	seeds,
}: {
	signed: number;
	total: number;
	ready?: boolean;
	seeds?: string[];
}) {
	const isReady = ready ?? signed >= total;
	const dots = Array.from({ length: total });
	return (
		<div className="flex items-center gap-2.5">
			<div className="flex">
				{dots.map((_, i) => {
					const filled = i < signed;
					return (
						<span
							key={i}
							className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-card text-[11px] font-bold"
							style={{
								marginLeft: i ? -8 : 0,
								background: filled
									? rampFor(seeds?.[i] ?? String(i))
									: 'var(--track, var(--border))',
								color: filled ? '#fff' : 'var(--faint)',
							}}
						>
							{filled ? '✓' : ''}
						</span>
					);
				})}
			</div>
			<span
				className={cn(
					'font-mono text-[13px] font-semibold',
					isReady ? 'text-success' : 'text-warning',
				)}
			>
				{signed} / {total}
			</span>
		</div>
	);
}

export function Spinner({ label }: { label?: string }) {
	return (
		<div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
			<Loader2 className="h-4 w-4 animate-spin" />
			{label ?? 'Loading…'}
		</div>
	);
}

export function ErrorState({
	title = 'Something went wrong',
	message,
	action,
}: {
	title?: string;
	message?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/[0.06] px-6 py-12 text-center">
			<div className="mb-3 text-destructive">
				<AlertCircle className="h-8 w-8" />
			</div>
			<p className="font-display font-semibold">{title}</p>
			{message && (
				<p className="mt-1 max-w-md text-sm text-muted-foreground">
					{message}
				</p>
			)}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}

export function EmptyState({
	icon,
	title,
	body,
	action,
}: {
	icon?: ReactNode;
	title: string;
	body?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
			{icon && (
				<div className="mb-3 text-faint">{icon}</div>
			)}
			<p className="font-display font-semibold">{title}</p>
			{body && (
				<p className="mt-1 max-w-sm text-sm text-muted-foreground">
					{body}
				</p>
			)}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}
