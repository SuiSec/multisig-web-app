// SPDX-License-Identifier: Apache-2.0

import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { ExtensionSync } from './components/ExtensionSync';
import { RequireAuth } from './components/RequireAuth';
import { ArchivePackage } from './pages/ArchivePackage';
import { Capture } from './pages/Capture';
import { ConnectDapp } from './pages/ConnectDapp';
import { CreateMultisig } from './pages/CreateMultisig';
import { CreateProposal } from './pages/CreateProposal';
import { FaqPage } from './pages/FaqPage';
import { Home } from './pages/Home';
import { ImportProposal } from './pages/ImportProposal';
import { Invitations } from './pages/Invitations';
import { MultisigAssets } from './pages/MultisigAssets';
import { MultisigContracts } from './pages/MultisigContracts';
import { MultisigMembers } from './pages/MultisigMembers';
import { MultisigOverview } from './pages/MultisigOverview';
import { MultisigPending } from './pages/MultisigPending';
import { MultisigSettings } from './pages/MultisigSettings';
import { MultisigTransactions } from './pages/MultisigTransactions';
import { PackageVerification } from './pages/PackageVerification';
import { ProposalDetail } from './pages/ProposalDetail';
import { PublishPackage } from './pages/PublishPackage';
import { Stats } from './pages/Stats';
import { UpgradePackage } from './pages/UpgradePackage';
import { VerifyHome } from './pages/VerifyHome';

export default function App() {
	return (
		<AppShell>
			<ExtensionSync />
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="/apps" element={<ConnectDapp />} />
				{/* Public verification portal — no login. */}
				<Route path="/verify" element={<VerifyHome />} />
				{/* Public network stats — no login. */}
				<Route path="/stats" element={<Stats />} />
				{/* Public FAQ — no login. */}
				<Route path="/faq" element={<FaqPage />} />
				<Route
					path="/package/:packageId"
					element={<PackageVerification />}
				/>
				<Route
					path="/capture"
					element={
						<RequireAuth>
							<Capture />
						</RequireAuth>
					}
				/>
				<Route
					path="/create"
					element={
						<RequireAuth>
							<CreateMultisig />
						</RequireAuth>
					}
				/>
				<Route
					path="/invitations"
					element={
						<RequireAuth>
							<Invitations />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address"
					element={
						<RequireAuth>
							<MultisigOverview />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/assets"
					element={
						<RequireAuth>
							<MultisigAssets />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/transactions"
					element={
						<RequireAuth>
							<MultisigTransactions />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/pending"
					element={
						<RequireAuth>
							<MultisigPending />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/members"
					element={
						<RequireAuth>
							<MultisigMembers />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/settings"
					element={
						<RequireAuth>
							<MultisigSettings />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/propose"
					element={
						<RequireAuth>
							<CreateProposal />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/import"
					element={
						<RequireAuth>
							<ImportProposal />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/contracts"
					element={
						<RequireAuth>
							<MultisigContracts />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/publish"
					element={
						<RequireAuth>
							<PublishPackage />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/archive"
					element={
						<RequireAuth>
							<ArchivePackage />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/upgrade"
					element={
						<RequireAuth>
							<UpgradePackage />
						</RequireAuth>
					}
				/>
				<Route
					path="/multisig/:address/proposal/:digest"
					element={
						<RequireAuth>
							<ProposalDetail />
						</RequireAuth>
					}
				/>
				<Route
					path="*"
					element={<Navigate to="/" replace />}
				/>
			</Routes>
		</AppShell>
	);
}
