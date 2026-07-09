// SPDX-License-Identifier: Apache-2.0

import { DraftStatus } from '@mysten/sagat';
import { formatAddress } from '@mysten/sui/utils';
import {
	ArrowLeft,
	Check,
	CheckCircle2,
	Copy,
	ExternalLink,
	Mail,
	Users,
	X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
	Badge,
	Button,
	Card,
	EmptyState,
	Spinner,
} from '../components/ui/kit';
import { useApiAuth } from '../contexts/ApiAuthContext';
import {
	useDraft,
	useJoinDraft,
	useMyDrafts,
} from '../hooks/drafts';
import {
	useInvitations,
	useRespondToInvitation,
} from '../hooks/invitations';

export function Invitations() {
	const [params] = useSearchParams();
	const draftId = params.get('draft');
	return draftId ? (
		<DraftDetail id={draftId} />
	) : (
		<InvitationsList />
	);
}

function DraftDetail({ id }: { id: string }) {
	const { data: draft, isLoading } = useDraft(id);
	const { currentAddress } = useApiAuth();
	const join = useJoinDraft();
	const [copied, setCopied] = useState(false);

	if (isLoading)
		return <Spinner label="Loading invitation…" />;
	if (!draft)
		return (
			<EmptyState
				title="Invitation not found"
				body="This draft may have been cancelled or finalized."
			/>
		);

	const inviteLink = `${location.origin}/invitations?draft=${id}`;
	const myAddr = currentAddress?.address;
	const myMember = draft.members.find(
		(m) => m.address === myAddr,
	);
	const amPending = myMember && !myMember.joined;

	async function copyLink() {
		await navigator.clipboard.writeText(inviteLink);
		setCopied(true);
		toast.success('Invite link copied');
		setTimeout(() => setCopied(false), 2000);
	}

	if (
		draft.status === DraftStatus.FINALIZED &&
		draft.finalizedAddress
	) {
		return (
			<div className="mx-auto max-w-xl space-y-6">
				<Backlink />
				<Card className="space-y-3 p-6 text-center">
					<CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
					<h1 className="text-lg font-semibold">
						{draft.name || 'Multisig'} is live
					</h1>
					<p className="text-sm text-muted-foreground">
						All members joined and the multisig was created.
					</p>
					<Link to={`/multisig/${draft.finalizedAddress}`}>
						<Button>
							Open multisig
							<ExternalLink className="h-4 w-4" />
						</Button>
					</Link>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-xl space-y-6">
			<Backlink />
			<div>
				<div className="flex items-center gap-2">
					<h1 className="font-display text-[22px] font-semibold tracking-tight">
						{draft.name || 'Multisig invitation'}
					</h1>
					<Badge tone="warn">collecting members</Badge>
				</div>
				<p className="text-sm text-muted-foreground">
					{draft.joinedCount}/{draft.members.length} members
					joined · threshold {draft.threshold}/
					{draft.totalWeight}
				</p>
			</div>

			<Card className="space-y-3 p-5">
				<span className="text-xs font-medium text-muted-foreground">
					Members
				</span>
				{draft.members.map((m) => (
					<div
						key={m.address}
						className="flex items-center justify-between text-sm"
					>
						<span className="font-mono text-xs">
							{formatAddress(m.address)}
							{m.address === myAddr && ' (you)'} · weight{' '}
							{m.weight}
						</span>
						{m.joined ? (
							<Badge tone="ok">
								<CheckCircle2 className="h-3 w-3" /> joined
							</Badge>
						) : (
							<Badge tone="muted">pending</Badge>
						)}
					</div>
				))}
			</Card>

			<Card className="space-y-3 p-5">
				<span className="text-xs font-medium text-muted-foreground">
					Invite link
				</span>
				<div className="flex gap-2">
					<input
						readOnly
						value={inviteLink}
						aria-label="Invite link"
						className="flex-1 rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs"
					/>
					<Button variant="outline" onClick={copyLink}>
						{copied ? (
							<Check className="h-4 w-4" />
						) : (
							<Copy className="h-4 w-4" />
						)}
						Copy
					</Button>
				</div>
				<p className="text-[11px] text-muted-foreground">
					Send this to each member. They open it, connect
					their wallet, and join — the multisig is created
					automatically once everyone has joined.
				</p>
			</Card>

			{amPending && (
				<Button
					loading={join.isPending}
					onClick={() => join.mutate(id)}
				>
					<Users className="h-4 w-4" />
					Join this multisig
				</Button>
			)}
			{myMember && myMember.joined && (
				<Badge tone="ok">
					<CheckCircle2 className="h-3 w-3" /> You’ve joined
					— waiting for the others
				</Badge>
			)}
			{!myMember && (
				<p className="text-sm text-muted-foreground">
					This invite is for specific addresses. Your
					connected address isn’t one of them — switch to
					the invited account.
				</p>
			)}
		</div>
	);
}

function InvitationsList() {
	const { data: drafts, isLoading: loadingDrafts } =
		useMyDrafts();
	const { data: invitations, isLoading } = useInvitations();
	const respond = useRespondToInvitation();

	const empty =
		!loadingDrafts &&
		!isLoading &&
		(drafts?.length ?? 0) === 0 &&
		(invitations?.length ?? 0) === 0;

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<Backlink />
			<div>
				<h1 className="font-display text-[22px] font-semibold tracking-tight">
					Invitations
				</h1>
				<p className="text-sm text-muted-foreground">
					Multisigs you’ve been invited to join.
				</p>
			</div>

			{(loadingDrafts || isLoading) && <Spinner />}
			{empty && (
				<EmptyState
					icon={<Mail className="h-8 w-8" />}
					title="No pending invitations"
				/>
			)}

			{(drafts?.length ?? 0) > 0 && (
				<div className="space-y-2">
					{drafts?.map((d) => (
						<Link
							key={d.id}
							to={`/invitations?draft=${d.id}`}
						>
							<Card className="flex items-center justify-between p-4 transition hover:border-primary/50">
								<div>
									<div className="font-medium">
										{d.name || 'Untitled multisig'}
									</div>
									<div className="text-xs text-muted-foreground">
										{d.joinedCount}/{d.members.length}{' '}
										joined · threshold {d.threshold}
									</div>
								</div>
								<Badge tone="warn">collecting</Badge>
							</Card>
						</Link>
					))}
				</div>
			)}

			{invitations?.map((m) => (
				<Card
					key={m.address}
					className="flex items-center justify-between p-4"
				>
					<div>
						<div className="font-medium">
							{m.name || 'Untitled multisig'}
						</div>
						<div className="font-mono text-xs text-muted-foreground">
							{formatAddress(m.address)} · {m.threshold}/
							{m.totalWeight}
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							loading={respond.isPending}
							onClick={() =>
								respond.mutate({
									multisigAddress: m.address,
									accept: false,
								})
							}
						>
							<X className="h-4 w-4" /> Reject
						</Button>
						<Button
							loading={respond.isPending}
							onClick={() =>
								respond.mutate({
									multisigAddress: m.address,
									accept: true,
								})
							}
						>
							<Check className="h-4 w-4" /> Accept
						</Button>
					</div>
				</Card>
			))}
		</div>
	);
}

function Backlink() {
	return (
		<Link
			to="/"
			className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
		>
			<ArrowLeft className="h-4 w-4" /> Back
		</Link>
	);
}
