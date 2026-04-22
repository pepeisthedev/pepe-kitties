# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pepe Kitties (Fregs) is a Web3 NFT dApp on the Base blockchain. Users mint frog NFTs with randomized traits, collect and apply items, open treasure chests, and spin a reward wheel. The repo is a monorepo with two independent packages: a React frontend (`website/`) and Solidity smart contracts (`hardhat/`).

## Commands

### Website (`website/`)

```bash
cd website && npm install
npm run dev      # Dev server at localhost:5173
npm run build    # Production build to dist/
npm run lint     # ESLint
npm run preview  # Preview production build
```

No test framework is configured for the frontend.

### Hardhat (`hardhat/`)

```bash
cd hardhat && npm install
npm run compile        # Compile Solidity contracts
npm run test           # Run contract tests
npm run extract-abis   # Extract ABIs to website/src/assets/abis/
npm run build          # compile + extract-abis
npm run node           # Start local Hardhat node
npm run deploy:local   # Deploy to localhost
npm run deploy:sepolia # Deploy to Base Sepolia testnet
npm run deploy:mainnet # Deploy to Base mainnet
```

## Architecture

### Website — React 19 + Vite 6 + TypeScript

**Entry flow:** `main.jsx` → QueryClientProvider → ThemeProvider → `App.jsx` → `MainPage.tsx`

No React Router — `MainPage.tsx` implements SPA navigation via `useState<SectionType>` with sections like `"landing"`, `"mint"`, `"collection"`, etc. `Header.tsx` renders nav buttons; admin section gated by `useIsOwner()`.

**Web3 integration:** Reown AppKit (WalletConnect) configured in `appkitConfig.tsx`. Five contracts accessed through `useContracts()` hook providing read (provider) and write (signer) instances:

| Contract | Type | Purpose |
|----------|------|---------|
| Fregs | ERC721 | Main NFT collection |
| FregsItems | ERC1155 | Items/equipment |
| FregsMintPass | ERC1155 | Free mint passes |
| FregCoin | ERC20 | Utility token |
| FregsSVGRenderer | — | On-chain SVG rendering |

**Hooks** (`src/hooks/`, exported from `index.ts`): All follow `{ data, loading, error, refetch }` pattern — `useContractData()`, `useOwnedKitties()`, `useOwnedItems()`, `useUnclaimedKitties()`, `useFregCoinBalance()`, `useIsOwner()`.

**Item system:** built-in items live in `src/config/items.json`, while dynamically added test items live in `src/config/dynamic-items.json` keyed by chain ID. `src/config/contracts.ts` merges the built-ins with the active chain's dynamic bucket for the website runtime.

**KittyRenderer:** Composes frog images by layering SVGs (background → body → stomach → head → mouth). Base traits in `public/frogz/default/`, item-applied traits in `public/frogz/from_items/`. Colors applied by replacing placeholder `#65b449` in SVGs.

**Styling:** Tailwind v4 with HSL CSS variables for dark/light theming (`ThemeContext`). Custom fonts: Creepster, Nosifer, Butcherman, Bangers, Bungee. shadcn/ui components in `src/components/ui/` (Radix UI + CVA).

### Hardhat — Solidity 0.8.30

**Core contracts:** `Fregs.sol` (ERC721A NFT), `FregsItems.sol` (ERC1155 items), `FregsMintPass.sol` (ERC1155 passes), `FregCoin.sol` (ERC20 token), `FregsLiquidity.sol`, `SpinTheWheel.sol`, `FregsSVGRenderer.sol` (on-chain SVG rendering).

**Utilities** (`contracts/utils/`): `BasicRoyalties.sol`, `OwnableBasic.sol`, SSTORE2 bytecode storage, SVG writer helpers.

**Dependencies:** OpenZeppelin 5.3.0, ERC721A 4.3.0, @limitbreak/creator-token-standards 5.0.0.

**Networks:** localhost (31337), Base Sepolia (84532), Base mainnet (8453).

### Environment Variables

Website requires `.env` (see `.env.example`):
- `VITE_REOWN_PROJECT_ID` — WalletConnect project ID (cloud.reown.com)
- `VITE_FREGS_ADDRESS`, `VITE_FREGS_ITEMS_ADDRESS`, `VITE_FREGS_MINTPASS_ADDRESS`, `VITE_BEAD_PUNKS_ADDRESS` — Contract addresses

ABIs live in `website/src/assets/abis/` and are generated from the hardhat project via `npm run extract-abis`.
