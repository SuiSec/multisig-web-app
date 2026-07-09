// SPDX-License-Identifier: Apache-2.0
// Browse a Walrus-archived source folder entirely in the browser: fetch the
// .zip and unzip it in-page (fflate), render an expandable file tree, and offer
// the whole folder as a one-click .zip download. No local unzip needed to view.

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';

import {
	downloadSourceZip,
	readSourceArchive,
} from '../lib/walrus';
import { Badge, Spinner } from './ui/kit';

export function SourceArchiveBrowser({
	network,
	blobId,
}: {
	network: string;
	blobId: string;
}) {
	const archive = useQuery({
		queryKey: ['walrus-archive', network, blobId],
		queryFn: () => readSourceArchive(network, blobId),
	});
	const [downloading, setDownloading] = useState(false);

	async function download() {
		setDownloading(true);
		try {
			await downloadSourceZip(network, blobId);
		} finally {
			setDownloading(false);
		}
	}

	return (
		<div>
			<div className="mb-3 flex items-center gap-2">
				<h3 className="text-sm font-semibold">
					Source folder
				</h3>
				{archive.data && (
					<Badge tone="muted">
						{archive.data.length} files
					</Badge>
				)}
				<button
					type="button"
					onClick={download}
					disabled={downloading}
					className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-accent disabled:opacity-60"
				>
					<Download className="h-3 w-3" />
					{downloading ? 'Downloading…' : '.zip'}
				</button>
			</div>

			{archive.isLoading ? (
				<Spinner label="Reading archive…" />
			) : archive.isError ? (
				<p className="text-[13px] text-destructive">
					Archive read failed:{' '}
					{(archive.error as Error).message}
				</p>
			) : archive.data && archive.data.length > 0 ? (
				<div className="space-y-1">
					{archive.data.map((f) => (
						<details
							key={f.path}
							className="rounded-md border border-border-soft [&[open]]:bg-field/50"
						>
							<summary className="cursor-pointer px-2.5 py-1.5 font-mono text-xs text-foreground">
								{f.path}
							</summary>
							<pre className="max-h-80 overflow-auto border-t border-border-soft px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
								{f.content}
							</pre>
						</details>
					))}
				</div>
			) : (
				<p className="text-[13px] text-muted-foreground">
					No source files in the archive.
				</p>
			)}
		</div>
	);
}
