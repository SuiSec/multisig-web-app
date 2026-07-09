// SPDX-License-Identifier: Apache-2.0
// Multisig configuration safety score — ADVISORY ONLY, never blocks.
//
// PRIVACY: a pure function over the weights + threshold the user is already
// entering (or that are already stored). It collects nothing, sends nothing,
// needs no network, and stores nothing. No public keys, no addresses — the
// structural math needs neither. Contrast the AI-explain panel, which sends
// data to a third party; this is local arithmetic with zero egress.
//
// The rules encode the loss-causing root causes from real multisig
// compromises: a single key able to act alone / too few signatures needed
// (Harmony fell to a 2-of-5), a minority of weight able to execute or weight
// concentrated in a few members (Ronin was 5-of-9 but one org controlled the
// majority), and the tool's blind spot — it cannot see whether the keys are
// actually held on separate devices/people (Ronin, Multichain).

export type SafetySeverity =
	'critical' | 'warning' | 'info';

export interface SafetyFinding {
	severity: SafetySeverity;
	title: string;
	/** Plain-language why it matters. */
	detail: string;
	/** A historical case that makes the risk concrete, when one applies. */
	reference?: string;
}

export type SafetyRating =
	'unsafe' | 'weak' | 'adequate' | 'strong';

export interface SafetyScore {
	rating: SafetyRating;
	/** Fewest members whose combined weight reaches the threshold — the fewest
	 *  keys an attacker must compromise to move funds. */
	minSigners: number;
	memberCount: number;
	totalWeight: number;
	threshold: number;
	findings: SafetyFinding[];
}

/**
 * Score a multisig config from its member weights and threshold. Returns null
 * when the config isn't complete enough to score (no members, non-positive
 * total weight, or non-positive threshold) so callers can simply hide the panel
 * mid-edit. Weights are read as given; non-positive entries contribute 0.
 */
export function scoreMultisigConfig(
	weights: number[],
	threshold: number,
): SafetyScore | null {
	const w = weights.map((x) =>
		Number.isFinite(x) && x > 0 ? Math.floor(x) : 0,
	);
	const memberCount = w.length;
	const totalWeight = w.reduce((a, x) => a + x, 0);
	if (memberCount < 1 || totalWeight < 1 || threshold < 1)
		return null;

	// Fewest members to reach the threshold: take the largest weights first.
	const desc = [...w].sort((a, b) => b - a);
	let acc = 0;
	let minSigners = 0;
	for (const x of desc) {
		if (acc >= threshold) break;
		acc += x;
		minSigners += 1;
	}
	const unreachable = acc < threshold; // threshold exceeds total weight

	const maxWeight = desc[0] ?? 0;
	const singleCanSign = maxWeight >= threshold;
	const thresholdRatio = threshold / totalWeight;
	const isMofM =
		!unreachable &&
		memberCount > 1 &&
		minSigners === memberCount;

	const findings: SafetyFinding[] = [];

	if (unreachable) {
		findings.push({
			severity: 'critical',
			title: 'Threshold is unreachable',
			detail: `The threshold (${threshold}) exceeds the total weight (${totalWeight}), so no set of signatures can ever execute. Funds would be permanently locked.`,
		});
	} else if (memberCount === 1) {
		findings.push({
			severity: 'critical',
			title: 'Single-signer wallet, not a multisig',
			detail:
				'With one member there is no shared control — a single compromised key moves all funds. Add members and require more than one signature.',
		});
	} else if (singleCanSign) {
		findings.push({
			severity: 'critical',
			title: 'One member can approve alone',
			detail:
				'A single member holds enough weight to meet the threshold by themselves, so they can move funds with no one else. This defeats the point of a multisig — no single key should reach the threshold.',
		});
	} else if (minSigners === 2) {
		findings.push({
			severity: 'warning',
			title: 'Only two signatures needed',
			detail:
				'Two compromised keys are enough to drain the wallet. Consider requiring at least three independent signers for anything of value.',
			reference:
				'The Harmony Horizon bridge was a 2-of-5 and fell when two keys were taken.',
		});
	}

	// A minority of the total weight being able to execute — independent of the
	// count checks above (skip when already flagged single-signer).
	if (
		!unreachable &&
		!singleCanSign &&
		thresholdRatio <= 0.5
	) {
		findings.push({
			severity: 'warning',
			title: 'A minority of the weight can execute',
			detail: `The threshold is ${Math.round(
				thresholdRatio * 100,
			)}% of the total weight, so a minority can approve without the rest. Set the threshold above half the total weight.`,
			reference:
				'Ronin was 5-of-9, but one organization effectively controlled a majority of the keys.',
		});
	}

	// Weight concentration: far fewer members than half can reach the threshold,
	// even though no single one can. Only meaningful with enough members.
	if (
		!unreachable &&
		!singleCanSign &&
		memberCount >= 4 &&
		minSigners > 1 &&
		minSigners < Math.ceil(memberCount / 2) &&
		thresholdRatio > 0.5
	) {
		findings.push({
			severity: 'warning',
			title: 'Weight is concentrated in a few members',
			detail: `Just ${minSigners} of ${memberCount} members hold enough combined weight to execute. A few large weights outweigh everyone else — spread weight more evenly so approval genuinely needs a broad set.`,
		});
	}

	if (isMofM) {
		findings.push({
			severity: 'warning',
			title: 'Every member must sign (M-of-M)',
			detail:
				'Reaching the threshold requires all members, so losing any single key locks the funds permanently. Keep at least one signer of margin (e.g. 3-of-4 rather than 4-of-4).',
		});
	}

	// Always shown: the tool cannot verify how the keys are actually held.
	findings.push({
		severity: 'info',
		title: 'Keep the keys genuinely independent',
		detail:
			'This score cannot see how the keys are stored. Keep each member on a different device and wallet, held by a different person or organization. Co-located keys turn a multisig back into a single point of failure.',
		reference:
			'Ronin and Multichain both failed because supposedly separate keys were controlled by one party.',
	});

	const critical = findings.some(
		(f) => f.severity === 'critical',
	);
	const warnings = findings.filter(
		(f) => f.severity === 'warning',
	).length;
	const rating: SafetyRating = critical
		? 'unsafe'
		: warnings >= 2
			? 'weak'
			: warnings === 1
				? 'adequate'
				: 'strong';

	return {
		rating,
		minSigners,
		memberCount,
		totalWeight,
		threshold,
		findings,
	};
}
