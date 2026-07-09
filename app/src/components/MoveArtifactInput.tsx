// SPDX-License-Identifier: Apache-2.0
// Collects the two publish/upgrade inputs: the authoritative build artifact
// (pasted `--dump-bytecode-as-base64` JSON) and, optionally, the project folder
// (whitelisted source for the Walrus archive; secrets excluded by name).

import {
	Check,
	Copy,
	FileCode2,
	FolderUp,
	ShieldCheck,
	Terminal,
} from 'lucide-react';
import { useRef, useState } from 'react';

import {
	parseDumpJson,
	readProjectFolder,
	type BuildArtifact,
	type ProjectSource,
} from '../lib/move';
import { Badge, Field } from './ui/kit';

/** A copyable shell command with a note (always shown) on where its output goes. */
function CmdRow({
	cmd,
	note,
}: {
	cmd: string;
	note: string;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="space-y-1">
			<div className="text-[11px] font-medium text-faint">
				{note}
			</div>
			<div className="flex items-center gap-2">
				<code className="min-w-0 flex-1 truncate rounded bg-field px-2 py-1.5 font-mono text-[11.5px] text-foreground">
					{cmd}
				</code>
				<button
					type="button"
					onClick={() => {
						void navigator.clipboard.writeText(cmd);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					}}
					className="inline-flex flex-none items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-accent"
				>
					{copied ? (
						<Check className="h-3 w-3 text-success" />
					) : (
						<Copy className="h-3 w-3" />
					)}
				</button>
			</div>
		</div>
	);
}

