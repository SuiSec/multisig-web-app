// SPDX-License-Identifier: Apache-2.0
// Landing page for transactions captured from a dApp by the MultiSig
// extension. Builds/freezes the captured tx, runs the shared security review,
// and — on approval — signs it and creates a multisig proposal.

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { formatAddress, toBase64 } from '@mysten/sui/utils';
import { useQuery } from '@tanstack/react-query';
import { Globe, XCircle } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import {
	TransactionSecurityReview,
	type SimulationState,
} from '../components/TransactionSecurityReview';
import {
	Badge,
	Button,
	Card,
	EmptyState,
	Spinner,
} from '../components/ui/kit';
import {
	useDryRun,
	useTransactionAnalysis,
} from '../hooks/analysis';
import { useCreateProposal } from '../hooks/proposals';

interface CapturePayload {
	address: string;
	network: string;
	txJson: string;
	dapp: string;
}

function decodeFragment(): CapturePayload | null {
	const raw = location.hash.replace(/^#/, '');
	if (!raw) return null;
	try {
		const json = decodeURIComponent(escape(atob(raw)));
		const p = JSON.parse(json);
		if (p?.address && p?.txJson) return p;
		return null;
	} catch {
		return null;
	}
}

export function Capture() {
	const navigate = useNavigate();
	const client = useDAppKit().getClient();
	const network = useCurrentNetwork();

	const payload = useMemo(decodeFragment, []);
	const analysis = useTransactionAnalysis();
	const dryRun = useDryRun();
	const createProposal = useCreateProposal();

	// Freeze the captured transaction with the multisig as sender.
	const build = useQuery({
		queryKey: [
			'capture-build',
			payload?.txJson,
			payload?.address,
		],
		queryFn: async () => {
			const tx = Transaction.from(payload!.txJson);
			tx.setSender(payload!.address);
			return toBase64(await tx.build({ client }));
		},
		enabled: !!payload,
		retry: false,
	});

	const bytes = build.data;
	useEffect(() => {
		if (!bytes) return;
		analysis.mutate(bytes);
		dryRun.mutate(bytes);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bytes]);

	if (!payload) {
		return (
			<EmptyState
				title="No captured transaction"
				body="Open this page from the MultiSig extension after a dApp requests a signature."
			/>
		);
	}

	const wysiwygReady =
		dryRun.isSuccess && analysis.isSuccess;
	const networkMismatch = payload.network !== network;

	const sim: SimulationState = {
		pending: dryRun.isPending,
		success: dryRun.isSuccess,
		errorMessage: dryRun.isError
			? (dryRun.error as Error).message
			: undefined,
		data: dryRun.data ?? null,
	};

	async function approve() {
		if (!bytes) return;
		await createProposal.mutateAsync({
			multisigAddress: payload!.address,
			transactionBytes: bytes,
			description: payload!.dapp
				? `From ${payload!.dapp}`
				: 'Captured transaction',
		});
		navigate(`/multisig/${payload!.address}`);
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-display text-[22px] font-semibold tracking-tight">
					Captured transaction
				</h1>
				<p className="text-sm text-muted-foreground">
					Review what this does, then approve to create a
					multisig proposal.
				</p>
			</div>

			<Card className="space-y-3 p-5">
				<Row label="From dApp">
					<span className="flex items-center gap-1.5">
						<Globe className="h-3.5 w-3.5 text-muted-foreground" />
						{payload.dapp || 'unknown'}
					</span>
				</Row>
				<Row label="Multisig">
					<span className="font-mono text-xs">
						{formatAddress(payload.address)}
					</span>
				</Row>
				<Row label="Network">
					{networkMismatch ? (
						<Badge tone="warn">
							captured on {payload.network} — switch network
						</Badge>
					) : (
						<Badge tone="muted">{payload.network}</Badge>
					)}
				</Row>
			</Card>

			{build.isLoading && (
				<Spinner label="Freezing transaction…" />
			)}
			{build.isError && (
				<Badge tone="danger">
					<XCircle className="h-3 w-3" />
					Could not build: {(build.error as Error).message}
				</Badge>
			)}

			{bytes && (
				<TransactionSecurityReview
					network={payload.network}
					multisig={payload.address}
					dapp={payload.dapp}
					transactionBytes={bytes}
					analysisData={analysis.data}
					analysisPending={analysis.isPending}
					sim={sim}
				/>
			)}

			<Button
				disabled={!wysiwygReady}
				loading={createProposal.isPending}
				onClick={approve}
			>
				Approve &amp; create proposal
			</Button>
			{!wysiwygReady && bytes && (
				<span className="ml-3 text-xs text-muted-foreground">
					Approval is disabled until decode + simulation
					complete.
				</span>
			)}
		</div>
	);
}

function Row({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between text-sm">
			<span className="text-muted-foreground">{label}</span>
			{children}
		</div>
	);
}
