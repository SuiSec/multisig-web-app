// SPDX-License-Identifier: Apache-2.0
// Build a transfer (a specific coin amount, or an owned object) with the
// multisig as sender, then sign + post it as a proposal. Driven by query
// params from the assets page:
//   ?coin=<coinType>          → coin transfer (default: SUI)
//   ?coin=<coinType>&deposit=1 → deposit coins into the multisig's own address
//                                balance accumulator (seed for lock-free transfers)
//   ?object=<id>&label=<name> → object transfer

import { useDAppKit } from '@mysten/dapp-kit-react';
import {
	formatAddress,
	isValidSuiAddress,
	normalizeStructTag,
} from '@mysten/sui/utils';
import { ArrowLeft, Send } from 'lucide-react';
import { useState } from 'react';
import {
	Link,
	useNavigate,
	useParams,
	useSearchParams,
} from 'react-router-dom';

import {
	Button,
	Card,
	Field,
	Input,
} from '../components/ui/kit';
import { useBalances } from '../hooks/balances';
import { useCreateProposal } from '../hooks/proposals';
import { formatUnits, isSuiType } from '../lib/coins';
import {
	buildAccountBalanceDepositBytes,
	buildCoinTransferBytes,
	buildObjectTransferBytes,
	toBaseUnits,
} from '../lib/transferTx';

const SUI_TYPE = '0x2::sui::SUI';
// Leave a little SUI for gas when "Max" is used on the native coin.
const SUI_GAS_RESERVE = 50_000_000n; // 0.05 SUI

