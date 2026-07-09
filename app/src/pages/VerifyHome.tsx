// SPDX-License-Identifier: Apache-2.0
// Public entry to the verification portal: look up any package by id.

import { isValidSuiAddress } from '@mysten/sui/utils';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';

import { Button, Card, Input } from '../components/ui/kit';

export function VerifyHome() {
	const navigate = useNavigate();
	const [id, setId] = useState('');
	const valid = isValidSuiAddress(id.trim());

	return (
		<div className="mx-auto max-w-xl space-y-6 py-8 text-center">
			<Helmet>
				<title>
					Verify Sui Move Package Source Code — MultiSig
				</title>
				<meta
					name="description"
					content="Public portal to verify any Sui Move package. Source code is archived to Walrus decentralized storage and cryptographically linked to the on-chain package ID. No wallet or login required."
				/>
				<link
					rel="canonical"
					href="https://multisig.suisec.app/verify"
				/>
				<script type="application/ld+json">
					{JSON.stringify({
						'@context': 'https://schema.org',
						'@type': 'WebPage',
						name: 'Sui Move Package Verification Portal',
						description:
							'Verify the source code of any Sui Move smart contract package. Source is archived to Walrus and anchored to the on-chain package via a multisig publish transaction.',
						url: 'https://multisig.suisec.app/verify',
						isPartOf: {
							'@type': 'WebSite',
							url: 'https://multisig.suisec.app',
						},
					})}
				</script>
			</Helmet>
			<div className="flex justify-center">
				<img src="/logo.png" alt="" className="h-16 w-16" />
			</div>
			<div>
				<h1 className="font-display text-2xl font-semibold tracking-tight">
					Verify a Sui package
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Source archived on Walrus, bound to the on-chain
					package. No wallet or login — paste a package id.
				</p>
			</div>
			<Card className="flex gap-2 p-3">
				<Input
					className="font-mono text-xs"
					value={id}
					spellCheck={false}
					onChange={(e) => setId(e.target.value)}
					placeholder="0x… package id"
					onKeyDown={(e) => {
						if (e.key === 'Enter' && valid)
							navigate(`/package/${id.trim()}`);
					}}
				/>
				<Button
					disabled={!valid}
					className="flex-none px-4"
					onClick={() => navigate(`/package/${id.trim()}`)}
				>
					<Search className="h-4 w-4" />
					Verify
				</Button>
			</Card>
			<div className="space-y-3 rounded-xl border border-border bg-card p-5 text-left text-sm text-muted-foreground">
				<p>
					When a team publishes a Move package through
					MultiSig, the full source folder is compressed and
					uploaded to{' '}
					<strong className="text-foreground">
						Walrus
					</strong>
					, a decentralized storage network. The resulting
					blob ID is recorded on the relay and linked to the
					on-chain package ID.
				</p>
				<p>
					The verification here goes further than the
					relay's word: it re-derives provenance directly
					from the Sui chain. A{' '}
					<strong className="text-foreground">
						chain-verified
					</strong>{' '}
					badge means the relay's recorded (multisig
					address, package ID, publish transaction) triple
					was confirmed on-chain — no third party can
					fabricate it.
				</p>
				<p>
					To reproduce the build yourself, download the
					source .zip, unzip it, and run{' '}
					<code className="rounded bg-field px-1 font-mono text-xs text-foreground">
						sui move build --dump-bytecode-as-base64
					</code>{' '}
					with the matching Sui toolchain version. Compare
					the output digest against the recorded build
					digest on the package page.
				</p>
			</div>
		</div>
	);
}
