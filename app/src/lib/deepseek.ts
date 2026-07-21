// SPDX-License-Identifier: Apache-2.0
// DeepSeek "explain this transaction" — Bring Your Own Key (BYOK).
//
// The API key is the USER'S OWN key, kept only in their browser (see
// hooks/aiExplain.ts) and sent directly to DeepSeek over TLS — never bundled,
// never committed, never routed through our relay. DeepSeek's API returns CORS
// headers for browser origins, so no proxy is needed. Errors are surfaced
// (never silently swallowed) so the real cause is visible.

const ENDPOINT =
	'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-v4-flash';

/** Compact, model-friendly summary of the captured transaction. */
export interface TxExplainInput {
	dapp: string;
	network: string;
	multisig: string;
	/** Decoded PTB commands (from the wallet-sdk analyzer). Each MoveCall is
	 *  enriched with an inline `mvrName` (its Move Registry name, or null), and
	 *  every `Pure` input is decoded by its Move type — an `address` shows as
	 *  `0x…`, a `u64` as a decimal — so no raw base64 reaches the model. */
	commands: unknown;
	/** Move Registry names for the packages this tx calls (id → @scope/name). */
	packageNames: Record<string, string>;
	/** Each MoveCall's resolved target + per-parameter type AND the app's own
	 *  deterministic risk verdict (computed client-side, not by the model). The
	 *  model should EXPLAIN these flags, not re-derive them. `isFramework` marks
	 *  the immutable system packages (0x1/0x2/0x3): their coin/cap params are
	 *  trusted — no drain risk — so they carry `risk: 'none'`. */
	functionSignatures: {
		packageId: string;
		mvrName: string | null;
		isFramework: boolean;
		module: string;
		function: string;
		typeArguments: string[];
		params: {
			type: string;
			/** `info` = a note, not a risk (e.g. a `&Cap` proving authority). */
			risk: 'high' | 'medium' | 'info' | 'none';
			reason?: string;
		}[];
	}[];
	/** Account-balance withdrawal authorizations carried in the signed bytes —
	 *  the CEILING each signature allows (not necessarily the amount moved).
	 *  `limit` is already scaled to the token's decimals. */
	withdrawals: {
		coinType: string;
		symbol: string;
		from: 'sender' | 'sponsor';
		limit: string;
	}[];
	/** Per-object access levels the tx asks for. */
	accessLevel: Record<
		string,
		'read' | 'mutate' | 'transfer'
	>;
	/** Analyzer-flagged issues, if any. */
	issues: unknown[];
	/** High-severity: privileged / value-bearing objects (an UpgradeCap, an
	 *  admin cap, or a DeFi position) the simulation shows leaving THIS multisig
	 *  to another address. Non-empty means upgrade/admin authority or real funds
	 *  are being handed to someone else. */
	privilegedTransfers: {
		objectId: string;
		type: string;
		protocol: string | null;
		newOwner: string;
		reason: 'upgrade-cap' | 'admin' | 'value-object';
	}[];
	/** Dry-run outcome (the quick verdict). */
	simulation: {
		status: 'would-succeed' | 'would-fail';
		error?: string;
	};
	/** The full simulation result on success (gas, events, object ownership
	 *  changes, balance changes, object types) — the authoritative outcome. Its
	 *  `transaction` sub-object is stripped: `commands` already carries that,
	 *  decoded, so it would only re-introduce raw base64. Null if the dry-run
	 *  failed or hasn't run. */
	dryRun: unknown;
}

