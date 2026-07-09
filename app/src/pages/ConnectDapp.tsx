// SPDX-License-Identifier: Apache-2.0

import {
	Boxes,
	Chrome,
	MousePointerClick,
	PackageCheck,
	Puzzle,
} from 'lucide-react';

import { Badge, Card } from '../components/ui/kit';

const EXAMPLES = [
	{ name: 'Cetus', url: 'https://app.cetus.zone/' },
	{ name: 'LeafSheep', url: 'https://app.leafsheep.xyz/' },
	{ name: 'Navi', url: 'https://app.naviprotocol.io/' },
	{ name: 'Scallop', url: 'https://app.scallop.io/' },
	{ name: 'Haedal', url: 'https://www.haedal.xyz/vault' },
];

// The extension is live on the Chrome Web Store. We also link the signed
// GitHub release for users who prefer to load it unpacked.
const EXTENSION_STORE_URL =
	'https://chromewebstore.google.com/detail/multisig-%E2%80%94-multisig-conne/mjhkjghgmjmekccblclokocjpcnahfie';
const EXTENSION_RELEASE_URL =
	'https://github.com/SuiSec/MultiSigConnect/releases/tag/v1.0.2';

export function ConnectDapp() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-display text-[22px] font-semibold tracking-tight">
					Connect to any dApp
				</h1>
				<p className="max-w-2xl text-sm text-muted-foreground">
					The MultiSig browser extension presents your
					multisig as a read-only wallet on any Sui dApp. It
					holds no keys: a transaction you trigger on a dApp
					is captured and routed here for multisig approval.
				</p>
			</div>

			<Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-start gap-2.5">
					<Puzzle className="mt-0.5 h-5 w-5 flex-none text-primary" />
					<div>
						<div className="text-sm font-medium">
							Get the MultiSig extension
						</div>
						<p className="text-xs text-muted-foreground">
							Now on the Chrome Web Store — one-click
							install. Prefer to load it unpacked? Grab the
							signed{' '}
							<a
								href={EXTENSION_RELEASE_URL}
								target="_blank"
								rel="noreferrer"
								className="font-medium underline underline-offset-2 hover:text-foreground"
							>
								v1.0.2
							</a>{' '}
							GitHub build.
						</p>
					</div>
				</div>
				<a
					href={EXTENSION_STORE_URL}
					target="_blank"
					rel="noreferrer"
					className="inline-flex flex-none items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					<Chrome className="h-4 w-4" />
					Add to Chrome
				</a>
			</Card>

			<div className="grid gap-4 sm:grid-cols-2">
				<Step
					n={1}
					icon={<Puzzle className="h-4 w-4" />}
					title="Install the extension"
					body="Add it from the Chrome Web Store in one click. Or download the v1.0.2 build, unzip it, and load the chrome-mv3 folder via chrome://extensions → Load unpacked."
				/>
				<Step
					n={2}
					icon={<PackageCheck className="h-4 w-4" />}
					title="Set your multisig"
					body="Open the extension popup and paste the multisig address + this app’s URL."
				/>
				<Step
					n={3}
					icon={<MousePointerClick className="h-4 w-4" />}
					title="Pick MultiSig on a dApp"
					body="On any dApp’s connect-wallet list, choose “MultiSig”. Your multisig is the account."
				/>
				<Step
					n={4}
					icon={<Boxes className="h-4 w-4" />}
					title="Approve as a proposal"
					body="When the dApp asks to sign, the transaction is captured and opens here for review and signatures."
				/>
			</div>

			<Card className="space-y-3 p-5">
				<div className="flex items-center gap-2 text-sm font-medium">
					<Chrome className="h-4 w-4 text-primary" />
					Try it on a dApp
					<Badge tone="muted">opens in a new tab</Badge>
				</div>
				<div className="flex flex-wrap gap-2">
					{EXAMPLES.map((d) => (
						<a
							key={d.name}
							href={d.url}
							target="_blank"
							rel="noreferrer"
							className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{d.name}
						</a>
					))}
				</div>
				<p className="text-[11px] text-muted-foreground">
					With the extension installed and configured, these
					dApps will list MultiSig as a wallet.
					WalletConnect intake is planned as a no-extension
					fallback.
				</p>
			</Card>
		</div>
	);
}

function Step({
	n,
	icon,
	title,
	body,
}: {
	n: number;
	icon: React.ReactNode;
	title: string;
	body: string;
}) {
	return (
		<Card className="p-4">
			<div className="mb-2 flex items-center gap-2">
				<span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
					{n}
				</span>
				<span className="flex items-center gap-1.5 text-sm font-medium">
					{icon}
					{title}
				</span>
			</div>
			<p className="text-xs text-muted-foreground">
				{body}
			</p>
		</Card>
	);
}
