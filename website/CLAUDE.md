# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fregs is a Web3 DApp for NFT minting on the Base blockchain. Users can mint frog NFTs with randomized traits, collect items, apply items to modify traits, open treasure chests, and spin a reward wheel. Built with React 19, Vite, and Reown AppKit for wallet integration.

## Commands

```bash
npm run dev      # Start dev server (localhost:5173)
npm run build    # Production build to dist/
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

No test framework is configured.

## Architecture

### Tech Stack
- **React 19** with TypeScript (mixed JSX/TSX — entry points are JSX, components are TSX)
- **Vite 6** for build tooling
- **Tailwind CSS 4** with shadcn/ui components
- **Reown AppKit** + Ethers.js v6 for Web3 wallet connection
- **TanStack React Query** for server state caching

### App Composition

```
main.jsx → QueryClientProvider → ThemeProvider → App.jsx → MainPage.tsx
```

- `main.jsx` initializes AppKit (side-effect import), wraps app in providers
- `App.jsx` is a thin wrapper rendering `MainPage`
- **No React Router** — `MainPage.tsx` implements SPA navigation via `useState<SectionType>` with sections like `"landing"`, `"mint"`, `"collection"`, etc.
- `Header.tsx` renders nav buttons; admin section is conditionally shown via `useIsOwner()`

### Smart Contract Integration

Five contracts are used, each accessed through `useContracts()` which provides read (provider) and write (signer) instances:

| Contract | Type | Purpose |
|----------|------|---------|
| Fregs | ERC721 | Main NFT collection |
| FregsItems | ERC1155 | Items/equipment |
| FregsMintPass | ERC1155 | Free mint passes |
| FregCoin | ERC20 | Utility token |
| FregsSVGRenderer | — | On-chain SVG rendering |

ABIs live in `src/assets/abis/`. Contract addresses are loaded from `.env` via `import.meta.env.VITE_*`.

### Custom Hooks (`src/hooks/`)

All hooks are exported from `src/hooks/index.ts` and follow the pattern of returning `{ data, loading, error, refetch }`:

- `useContracts()` — Read/write contract instances from wallet provider
- `useContractData()` — Fetches all on-chain state (prices, supply, weights) in parallel
- `useOwnedKitties()` — User's NFT collection with trait metadata
- `useOwnedItems()` — User's ERC1155 item balances
- `useUnclaimedKitties()` — Rewards available to claim
- `useFregCoinBalance()` — ERC20 token balance
- `useIsOwner()` — Checks if connected wallet is contract owner

### Item System

`src/config/items.json` is the single source of truth for item definitions. Each item has an `id`, `category` (utility/skin/head/special/external), and optional properties like `targetTraitType`, `traitFileName`, and incompatibility rules. The config is imported by `src/config/contracts.ts`.

### KittyRenderer (SVG Composition)

`KittyRenderer.tsx` composes frog images by layering SVGs: background → body → stomach → head → mouth. Base trait SVGs are in `public/frogz/default/`, item-applied traits in `public/frogz/from_items/`. Colors are applied by fetching the SVG, replacing the placeholder color `#65b449` with the NFT's assigned color, and creating a blob URL.

### Styling
- Tailwind v4 with HSL CSS variables for dark/light theming (via `ThemeContext`)
- Custom fonts: Creepster, Nosifer, Butcherman, Bangers, Bungee (loaded from Google Fonts in `index.html`)
- Custom animations defined in `src/index.css`: pulse-rainbow, jackpot, count-up, float, wiggle, glow-pulse, gradient-shift
- shadcn/ui components in `src/components/ui/` (Radix UI primitives with CVA)

### Environment Variables

Required in `.env` (see `.env.example`):
- `VITE_REOWN_PROJECT_ID` — WalletConnect project ID (get at cloud.reown.com)
- `VITE_FREGS_ADDRESS` — Main NFT contract
- `VITE_FREGS_ITEMS_ADDRESS` — Items contract
- `VITE_FREGS_MINTPASS_ADDRESS` — Mint pass contract
- `VITE_BEAD_PUNKS_ADDRESS` — External cross-contract items

Optional: `VITE_FREGCOIN_ADDRESS`, `VITE_SVG_RENDERER_ADDRESS`

### Sibling Hardhat Project

The `../hardhat/` directory contains the Solidity smart contracts (Fregs.sol, FregsItems.sol, FregsMintPass.sol, FregCoin.sol, FregsSVGRenderer.sol) with deployment scripts and typechain bindings.