/** Split a comma/whitespace-separated list of package IDs. */
function parseExtraDeps(text: string): string[] {
	return text
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/** Merge extra dependency IDs into the artifact, order-preserved and deduped. */
function withExtraDeps(
	base: BuildArtifact,
	extra: string[],
): BuildArtifact {
	const seen = new Set(base.dependencies);
	const merged = [...base.dependencies];
	for (const id of extra)
		if (!seen.has(id)) {
			merged.push(id);
			seen.add(id);
		}
	return { ...base, dependencies: merged };
}

export function MoveArtifactInput({
	onArtifact,
	onSource,
}: {
	onArtifact: (artifact: BuildArtifact | null) => void;
	onSource: (source: ProjectSource | null) => void;
}) {
	const [json, setJson] = useState('');
	const [extra, setExtra] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [base, setBase] = useState<BuildArtifact | null>(
		null,
	);
	const [artifact, setArtifact] =
		useState<BuildArtifact | null>(null);
	const [source, setSource] =
		useState<ProjectSource | null>(null);
	const folderRef = useRef<HTMLInputElement>(null);

	function emit(
		nextBase: BuildArtifact | null,
		extraText: string,
	) {
		if (!nextBase) {
			setArtifact(null);
			onArtifact(null);
			return;
		}
		const merged = withExtraDeps(
			nextBase,
			parseExtraDeps(extraText),
		);
		setArtifact(merged);
		onArtifact(merged);
	}

	function handleJson(text: string) {
		setJson(text);
		if (!text.trim()) {
			setError(null);
			setBase(null);
			emit(null, extra);
			return;
		}
		try {
			const parsed = parseDumpJson(text);
			setBase(parsed);
			setError(null);
			emit(parsed, extra);
		} catch (e) {
			setBase(null);
			setError((e as Error).message);
			emit(null, extra);
		}
	}

	function handleExtra(text: string) {
		setExtra(text);
		emit(base, text);
	}

	async function handleFolder(files: FileList | null) {
		if (!files || files.length === 0) {
			setSource(null);
			onSource(null);
			return;
		}
		const parsed = await readProjectFolder(files);
		setSource(parsed);
		onSource(parsed);
	}

	return (
		<div className="space-y-4">
			{/* Move can't compile in the browser — build locally and paste. */}
			<div className="space-y-2 rounded-lg border border-border bg-card/60 px-3.5 py-3">
				<div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/80">
					<Terminal className="h-3.5 w-3.5 text-primary" />
					Build locally, then paste below
				</div>
				<p className="text-[11.5px] leading-relaxed text-muted-foreground">
					Move bytecode can’t be compiled in the browser. In
					your package directory (where{' '}
					<code className="font-mono">Move.toml</code> is),
					run:
				</p>
				<CmdRow
					cmd="sui move build --dump-bytecode-as-base64"
					note="Output → paste into the “Build artifact” box below"
				/>
				<CmdRow
					cmd="sui --version"
					note="Output → paste into the “Toolchain” field below"
				/>
				<p className="text-[11px] leading-relaxed text-faint">
					Other signers re-run the same build with the same{' '}
					<code className="font-mono">sui</code> version to
					reproduce the exact digest — so record the
					toolchain.
				</p>
			</div>

			<Field
				label="Build artifact"
				hint="Paste the JSON printed by the first command above"
			>
				<textarea
					value={json}
					onChange={(e) => handleJson(e.target.value)}
					spellCheck={false}
					placeholder='{ "modules": ["..."], "dependencies": ["0x1","0x2"], "digest": [...] }'
					className="h-28 w-full resize-y rounded-lg border border-border bg-field px-3.5 py-3 font-mono text-[11.5px] outline-none transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
				/>
			</Field>

			{error && (
				<p className="text-[13px] text-destructive">
					{error}
				</p>
			)}

			{artifact && (
				<div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/30 bg-success/[0.06] px-3.5 py-2.5">
					<FileCode2 className="h-4 w-4 flex-none text-success" />
					<span className="text-[13px] font-medium text-foreground">
						Artifact parsed
					</span>
					<Badge tone="ok">
						{artifact.modules.length} modules
					</Badge>
					<Badge tone="muted">
						{artifact.dependencies.length} deps
					</Badge>
					{artifact.digest && (
						<span className="truncate font-mono text-[11px] text-muted-foreground">
							digest {artifact.digest.slice(0, 12)}…
						</span>
					)}
				</div>
			)}

			<Field
				label="Extra dependency IDs (optional)"
				hint="Transitive deps the build omits — fixes PublishUpgradeMissingDependency"
			>
				<textarea
					value={extra}
					onChange={(e) => handleExtra(e.target.value)}
					spellCheck={false}
					placeholder="0x… , 0x…"
					className="h-16 w-full resize-y rounded-lg border border-border bg-field px-3.5 py-3 font-mono text-[11.5px] outline-none transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
				/>
				<details className="mt-2 rounded-lg border border-border bg-card/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground [&_summary]:cursor-pointer [&_summary]:select-none [&_summary]:font-medium [&_summary]:text-foreground/80 [&[open]_summary]:mb-2">
					<summary>
						Leave empty unless publishing fails — where do
						these IDs come from?
					</summary>
					<p>
						<code className="font-mono text-foreground/80">
							sui move build --dump-bytecode-as-base64
						</code>{' '}
						lists only your <strong>direct</strong>{' '}
						dependencies. The chain needs{' '}
						<strong>every transitive</strong> dependency's
						package ID, so a third-party dependency that
						pulls in others can fail at publish with{' '}
						<code className="font-mono">
							PublishUpgradeMissingDependency
						</code>
						. Add the missing IDs here.
					</p>
					<ul className="mt-1.5 list-disc space-y-0.5 pl-4">
						<li>
							<strong>From the error:</strong> the publish
							failure names the exact missing package ID —
							paste it in and retry.
						</li>
						<li>
							<strong>From a dependency's manifest:</strong>{' '}
							its{' '}
							<code className="font-mono">Move.toml</code> /{' '}
							<code className="font-mono">Move.lock</code>{' '}
							has a{' '}
							<code className="font-mono">
								published-at = "0x…"
							</code>{' '}
							— that is its on-chain ID.
						</li>
						<li>
							<strong>Framework packages</strong> (
							<code className="font-mono">0x1</code>{' '}
							MoveStdlib,{' '}
							<code className="font-mono">0x2</code> Sui)
							are automatic — never add them.
						</li>
					</ul>
					<p className="mt-1.5">
						Packages depending only on the framework (your{' '}
						<code className="font-mono">dependencies</code>{' '}
						are just <code className="font-mono">0x1</code>/
						<code className="font-mono">0x2</code>) need
						nothing here.
					</p>
				</details>
			</Field>

			<div>
				<input
					ref={folderRef}
					type="file"
					className="hidden"
					onChange={(e) => handleFolder(e.target.files)}
					{...({
						webkitdirectory: '',
						directory: '',
					} as any)}
				/>
				<button
					type="button"
					onClick={() => folderRef.current?.click()}
					className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-3 text-left transition hover:border-primary/60 hover:bg-accent"
				>
					<FolderUp className="h-5 w-5 flex-none text-primary" />
					<span className="min-w-0">
						<span className="block text-sm font-medium">
							{source
								? source.packageName ||
									'Project folder attached'
								: 'Attach project folder (for Walrus archive)'}
						</span>
						<span className="block text-[12px] text-muted-foreground">
							Reads Move.toml + sources/ only — nothing
							runs, secrets excluded.
						</span>
					</span>
				</button>
			</div>

			{source && (
				<div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/[0.06] px-3.5 py-3">
					<ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-success" />
					<div className="text-[12.5px] leading-relaxed">
						<span className="font-medium text-foreground">
							{source.files.length} source files attached ·{' '}
							{source.skippedCount} skipped
						</span>
						<p className="text-muted-foreground">
							{source.sensitiveSkipped.length > 0 ? (
								<>
									Excluded by name (never read):{' '}
									<span className="font-mono">
										{source.sensitiveSkipped.join(', ')}
									</span>
									.
								</>
							) : (
								<>
									Only Move.toml, Move.lock and sources/ are
									archived. Build output, .git/,
									node_modules/ and .env files are excluded.
								</>
							)}
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
