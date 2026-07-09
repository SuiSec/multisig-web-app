// SPDX-License-Identifier: Apache-2.0
// Upload a source archive to Walrus from the proposer's own wallet (public
// data; the multisig is not involved). Writes a RAW blob (not a quilt) via:
// encode → register (sign+execute) → upload → certify (sign+execute) → blobId.
//
// Raw blob (not writeFilesFlow): a single-file quilt stores the bytes inside a
// container, so the public aggregator `/v1/blobs/<quiltId>` returns binary, not
// the manifest JSON. A raw blob makes `/v1/blobs/<blobId>` return the archive
// JSON verbatim — which the verification page, the "view on Walrus" link, and
// msw-verify all rely on.
//
// NOTE: this path costs WAL + SUI and performs two wallet signatures; it loads
// the Walrus WASM encoder in the browser.

import {
	useCurrentNetwork,
	useDAppKit,
} from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { fromBase64 } from '@mysten/sui/utils';
import { walrus } from '@mysten/walrus';
// Pin the Walrus encoder wasm to a real Vite asset URL. Without this the SDK's
// default fetch resolves to the dev server's index.html (SPA fallback), which
// fails WebAssembly.instantiate ("expected magic word 00 61 73 6d").
import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

// How long the archive is stored, in Walrus epochs.
const WALRUS_EPOCHS = 53;

// Walrus upload relays. Writing slivers directly from the browser to every
// storage node is fragile (node availability + CORS) and fails with "Too many
// failures while writing blob to nodes". The relay offloads that fan-out; the
// client pays it a tiny tip (capped below) from the proposer's own wallet.
const WALRUS_UPLOAD_RELAY: Record<string, string> = {
	mainnet: 'https://upload-relay.mainnet.walrus.space',
	testnet: 'https://upload-relay.testnet.walrus.space',
};

function grpcBaseUrl(network: string): string {
	return `https://fullnode.${network}.sui.io:443`;
}

export function useArchiveToWalrus() {
	const dappKit = useDAppKit();
	const network = useCurrentNetwork();

	return useMutation({
		mutationFn: async ({
			bytes,
			owner,
		}: {
			bytes: Uint8Array;
			owner: string;
		}): Promise<{ blobId: string }> => {
			const client = new SuiGrpcClient({
				network,
				baseUrl: grpcBaseUrl(network),
			}).$extend(
				walrus({
					wasmUrl: walrusWasmUrl,
					uploadRelay: {
						host:
							WALRUS_UPLOAD_RELAY[network] ??
							WALRUS_UPLOAD_RELAY.testnet,
						// Max tip (MIST) the relay may charge; it auto-determines
						// the actual amount from the relay's tip-config.
						sendTip: { max: 1_000 },
					},
				}),
			);

			const flow = client.walrus.writeBlobFlow({
				blob: bytes,
			});
			const encoded = await flow.encode();

			// Reuse if already stored. Blob ids are content-addressed, so if this
			// exact archive is already certified + available on Walrus, return it
			// WITHOUT registering/uploading again — no WAL, no gas. Prevents
			// re-paying when re-proposing identical source or retrying after a
			// prior success. (A read probe; cost-free.)
			try {
				const status =
					await client.walrus.getVerifiedBlobStatus({
						blobId: encoded.blobId,
					});
				const certifiedEpoch = (
					status as { initialCertifiedEpoch?: number }
				).initialCertifiedEpoch;
				if (
					status.type !== 'nonexistent' &&
					status.type !== 'invalid' &&
					typeof certifiedEpoch === 'number'
				) {
					return { blobId: encoded.blobId };
				}
			} catch {
				// Status probe failed (e.g. nodes unreachable) — fall through and
				// do a normal write rather than block the archive on a read.
			}

			// 1. Register the blob (first wallet signature). Storage rent (WAL)
			// and gas (SUI) are paid by the proposer's own wallet.
			const registerTx = flow.register({
				owner,
				epochs: WALRUS_EPOCHS,
				deletable: false,
			});
			const reg = await dappKit.signTransaction({
				transaction: registerTx,
			});
			const regRes = await client.executeTransaction({
				transaction: fromBase64(reg.bytes),
				signatures: [reg.signature],
				include: { effects: true },
			});
			const digest =
				regRes.Transaction?.digest ||
				regRes.FailedTransaction?.digest ||
				'';
			await client.waitForTransaction({ digest });

			// 2. Upload slivers to storage nodes.
			await flow.upload({ digest });

			// 3. Certify the blob (second wallet signature).
			const certifyTx = flow.certify();
			const cert = await dappKit.signTransaction({
				transaction: certifyTx,
			});
			await client.executeTransaction({
				transaction: fromBase64(cert.bytes),
				signatures: [cert.signature],
				include: { effects: true },
			});

			return { blobId: encoded.blobId };
		},
		onError: (e: Error) =>
			toast.error(`Walrus archive failed: ${e.message}`),
	});
}
