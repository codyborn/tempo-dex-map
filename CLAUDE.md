# CLAUDE.md

## Project

Radial tree visualization of TIP-20 tokens on the Tempo DEX. Built with React, D3, and viem.

## Build & Deploy

```bash
cd tempo-app
npm install
npm run build        # tsc -b && vite build — ALWAYS run before pushing
npm run dev          # local dev server
vercel --yes --prod  # deploy to Vercel (from tempo-app/)
```

**Always run `npm run build` before pushing to verify there are no TypeScript errors.** The production build uses strict mode (`tsc -b`) which catches errors that the dev server doesn't (e.g., unused variables).

## Structure

- `tempo-app/` — Vite + React + TypeScript app
  - `src/chain.ts` — Tempo mainnet RPC config (chain ID 4217, basic auth)
  - `src/abi.ts` — ABIs for TIP20, TIP20Factory, Multicall3
  - `src/fetchTokens.ts` — Progressive token streaming via event logs + multicall totalSupply
  - `src/TreeGraph.tsx` — Radial D3 tree layout with zoom/pan, TVL edge labels, tooltips
  - `src/TreeMap.tsx` — Alternative treemap layout (not currently used)
  - `src/App.tsx` — Main app: data loading, TVL slider, token exclude filter, legend

## Key Concepts

- Each TIP-20 token has a `quoteToken()` that points to its parent, forming a tree rooted at pathUSD (`0x20C0...0000`, quoteToken = address(0))
- All tokens use 6 decimals (not 18)
- Factory tokens are discovered via `TokenCreated` events from the TIP20 Factory precompile
- totalSupply is batch-fetched via Multicall3

## Deployment

- GitHub: https://github.com/codyborn/tempo-dex-map
- Vercel: https://tempo-app-gamma.vercel.app
