// SPDX-License-Identifier: Apache-2.0
// Advisory multisig-config safety score. Renders scoreMultisigConfig()'s
// verdict as guidance — it NEVER blocks creating or using any configuration.
// Purely local: the score is computed in the browser from the weights and
// threshold already on screen; nothing is collected, sent, or stored.

import {
	AlertTriangle,
	Info,
	ShieldAlert,
	ShieldCheck,
} from 'lucide-react';
import { useMemo } from 'react';

import {
	scoreMultisigConfig,
	type SafetyRating,
	type SafetySeverity,
} from '../lib/multisigSafety';
import { Card } from './ui/kit';

const RATING_META: Record<
	SafetyRating,
	{ label: string; cls: string }
> = {
	strong: {
		label: 'Strong',
		cls: 'text-success border-success/40 bg-success/10',
	},
	adequate: {
		label: 'Adequate',
		cls: 'text-primary border-primary/40 bg-primary/10',
	},
	weak: {
		label: 'Weak',
		cls: 'text-warning border-warning/40 bg-warning/10',
	},
	unsafe: {
		label: 'Unsafe',
		cls: 'text-destructive border-destructive/50 bg-destructive/10',
	},
};

function SeverityIcon({
	severity,
}: {
	severity: SafetySeverity;
}) {
	if (severity === 'critical')
		return (
			<AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-destructive" />
		);
	if (severity === 'warning')
		return (
			<AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-warning" />
		);
	return (
		<Info className="mt-0.5 h-3.5 w-3.5 flex-none text-muted-foreground" />
	);
}

export function MultisigSafetyScore({
	weights,
	threshold,
}: {
	weights: number[];
	threshold: number;
}) {
	const score = useMemo(
		() => scoreMultisigConfig(weights, threshold),
		[weights, threshold],
	);
	if (!score) return null;

	const meta = RATING_META[score.rating];

	return (
		<Card className="space-y-3 p-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
					{score.rating === 'strong' ? (
						<ShieldCheck className="h-4 w-4 flex-none text-success" />
					) : (
						<ShieldAlert
							className={`h-4 w-4 flex-none ${
								score.rating === 'unsafe'
									? 'text-destructive'
									: 'text-warning'
							}`}
						/>
					)}
					Configuration safety
				</div>
				<span
					className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}
				>
					{meta.label}
				</span>
			</div>

			<p className="text-[11px] text-muted-foreground">
				Needs {score.minSigners} of {score.memberCount}{' '}
				member
				{score.memberCount > 1 ? 's' : ''} to reach the{' '}
				{score.threshold}/{score.totalWeight} threshold.
				Guidance only — this never blocks creation, and is
				computed locally (nothing is sent anywhere).
			</p>

			<ul className="space-y-2">
				{score.findings.map((f, i) => (
					<li key={i} className="flex gap-2">
						<SeverityIcon severity={f.severity} />
						<div className="min-w-0">
							<div className="text-xs font-medium text-foreground">
								{f.title}
							</div>
							<div className="text-[11.5px] leading-relaxed text-muted-foreground">
								{f.detail}
								{f.reference && (
									<span className="italic">
										{' '}
										{f.reference}
									</span>
								)}
							</div>
						</div>
					</li>
				))}
			</ul>
		</Card>
	);
}
