// SPDX-License-Identifier: Apache-2.0

import { isValidSuiAddress } from '@mysten/sui/utils';
import {
	ArrowLeft,
	Info,
	Plus,
	Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { MultisigSafetyScore } from '../components/MultisigSafetyScore';
import {
	Button,
	Card,
	Field,
	Input,
} from '../components/ui/kit';
import { useApiAuth } from '../contexts/ApiAuthContext';
import { useCreateDraft } from '../hooks/drafts';

interface Row {
	id: string;
	address: string;
	weight: number;
	locked?: boolean;
}

let seq = 1;

export function CreateMultisig() {
	const { currentAddress } = useApiAuth();
	const createDraft = useCreateDraft();

	const [name, setName] = useState('');
	const [threshold, setThreshold] = useState(1);
	const [rows, setRows] = useState<Row[]>(() => [
		{
			id: 'creator',
			address: currentAddress?.address ?? '',
			weight: 1,
			locked: true,
		},
	]);

	const totalWeight = rows.reduce(
		(a, r) => a + (Number(r.weight) || 0),
		0,
	);

	const addressesValid = rows.every((r) =>
		isValidSuiAddress(r.address.trim()),
	);
	const unique =
		new Set(rows.map((r) => r.address.trim())).size ===
		rows.length;
	const valid =
		addressesValid &&
		unique &&
		rows.length >= 1 &&
		rows.length <= 10 &&
		threshold >= 1 &&
		threshold <= totalWeight &&
		rows.every((r) => r.weight >= 1 && r.weight <= 255);

	function patch(id: string, p: Partial<Row>) {
		setRows((rs) =>
			rs.map((r) => (r.id === id ? { ...r, ...p } : r)),
		);
	}

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<Link
				to="/"
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="h-4 w-4" /> Back
			</Link>

			<div>
				<h1 className="font-display text-[22px] font-semibold tracking-tight">
					Create a Multisig
				</h1>
				<p className="text-sm text-muted-foreground">
					Add members by address. Each member joins once via
					an invite link; the multisig goes live when all
					have joined — and it costs no gas to create.
				</p>
			</div>

			<Card className="space-y-5 p-5">
				<Field label="Name (optional)">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Treasury"
						autoComplete="off"
					/>
				</Field>

				<div className="space-y-2">
					<span className="text-xs font-medium text-muted-foreground">
						Members
					</span>
					{rows.map((r, i) => (
						<div key={r.id} className="space-y-1">
							<div className="flex gap-2">
								<Input
									className="flex-1 font-mono text-xs"
									value={r.address}
									disabled={r.locked}
									autoComplete="off"
									autoCorrect="off"
									spellCheck={false}
									aria-label={`Member ${i + 1} address`}
									placeholder="0x… member address"
									onChange={(e) =>
										patch(r.id, { address: e.target.value })
									}
								/>
								<Input
									className="w-20"
									type="number"
									min={1}
									max={255}
									aria-label={`Member ${i + 1} weight`}
									value={r.weight}
									onChange={(e) =>
										patch(r.id, {
											weight: Number(e.target.value),
										})
									}
								/>
								<Button
									variant="ghost"
									aria-label="Remove member"
									onClick={() =>
										setRows((rs) =>
											rs.filter((x) => x.id !== r.id),
										)
									}
									disabled={r.locked}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
							{i === 0 && (
								<p className="text-[11px] text-muted-foreground">
									You (creator) — joined automatically
								</p>
							)}
						</div>
					))}
					<Button
						variant="outline"
						onClick={() =>
							setRows((rs) => [
								...rs,
								{
									id: `m${seq++}`,
									address: '',
									weight: 1,
								},
							])
						}
					>
						<Plus className="h-4 w-4" /> Add member
					</Button>
				</div>

				<Field
					label="Threshold"
					hint={`of ${totalWeight} total weight`}
				>
					<Input
						className="w-28"
						type="number"
						min={1}
						max={totalWeight}
						value={threshold}
						onChange={(e) =>
							setThreshold(Number(e.target.value))
						}
					/>
				</Field>

				{/* Advisory safety score — never gates the button below. */}
				<MultisigSafetyScore
					weights={rows.map((r) => Number(r.weight) || 0)}
					threshold={Number(threshold) || 0}
				/>

				<div className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
					<Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					The multisig address is derived from members’
					public keys, so it appears once everyone has
					joined.
				</div>

				<Button
					disabled={!valid}
					loading={createDraft.isPending}
					onClick={() =>
						createDraft.mutate({
							name: name || undefined,
							threshold: Number(threshold),
							members: rows.map((r) => ({
								address: r.address.trim(),
								weight: Number(r.weight),
							})),
						})
					}
				>
					Create &amp; get invite link
				</Button>
				{!unique && (
					<p className="text-xs text-destructive">
						Duplicate addresses are not allowed.
					</p>
				)}
			</Card>
		</div>
	);
}