export function CreateProposal() {
	const { address } = useParams<{ address: string }>();
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const client = useDAppKit().getClient();
	const createProposal = useCreateProposal();
	const { data: balances } = useBalances(address);

	const objectId = params.get('object');
	const objectLabel = params.get('label');
	// Normalize so it matches the long-form coin types from listBalances (the
	// default SUI_TYPE is short-form, balances come back fully-qualified).
	const coinType = normalizeStructTag(
		params.get('coin') ?? SUI_TYPE,
	);
	const isObject = !!objectId;
	const isSui = isSuiType(coinType);
	// Deposit mode: move coins into the multisig's own address balance
	// accumulator (seed it so future transfers can be funded lock-free).
	const isDeposit =
		params.get('deposit') === '1' && !isObject;

	const asset = balances?.find(
		(b) => b.coinType === coinType,
	);
	// Every coin type held in coin form — a transfer migrates them all into the
	// multisig's own account balance (so later transfers can be lock-free).
	const sweep = (balances ?? [])
		.filter((b) => b.coinRaw > 0n)
		.map((b) => ({
			coinType: b.coinType,
			isSui: b.isSui,
			coinRaw: b.coinRaw,
		}));
	const willSweep =
		!isObject && !isDeposit && sweep.length > 0;
	const decimals = asset?.decimals ?? (isSui ? 9 : null);
	const symbol =
		asset?.symbol ?? (isSui ? 'SUI' : 'tokens');

	const [recipient, setRecipient] = useState('');
	const [amount, setAmount] = useState('');
	const [description, setDescription] = useState('');
	const [building, setBuilding] = useState(false);

	const amountUnits =
		!isObject && amount && decimals != null
			? toBaseUnits(amount, decimals)
			: 0n;
	// A deposit can only draw from coin objects. A transfer is funded from EITHER
	// coins or the accumulator (whichever covers it) — but not a mix in one tx —
	// so the cap is the larger of the two, not their sum.
	const spendable = asset
		? isDeposit
			? asset.coinRaw
			: asset.coinRaw > asset.accumulatorRaw
				? asset.coinRaw
				: asset.accumulatorRaw
		: 0n;
	const overBalance =
		!isObject && asset != null && amountUnits > spendable;
	const amountValid =
		isObject ||
		(decimals != null && amountUnits > 0n && !overBalance);
	const valid =
		!!address &&
		(isDeposit || isValidSuiAddress(recipient)) &&
		amountValid;

	function setMax() {
		if (!asset || decimals == null) return;
		// SUI keeps a coin back for gas whenever this draws from coin objects.
		const max =
			isSui && spendable > SUI_GAS_RESERVE
				? spendable - SUI_GAS_RESERVE
				: spendable;
		setAmount(formatUnits(max, decimals));
	}

	async function submit() {
		if (!address || !valid) return;
		setBuilding(true);
		try {
			let bytes: string;
			let desc: string;
			if (isDeposit) {
				bytes = await buildAccountBalanceDepositBytes(
					client,
					address,
					{ coinType, isSui, amount: amountUnits },
				);
				desc =
					description ||
					`Deposit ${amount} ${symbol} to account balance`;
			} else if (isObject) {
				bytes = await buildObjectTransferBytes(
					client,
					address,
					{
						objectId: objectId!,
						recipient,
					},
				);
				desc =
					description ||
					`Transfer ${objectLabel || formatAddress(objectId!)}`;
			} else {
				bytes = await buildCoinTransferBytes(
					client,
					address,
					{
						coinType,
						isSui,
						amount: amountUnits,
						recipient,
						sweep,
					},
				);
				desc =
					description || `Transfer ${amount} ${symbol}`;
			}
			await createProposal.mutateAsync({
				multisigAddress: address,
				transactionBytes: bytes,
				description: desc,
			});
			navigate(`/multisig/${address}/pending`);
		} finally {
			setBuilding(false);
		}
	}

	return (
		<div className="space-y-6">
			<Link
				to={`/multisig/${address}/assets`}
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" /> Back to assets
			</Link>

			<div>
				<h1 className="font-display text-[22px] font-semibold tracking-tight">
					{isDeposit
						? `Deposit ${symbol} to account balance`
						: isObject
							? 'Transfer object'
							: `Transfer ${symbol}`}
				</h1>
				<p className="text-sm text-muted-foreground">
					{isDeposit
						? "Move coins into the multisig's address balance accumulator. Funds there can pay for transfers (and their gas) without consuming coin objects — so later proposals won't conflict over a coin."
						: 'Frozen with the multisig as sender, then signed and posted as a proposal for the other members to approve.'}
				</p>
			</div>

			<Card className="space-y-5 p-5">
				{isObject ? (
					<Field label="Object">
						<div className="rounded-lg border border-border bg-field px-3.5 py-3 font-mono text-xs">
							<div className="font-semibold text-foreground">
								{objectLabel || 'Object'}
							</div>
							<div className="text-muted-foreground">
								{objectId}
							</div>
						</div>
					</Field>
				) : null}

				{!isDeposit && (
					<Field label="Recipient address">
						<Input
							className="font-mono text-xs"
							value={recipient}
							autoComplete="off"
							autoCorrect="off"
							spellCheck={false}
							onChange={(e) => setRecipient(e.target.value)}
							placeholder="0x…"
						/>
					</Field>
				)}

				{!isObject && (
					<Field
						label={`Amount (${symbol})`}
						hint={
							asset
								? `${isDeposit ? 'Coin balance' : 'Balance'}: ${formatUnits(spendable, decimals)} ${symbol}`
								: undefined
						}
					>
						<div className="flex gap-2">
							<Input
								type="number"
								inputMode="decimal"
								min={0}
								step="any"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								placeholder="0.0"
							/>
							<Button
								variant="outline"
								onClick={setMax}
								disabled={!asset}
								className="shrink-0"
							>
								Max
							</Button>
						</div>
					</Field>
				)}

				{overBalance && (
					<p className="text-[13px] text-destructive">
						Amount exceeds the multisig's balance.
					</p>
				)}

				{willSweep && (
					<p className="text-[13px] text-muted-foreground">
						This transfer also moves the multisig's
						remaining coins (all token types) into its own{' '}
						<span className="font-medium text-foreground">
							account balance
						</span>
						, keeping a small SUI coin for gas. Afterwards,
						transfers run lock-free.
					</p>
				)}

				{!isObject && !isDeposit && (
					<p className="text-[13px] text-muted-foreground">
						The recipient receives this into their{' '}
						<span className="font-medium text-foreground">
							account balance
						</span>{' '}
						(address balance), not as a coin object. Make
						sure the recipient supports address balances —
						older wallets / exchanges that only scan coin
						objects may not see it.
					</p>
				)}

				{isDeposit && (
					<p className="text-[13px] text-muted-foreground">
						This deposit consumes a coin object (so it locks
						that coin until executed). Once it lands, the
						deposited balance funds lock-free transfers.
					</p>
				)}

				<Field
					label="Description (optional)"
					hint="A note for the other signers so they can recognize this proposal. Off-chain only — it is not part of the signed transaction and is never stored on-chain."
				>
					<Input
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="e.g. Q2 payout to vendor — agreed in #treasury"
					/>
				</Field>

				<Button
					disabled={!valid}
					loading={building || createProposal.isPending}
					onClick={submit}
				>
					<Send className="h-4 w-4" />
					Sign &amp; propose
				</Button>
			</Card>
		</div>
	);
}
