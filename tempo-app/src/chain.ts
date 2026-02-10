import { defineChain } from "viem";

export const RPC_URL = "https://rpc.tempo.xyz";
export const RPC_AUTH = "Basic " + btoa("angry-meitner:cool-hypatia");

export const tempo = defineChain({
  id: 4217,
  name: "Tempo",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
  },
});

export const PRECOMPILES = {
  TIP20_FACTORY: "0x20Fc000000000000000000000000000000000000" as const,
  STABLECOIN_DEX: "0xDEc0000000000000000000000000000000000000" as const,
  MULTICALL3: "0xcA11bde05977b3631167028862bE2a173976CA11" as const,
};

export const GENESIS_TOKENS = [
  "0x20C0000000000000000000000000000000000000", // pathUSD
] as const;