const SYSTEM_PROMPT =
	'You are a Sui blockchain transaction security analyst. The user is about ' +
	'to approve a dApp-initiated transaction with their multisig wallet. ' +
	'Explain the already-decoded transaction clearly and soberly in English. ' +
	'Never invent data that is not present; say so when unsure. Lead with what ' +
	'matters to a signer. Be CONCISE — a signer wants to grasp what the tx does ' +
	'and its risks fast, not read an essay. Report only risks that are actually ' +
	'present in this transaction; never enumerate checks that passed or call out ' +
	'that something is safe/benign — omit it entirely.\n\n' +
	'This app already runs a deterministic risk analysis client-side; trust its ' +
	'verdicts and explain them in plain language rather than re-deriving your ' +
	'own. Its risk policy (for context, and to flag anything it may have ' +
	'missed):\n' +
	'• The system packages `0x1`/`0x2`/`0x3` are immutable and trusted — handing ' +
	'them a coin/cap is NOT a drain risk.\n' +
	'• For any OTHER (upgradeable) package: a `&mut Coin<T>` / `&mut Balance<T>` ' +
	'param, or a `0x2::funds_accumulator::Withdrawal`, is an UNBOUNDED ' +
	'authorization — the contract may take up to the full balance / the stated ' +
	'limit; the simulated figure is only the current code path. A `Coin<T>` by ' +
	'value surrenders the whole coin. A `*Cap` passed BY VALUE or by `&mut` is ' +
	'surrendered or modifiable — that IS a risk. A `*Cap` taken by IMMUTABLE ' +
	'reference (`&Cap`) is merely how an admin entry point is gated: it proves ' +
	'authority for that one call and is neither transferred nor modified, so it ' +
	'carries `risk: \'info\'` — describe it under "What it does" if useful, never ' +
	'as a risk.\n' +
	'• HIGH severity: an `UpgradeCap`, an admin-named cap, or a DeFi ' +
	'position / ownership-cap / LP-burn-proof (types ending in ' +
	'`Position`/`PositionNFT`/`OwnerCap`/`BurnProof`, or a known protocol ' +
	'position) leaving THIS multisig to another address — whoever holds it ' +
	'gains that authority or the underlying funds. These arrive pre-flagged in ' +
	'`privilegedTransfers`; surface any equivalent you spot that is not.\n\n' +
	'Format the answer in GitHub-flavored Markdown: short `##`/`###` headings, ' +
	'bullet lists, and `inline code` for identifiers. ' +
	'When you refer to a package, object, address, or type, write the FULL ' +
	'identifier exactly as given in the data (full 0x… hex; full ' +
	'`0x…::module::Type`). NEVER abbreviate or truncate an id (no `0x1eab…`, no ' +
	'`coin::Coin` when the full type is given). No pleasantries.';

function userPrompt(input: TxExplainInput): string {
	return (
		'Explain the transaction below that this multisig is about to approve. Keep it ' +
		'brief — a signer skims this. Use exactly these three short sections:\n\n' +
		'### What it does\n' +
		'One or two sentences per command in plain English. Name each protocol by its ' +
		'Move Registry name when given (`mvrName` on each MoveCall; `packageNames` maps ' +
		'id → @scope/name) — cite the full id at least once.\n\n' +
		'### What moves\n' +
		'Which assets/objects change hands and to whom, grounded in the dry-run result ' +
		'`dryRun`: `effects.changedObjects` (each object created/deleted/transferred, with ' +
		'its `inputOwner`/`outputOwner`), `balanceChanges` (per-address coin deltas), and ' +
		'`objectTypes` (object id → Move type) to name what each object is. Pure inputs in ' +
		'`commands` are already decoded, so name destination addresses exactly. Explicitly ' +
		'call out anything leaving THIS multisig (`multisig`).\n\n' +
		'### Risks\n' +
		'List ONLY the risks actually present in this transaction — one bullet each. A ' +
		'risk is present when: `privilegedTransfers` is non-empty (UpgradeCap / admin / ' +
		'DeFi position leaving the multisig — name the object, protocol, and recipient); ' +
		'a `functionSignatures` param has `risk` of `high` or `medium` (explain its ' +
		'`reason`); or `withdrawals` lists a ceiling. Do NOT mention checks that passed, ' +
		'benign `risk: none` or `risk: info` params, framework calls, or anything not ' +
		'flagged — omit them ' +
		"entirely rather than noting they're safe. Don't invent risks. If nothing is " +
		'flagged at all, output just the single line "No obvious risks found" and nothing ' +
		'else for this section. (A MoveCall is pinned to a package version, so the code ' +
		'cannot change after signing — the risk is unbounded authority and ' +
		'state-dependent amounts, not a post-signing code swap.)\n\n' +
		'Transaction data (JSON):\n```json\n' +
		JSON.stringify(input, null, 2) +
		'\n```'
	);
}

/**
 * Call DeepSeek to explain a transaction. Throws on any non-OK response or
 * empty completion — the caller surfaces the message to the user.
 */
export async function explainTransaction(
	apiKey: string,
	input: TxExplainInput,
	signal?: AbortSignal,
): Promise<string> {
	const res = await fetch(ENDPOINT, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: MODEL,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: userPrompt(input) },
			],
			temperature: 0.2,
			stream: false,
		}),
		signal,
	});

	if (!res.ok) {
		// Enrich the error with DeepSeek's body when available, then throw —
		// the status alone (401 bad key, 402 no balance, 429 rate limit) is
		// already actionable.
		let detail = res.statusText;
		try {
			const body = await res.text();
			if (body) detail = body.slice(0, 300);
		} catch {
			// keep statusText
		}
		throw new Error(`DeepSeek ${res.status}: ${detail}`);
	}

	const data = (await res.json()) as {
		choices?: { message?: { content?: string } }[];
	};
	const content = data.choices?.[0]?.message?.content;
	if (typeof content !== 'string' || !content.trim())
		throw new Error(
			'DeepSeek returned an empty completion.',
		);
	return content;
}
