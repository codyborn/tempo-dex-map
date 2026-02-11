import { defineChain } from "viem";
import type { Address } from "viem";

// ── Network types ────────────────────────────────────────────────

export type NetworkId = "mainnet" | "testnet";

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  chain: ReturnType<typeof defineChain>;
  rpcUrl: string;
  rpcAuth?: string;
  precompiles: {
    TIP20_FACTORY: Address;
    STABLECOIN_DEX: Address;
    MULTICALL3: Address;
  };
  genesisTokens: readonly Address[];
}

// ── Mainnet ──────────────────────────────────────────────────────

const mainnetChain = defineChain({
  id: 4217,
  name: "Tempo",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.tempo.xyz"],
    },
  },
});

// ── Testnet ──────────────────────────────────────────────────────

const testnetChain = defineChain({
  id: 42431,
  name: "Tempo Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.moderato.tempo.xyz"],
    },
  },
});

// ── Shared precompile addresses ──────────────────────────────────

const PRECOMPILES = {
  TIP20_FACTORY: "0x20Fc000000000000000000000000000000000000" as Address,
  STABLECOIN_DEX: "0xDEc0000000000000000000000000000000000000" as Address,
  MULTICALL3: "0xcA11bde05977b3631167028862bE2a173976CA11" as Address,
};

const GENESIS_TOKENS = [
  "0x20C0000000000000000000000000000000000000" as Address, // pathUSD
] as const;

// ── Exports ──────────────────────────────────────────────────────

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    chain: mainnetChain,
    rpcUrl: "https://rpc.tempo.xyz",
    rpcAuth: "Basic " + btoa("angry-meitner:cool-hypatia"),
    precompiles: PRECOMPILES,
    genesisTokens: GENESIS_TOKENS,
  },
  testnet: {
    id: "testnet",
    label: "Testnet",
    chain: testnetChain,
    rpcUrl: "https://rpc.moderato.tempo.xyz",
    precompiles: PRECOMPILES,
    genesisTokens: GENESIS_TOKENS,
  },
};
