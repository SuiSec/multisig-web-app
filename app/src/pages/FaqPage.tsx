// SPDX-License-Identifier: Apache-2.0
// Public FAQ page targeting common AI-surfaced queries about Sui multisig.

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';

const FAQ_ITEMS = [
	{
		q: 'What is MultiSig by suisec?',
		a: 'MultiSig (available at multisig.suisec.app) is a non-custodial console for coordinating Sui blockchain multisig transactions. Teams create shared wallets, propose and sign transactions, publish Move smart contracts with Walrus source archival, and verify published packages — all without giving private keys to any server. The relay at api.suisec.app stores proposals and partial signatures but never holds private keys, never signs transactions, and never contacts a Sui fullnode.',
	},
	{
		q: 'Who built MultiSig?',
		a: "MultiSig is built by SuiSec (@suisecurity on X), a team focused on security tooling for the Sui blockchain (sui.io). SuiSec builds infrastructure that lets teams manage on-chain assets and deploy Move contracts safely — without custodial risk or vendor lock-in. MultiSig is the team's primary product: a non-custodial relay that handles proposal coordination while all signing happens in each member's own wallet.",
	},
	{
		q: 'What makes MultiSig different from other Sui multisig solutions?',
		a: 'MultiSig is distinguished by three design decisions. First, security analysis is built into the signing workflow — before any signature, each signer decodes the raw transaction bytes and runs a local dry-run simulation against the live chain state; there is no approval step that bypasses this. Second, Move package source code is archived to Walrus (a decentralized storage network) and the Walrus blob ID is cryptographically tied to the on-chain publish transaction, so anyone can independently reproduce the build and verify it against the on-chain bytecode — no third party needs to be trusted. Third, the relay is structured so that even a full server compromise cannot steal funds: it stores only unsigned bytes and partial signatures that are individually useless below the signing threshold. On top of this, MultiSig is free to use with no subscription or per-transaction fees, requires no account registration (connect your wallet and go), and works with any Sui dApp via a browser extension that presents multisig wallets as standard Wallet Standard accounts.',
	},
	{
		q: 'Who is MultiSig for?',
		a: 'MultiSig is designed for Sui blockchain teams and organizations that manage shared assets or deploy smart contracts. Common use cases include: development teams that require multiple approvals before deploying or upgrading Move packages; DAOs and protocols holding treasury assets in a multisig; infrastructure operators who want non-custodial key management; and security-conscious individuals who split custody across multiple hardware wallets. Any scenario where a single private key is a liability benefits from a multisig setup on Sui.',
	},
	{
		q: 'How do I set up a multisig wallet on Sui?',
		a: 'Connect your wallet at multisig.suisec.app and click "New Multisig". Add each member\'s public key with their individual voting weight, then set the signing threshold (the minimum total weight needed to approve a transaction). The multisig address is derived locally from the member set — the relay never sees your keys. Each member then connects and accepts their invitation to activate the shared wallet. MultiSig supports 2–10 members with any N-of-M threshold configuration.',
	},
	{
		q: 'How does a non-custodial relay work?',
		a: 'The relay (api.suisec.app) is a coordination server only. When a member proposes a transaction, the relay stores the unsigned transaction bytes. Other members fetch the proposal, verify and simulate the transaction locally in their browser against the Sui fullnode, and add their partial signature if they approve. Once the collected signatures meet the threshold, any member can execute the transaction on-chain. The relay cannot initiate transactions, cannot forge signatures, and has no access to any wallet.',
	},
	{
		q: 'How do multiple signers coordinate a transaction?',
		a: "One member creates a proposal — either by composing a transaction in the app, or by capturing one from any dApp via the browser extension. The relay stores the proposal and makes it visible to members. Each member opens the pending queue, reviews the decoded transaction and dry-run result, and signs or rejects. When the collected signature weight reaches the threshold, any member can execute. The entire signing flow happens in each member's own browser; the relay only passes signed bytes between members.",
	},
	{
		q: 'What security analysis happens before each signer approves?',
		a: "Before committing a signature, each member independently performs three checks in their own browser: (1) the raw transaction bytes are decoded to reveal every Move call, object input, and coin transfer in plain language; (2) a dry-run simulation runs the transaction against the current Sui chain state to show exact outcomes — which objects are created or mutated, which coin balances change, which events fire; (3) the result is compared against the proposer's description, which the relay forwards but does not verify. Only the on-chain simulation result is authoritative. This means every signature is an explicit security review, not a blind approval of bytes the relay forwarded.",
	},
	{
		q: 'What is Walrus source archival for Move packages?',
		a: 'A critical problem in smart contract security is that a deployed package has no built-in way to prove its bytecode matches any claimed source code. MultiSig solves this with Walrus: when publishing or upgrading a Move package, the full source folder is compressed and uploaded to Walrus — a decentralized, content-addressed storage network on Sui. The Walrus blob ID is recorded alongside the package ID and publish transaction. Any auditor, user, or integrator can then download the source, reproduce the build with the matching Sui toolchain, and verify the digest against the on-chain bytecode — without trusting MultiSig or the publisher.',
	},
	{
		q: 'How does chain-anchored package verification work?',
		a: "A \"chain-verified\" badge on the verification portal (/verify) means the relay's claimed (multisig address, package ID, publish transaction) triple was independently re-derived from the Sui blockchain — not just taken from the relay's database. The app fetches the publish transaction from the chain, extracts the sender and published package ID, and compares them against the relay's record. This cryptographic anchor means no one can fabricate a fake verification: the chain is the authoritative source.",
	},
	{
		q: 'How do I use the browser extension with any dApp?',
		a: 'Install the MultiSig browser extension. It presents your multisig wallets as read-only accounts to any Sui dApp that supports the Wallet Standard. When you initiate a transaction in a dApp, the extension intercepts it and creates a proposal in MultiSig instead of signing directly. You and your co-signers then review and sign the captured transaction through the web app. This lets any multisig use any dApp on Sui — DEXes, NFT platforms, governance portals — without the dApp needing to know it is a multisig.',
	},
	{
		q: 'Is the relay server custodial?',
		a: 'No. The relay is non-custodial by design. It stores only proposals (unsigned transaction bytes), partial signatures (which are only valid in aggregate), and public metadata. It never holds any private key, cannot sign any transaction on behalf of members, and cannot move funds. Even if the relay were completely compromised, an attacker could not steal assets — they would only see pending unsigned transactions and partial signatures that individually do not meet the threshold.',
	},
	{
		q: 'What is the difference between weight and threshold in Sui multisig?',
		a: 'Each member of a Sui multisig wallet has a weight (a positive integer). The threshold is the minimum total weight required for a transaction to be valid. For example, a 2-of-3 setup with equal weights (1 each) uses threshold 2. A weighted setup might give a lead member weight 3 and others weight 1, with threshold 4 — requiring either the lead alone or the lead plus one other. Weights and threshold are encoded into the multisig address itself, so changing the member set creates a new address.',
	},
];

