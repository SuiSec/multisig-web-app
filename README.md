# MultiSig — web frontend

The **open-source frontend** for a non-custodial [Sui](https://sui.io) multisig
console: create shared wallets, propose and review transactions, sign with your
own wallet, and publish/verify Move packages — all client-side.

**Live app:** https://multisig.suisec.app

This repository is the browser app only. It is **non-custodial**: it never holds
private keys and never signs on your behalf — all signing happens locally in
your own wallet (dapp-kit). It talks to a coordination **relay** (a separate,
closed-source service) purely to store proposals, partial signatures, and public
package records; the relay never holds keys, never signs, and never contacts a
fullnode.

## Why the frontend is open source

For a tool that helps you sign blockchain transactions, the code that builds and
displays those transactions is the critical trust surface. Publishing it means
anyone can audit exactly what the app does before they sign — and, together with
a reproducible build, verify that the deployed bundle matches this source.

## Layout

```
app/   React + Vite frontend
sdk/   @mysten/sagat — the client-side relay API contract (types + client)
```

Both are workspaces of this repo; the app resolves the SDK locally.

## Develop

Requires [Bun](https://bun.sh) and Node ≥ 22 (for `wrangler` if you deploy).

```bash
bun install
cp app/.env.example app/.env      # then edit VITE_API_URL etc.
bun run dev                       # builds the SDK, starts the app on :5173
```

## Build

```bash
bun run build                     # builds sdk, then app → app/dist
```

The build makes **zero external font/CDN requests** (fonts are self-hosted via
Fontsource; a Vite plugin strips a remote font `@import` a dependency bundles),
so it works under a strict CSP and content-addressed hosting.

## Configuration

All configuration is public build-time `VITE_*` env — see
[`app/.env.example`](app/.env.example). The important one:

- `VITE_API_URL` — the relay this frontend talks to. A self-hosted deployment
  must set it to its own relay URL.

## Security model

Signing never leaves your wallet. The app additionally:

- **binds** each proposal to the multisig locally re-derived from its members
  and threshold (a tampered relay cannot re-target a signature);
- **simulates** every transaction client-side and shows human-readable effects
  before you sign;
- asserts the bytes it displays are the exact bytes your wallet will sign;
- derives the transaction **digest** locally and asks you to cross-check it
  against your wallet screen, your co-signers, and a second device.

See the in-app review panel for details. AI explanation is opt-in and only ever
sends data (with your own key) when you explicitly click.

## License

[Apache-2.0](LICENSE). Portions of `sdk/` are adapted from Mysten Labs' Sagat
(Apache-2.0).
