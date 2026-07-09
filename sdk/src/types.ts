// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export interface AuthConnectRequest {
	signature: string;
	expiry: string;
}

export interface AuthResponse {
	success: boolean;
}

export interface AuthCheckResponse {
	authenticated: boolean;
	addresses: Address[];
}

export interface Address {
	address: string;
	publicKey: string;
}

export interface CreateMultisigRequest {
	publicKeys: string[];
	weights: number[];
	threshold: number;
	name?: string;
}

export interface SignedMessageRequest {
	signature: string;
}

export interface MultisigWithMembers extends Multisig {
	members: MultisigMember[];
	totalMembers: number;
	totalWeight: number;
	proposers: Omit<MultisigProposer, 'multisigAddress'>[];
	/**
	 * Base64 of the composite multisig public key
	 * (`MultiSigPublicKey.toRawBytes()`). Read-only clients can present an
	 * account whose public key derives this address.
	 */
	publicKey: string;
}

export interface Multisig {
	address: string;
	isVerified: boolean;
	threshold: number;
	name: string | null;
}

export interface MultisigMember {
	multisigAddress: string;
	publicKey: string;
	weight: number;
	isAccepted: boolean;
	isRejected: boolean;
	order: number;
}

// Package verification records (published/upgraded Move packages + Walrus archive)
export interface PackageRecord {
	packageId: string;
	network: string;
	multisigAddress: string;
	blobId: string;
	buildDigest: string | null;
	// Optional source provenance, mirrored from the proposal (baseline for the
	// next upgrade's diff; baseline trust is chain-anchored, not record-based).
	gitRepo: string | null;
	gitCommit: string | null;
	toolchain: string | null;
	txDigest: string;
	name: string | null;
	version: number | null;
	createdBy: string;
	createdAt: string;
}

export interface RecordPackageRequest {
	packageId: string;
	network: string;
	multisigAddress: string;
	blobId: string;
	buildDigest?: string | null;
	gitRepo?: string | null;
	gitCommit?: string | null;
	toolchain?: string | null;
	txDigest: string;
	name?: string | null;
	version?: number | null;
}

/** Kind of a proposal — drives the publish/upgrade verification panel. */
export type ProposalKind =
	'generic' | 'publish' | 'upgrade';

/** Public lifetime aggregate stats (no per-user data). */
export interface Stats {
	/** Multisig addresses created (live count). */
	multisigs: number;
	/** Multisig transactions ever proposed. */
	proposalsCreated: number;
	/** Proposals executed on-chain (success). */
	proposalsExecuted: number;
	/** Packages published via multisig. */
	publishes: number;
	/** Package upgrades via multisig. */
	upgrades: number;
}

// Proposal types
export enum ProposalStatus {
	PENDING = 0,
	CANCELLED = 1,
	SUCCESS = 2,
	FAILURE = 3,
}

export interface CreateProposalRequest {
	multisigAddress: string;
	transactionBytes: string;
	signature: string;
	description?: string;
	network: string;
	// Verifiable publish/upgrade metadata (optional; relay stores, never verifies).
	kind?: ProposalKind;
	buildDigest?: string | null;
	sourceBlobId?: string | null;
	toolchain?: string | null;
	gitRepo?: string | null;
	gitCommit?: string | null;
	attestation?: string | null;
}

export interface Proposal {
	id: number;
	multisigAddress: string;
	digest: string;
	status: ProposalStatus;
	transactionBytes: string;
	proposerAddress: string;
	description: string | null;
	totalWeight: number;
	currentWeight: number;
	network: string;
	// Verifiable publish/upgrade metadata. `kind` defaults to 'generic'.
	kind: string;
	buildDigest: string | null;
	sourceBlobId: string | null;
	toolchain: string | null;
	gitRepo: string | null;
	gitCommit: string | null;
	attestation: string | null;
}

/** A proposal with its signatures */
export interface ProposalWithSignatures extends Proposal {
	signatures: ProposalSignature[];
	rejections: ProposalRejection[];
}

/**
 * A proposal with its signatures and multisig composition,
 * but without the confidential information.
 */
export interface PublicProposal extends Proposal {
	signatures: ProposalSignature[];
	rejections: ProposalRejection[];
	multisig: {
		address: string;
		name?: string | null;
		threshold: number;
		members: {
			publicKey: string;
			weight: number;
			order: number;
		}[];
	};
}
/** A signature for a given proposal  */
export interface ProposalSignature {
	proposalId: number;
	publicKey: string;
	signature: string;
	// Per-signer self-reported attestation (relay does not verify — transparency
	// only): did this signer locally reproduce the build digest / read the diff?
	reproduced: boolean;
	reviewedDiff: boolean;
}

/** A reject vote for a given proposal (signed personal message, NOT a tx sig) */
export interface ProposalRejection {
	publicKey: string;
	signature: string;
}

/** External multisig proposer */
export interface MultisigProposer {
	multisigAddress: string;
	address: string;
	addedBy: string;
	addedAt: string;
}

/** The default layout for a paginated response */
export interface PaginatedResponse<T> {
	data: T[];
	hasNextPage: boolean;
	nextCursor: string;
}

export interface VoteProposalRequest {
	signature: string;
	// Optional per-signer attestation flags (see ProposalSignature).
	reproduced?: boolean;
	reviewedDiff?: boolean;
}

export interface VoteProposalResponse {
	hasReachedThreshold: boolean;
}

export interface CancelProposalRequest {
	signature: string;
}

export interface RejectProposalRequest {
	signature: string;
}

export interface RejectProposalResponse {
	// True once accumulated reject weight makes the approval threshold
	// unreachable (totalWeight - rejectWeight < threshold) — the proposal can
	// now be discarded by any member.
	unreachable: boolean;
}

// Address types
export interface Address {
	publicKey: string;
	address: string;
}

// Draft multisig types (members collected by address before finalization).
export enum DraftStatus {
	COLLECTING = 0,
	FINALIZED = 1,
	CANCELLED = 2,
}

export interface DraftMemberView {
	address: string;
	weight: number;
	order: number;
	joined: boolean;
}

export interface DraftView {
	id: string;
	name: string | null;
	creator: string;
	threshold: number;
	status: DraftStatus;
	finalizedAddress: string | null;
	members: DraftMemberView[];
	totalWeight: number;
	joinedCount: number;
}

export interface CreateDraftRequest {
	name?: string;
	threshold: number;
	members: { address: string; weight: number }[];
}

export interface CreateDraftResponse {
	id: string;
	finalizedAddress: string | null;
}

export interface JoinDraftResponse {
	joined: number;
	finalized: boolean;
	address: string | null;
}
