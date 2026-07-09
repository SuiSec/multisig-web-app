// SPDX-License-Identifier: Apache-2.0
// "Explain with DeepSeek" — informational only, never blocks approval.
// The key is the user's own, stored in their browser (see hooks/aiExplain.ts).

import {
	KeyRound,
	Sparkles,
	Trash2,
	XCircle,
} from 'lucide-react';
import { useState } from 'react';

import {
	useDeepseekKey,
	useExplainTransaction,
} from '../hooks/aiExplain';
import type { TxExplainInput } from '../lib/deepseek';
import { Markdown } from './Markdown';
import { Badge, Button, Card } from './ui/kit';

function maskKey(k: string): string {
	if (k.length <= 8) return '••••';
	return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export function AiExplainPanel({
	input,
}: {
	input: TxExplainInput | null;
}) {
	const { key, persist, save, clear } = useDeepseekKey();
	const explain = useExplainTransaction();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const [draftPersist, setDraftPersist] = useState(persist);

	const hasKey = key.length > 0;
	const showForm = editing || !hasKey;

	return (
		<Card className="space-y-4 p-5">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm font-medium">
					<Sparkles className="h-4 w-4 text-primary" />
					AI explanation
					<Badge tone="muted">DeepSeek</Badge>
				</div>
				{hasKey && !editing && (
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<KeyRound className="h-3.5 w-3.5" />
						<span className="font-mono">
							{maskKey(key)}
						</span>
						<span>
							· {persist ? 'remembered' : 'this session'}
						</span>
						<button
							className="underline hover:text-foreground"
							onClick={() => {
								setDraft('');
								setDraftPersist(persist);
								setEditing(true);
							}}
						>
							change
						</button>
						<button
							className="inline-flex items-center gap-1 text-destructive hover:underline"
							onClick={clear}
						>
							<Trash2 className="h-3 w-3" />
							clear
						</button>
					</div>
				)}
			</div>

			{showForm ? (
				<div className="space-y-3 rounded-lg border border-border bg-card/60 p-3.5">
					<p className="text-[12.5px] leading-relaxed text-muted-foreground">
						Paste your <strong>own</strong> DeepSeek API
						key. It is stored only in this browser and sent
						directly to DeepSeek over HTTPS — never to our
						relay, never bundled. Get one at{' '}
						<a
							href="https://platform.deepseek.com/api_keys"
							target="_blank"
							rel="noreferrer"
							className="text-primary underline"
						>
							platform.deepseek.com
						</a>
						.
					</p>
					<input
						type="password"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						spellCheck={false}
						autoComplete="off"
						placeholder="sk-…"
						className="w-full rounded-lg border border-border bg-field px-3.5 py-2.5 font-mono text-[12.5px] outline-none transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
					/>
					<label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
						<input
							type="checkbox"
							checked={draftPersist}
							onChange={(e) =>
								setDraftPersist(e.target.checked)
							}
							className="h-3.5 w-3.5 accent-primary"
						/>
						Remember in this browser (localStorage). Off =
						forgotten when the tab closes.
					</label>
					<div className="flex gap-2">
						<Button
							variant="subtle"
							disabled={!draft.trim()}
							onClick={() => {
								save(draft, draftPersist);
								setEditing(false);
								setDraft('');
							}}
						>
							Save key
						</Button>
						{editing && (
							<Button
								variant="ghost"
								onClick={() => {
									setEditing(false);
									setDraft('');
								}}
							>
								Cancel
							</Button>
						)}
					</div>
				</div>
			) : (
				<div className="space-y-2.5">
					{/* Opt-in consent: the panel is available by default, but no
					    transaction data leaves the browser until the user clicks.
					    Spell out exactly what is sent, and to whom. */}
					<p className="rounded-lg border border-border bg-card/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
						Clicking sends this transaction's decoded
						details — sender, recipients, amounts, and
						contract calls — to{' '}
						<strong>
							DeepSeek, a third-party AI service
						</strong>
						, over HTTPS using your own key. Nothing is sent
						until you click, and it never passes through our
						relay.
					</p>
					<Button
						variant="outline"
						loading={explain.isPending}
						disabled={!input}
						onClick={() =>
							input &&
							explain.mutate({ apiKey: key, input })
						}
					>
						<Sparkles className="h-4 w-4" />
						{explain.data
							? 'Re-explain'
							: 'Explain this transaction'}
					</Button>
				</div>
			)}

			{explain.isError && (
				<Badge tone="danger">
					<XCircle className="h-3 w-3" />
					{(explain.error as Error).message}
				</Badge>
			)}

			{explain.data && (
				<div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-4">
					<Markdown>{explain.data}</Markdown>
				</div>
			)}

			<p className="text-[11px] text-faint">
				AI output can be wrong — it is informational only
				and never gates approval. Always trust the decoded
				data and simulation above over this summary.
			</p>
		</Card>
	);
}
