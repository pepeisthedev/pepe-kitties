# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fregs is a Web3 DApp for NFT minting on the Base blockchain. Built with React 19, Vite, and Reown AppKit (formerly WalletConnect) for wallet integration.

## Commands

```bash
npm run dev      # Start dev server (localhost:5173)
npm run build    # Production build to dist/
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

## Architecture

### Tech Stack
- **React 19** with TypeScript (mixed JSX/TSX)
- **Vite 6** for build tooling
- **Tailwind CSS 4** with shadcn/ui components
- **Reown AppKit** + Ethers.js for Web3 wallet connection
- **TanStack React Query** for server state

### Key Files
- `src/appkitConfig.tsx` - Web3 wallet configuration (Reown AppKit + EthersAdapter)
- `src/components/MainPage.tsx` - Primary component with smart contract interaction
- `src/components/ui/` - shadcn/ui components (Radix UI primitives with CVA)
- `src/lib/utils.tsx` - Utility functions including `cn()` for Tailwind class merging
- `src/assets/abis/` - Smart contract ABIs for Ethers.js interaction

### Environment Variables
Required in `.env` (see `.env.example`):
- `VITE_REOWN_PROJECT_ID` - WalletConnect project ID
- `KITTEN_CONTRACT_ADDRESS` - Smart contract address on Base

### Styling System
- Tailwind v4 with HSL CSS variables for theming
- Custom comic/horror fonts: Creepster, Nosifer, Butcherman, Bangers, Bungee
- Custom animations in `src/index.css`: pulse-rainbow, jackpot, count-up
- Purple gradient background theme with orange accents

### Design System
The `.claude/skills/makeover/` directory contains a Claude Code skill for AI-assisted theme redesigns using the frontend-design plugin.