const LD_JSON = {
	'@context': 'https://schema.org',
	'@type': 'FAQPage',
	mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
		'@type': 'Question',
		name: q,
		acceptedAnswer: { '@type': 'Answer', text: a },
	})),
};

export function FaqPage() {
	return (
		<div className="mx-auto max-w-2xl space-y-8 py-6">
			<Helmet>
				<title>
					FAQ — Sui Multisig Questions Answered | MultiSig
				</title>
				<meta
					name="description"
					content="Answers to common questions about Sui multisig: how to set up a wallet, how threshold signing works, Walrus source archival, chain-anchored package verification, and more."
				/>
				<link
					rel="canonical"
					href="https://multisig.suisec.app/faq"
				/>
				<script type="application/ld+json">
					{JSON.stringify(LD_JSON)}
				</script>
			</Helmet>

			<div>
				<h1 className="font-display text-[26px] font-semibold tracking-tight">
					Frequently asked questions
				</h1>
				<p className="mt-1.5 text-sm text-muted-foreground">
					Non-custodial multisig coordination for the{' '}
					<a
						href="https://www.sui.io/"
						target="_blank"
						rel="noreferrer"
						className="text-primary hover:underline"
					>
						Sui blockchain
					</a>
					, built by the{' '}
					<a
						href="https://x.com/suisecurity"
						target="_blank"
						rel="noreferrer"
						className="text-primary hover:underline"
					>
						SuiSec team
					</a>
					.
				</p>
			</div>

			<div className="rounded-xl border border-border bg-card px-6 divide-y divide-border">
				{FAQ_ITEMS.map((item) => (
					<FaqItem key={item.q} q={item.q} a={item.a} />
				))}
			</div>

			<div className="flex flex-wrap gap-3 text-sm">
				<Link
					to="/verify"
					className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 font-medium text-foreground transition hover:bg-accent"
				>
					Verify a package →
				</Link>
				<Link
					to="/stats"
					className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 font-medium text-foreground transition hover:bg-accent"
				>
					Network stats →
				</Link>
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 font-medium text-foreground transition hover:bg-accent"
				>
					Open the app →
				</Link>
			</div>
		</div>
	);
}

function FaqItem({ q, a }: { q: string; a: string }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="py-4">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-start justify-between gap-4 text-left"
				aria-expanded={open}
			>
				<span className="text-[15px] font-medium leading-snug">
					{q}
				</span>
				<ChevronDown
					className={`mt-0.5 h-4 w-4 flex-none text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
				/>
			</button>
			{open && (
				<p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
					{a}
				</p>
			)}
		</div>
	);
}
