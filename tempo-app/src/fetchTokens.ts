import {
  createPublicClient,
  http,
  type Address,
  getAddress,
  encodeFunctionData,
  decodeFunctionResult,
  zeroAddress,
  formatUnits,
} from "viem";
import { tempo, RPC_URL, RPC_AUTH, PRECOMPILES, GENESIS_TOKENS } from "./chain";
import { tip20Abi, tip20FactoryAbi, multicall3Abi } from "./abi";

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  currency: string;
  quoteToken: string;
  totalSupply: number; // in whole units (post-decimal), denominated as PathUSD
}

export interface TokenNode {
  address: string;
  name: string;
  symbol: string;
  currency: string;
  quoteToken: string;
  totalSupply: number;
  children: TokenNode[];
}

const client = createPublicClient({
  chain: tempo,
  transport: http(RPC_URL, {
    fetchOptions: {
      headers: { Authorization: RPC_AUTH },
    },
  }),
});

// ── Multicall totalSupply helper ──────────────────────────────────

const totalSupplyCallData = encodeFunctionData({
  abi: tip20Abi,
  functionName: "totalSupply",
});

async function batchFetchSupplies(addresses: Address[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (addresses.length === 0) return result;

  const BATCH = 500;
  for (let i = 0; i < addresses.length; i += BATCH) {
    const batch = addresses.slice(i, i + BATCH);
    try {
      const response = await client.readContract({
        address: PRECOMPILES.MULTICALL3,
        abi: multicall3Abi,
        functionName: "aggregate3",
        args: [batch.map((addr) => ({ target: addr, allowFailure: true, callData: totalSupplyCallData }))],
      });
      const returnData = response as { success: boolean; returnData: `0x${string}` }[];
      for (let j = 0; j < batch.length; j++) {
        if (returnData[j].success && returnData[j].returnData.length > 2) {
          try {
            const raw = decodeFunctionResult({
              abi: tip20Abi,
              functionName: "totalSupply",
              data: returnData[j].returnData,
            }) as bigint;
            // Convert to human-readable (6 decimals) as a float
            result.set(batch[j].toLowerCase(), parseFloat(formatUnits(raw, 6)));
          } catch {
            result.set(batch[j].toLowerCase(), 0);
          }
        } else {
          result.set(batch[j].toLowerCase(), 0);
        }
      }
    } catch (err) {
      console.error(`Multicall batch error at ${i}:`, err);
      for (const addr of batch) result.set(addr.toLowerCase(), 0);
    }
  }
  return result;
}

// ── Tree building ─────────────────────────────────────────────────

function countDescendants(node: TokenNode): number {
  let count = 1;
  for (const child of node.children) count += countDescendants(child);
  return count;
}

/** Build a tree from flat token list, optionally filtering by minTVL. */
export function buildTree(tokens: TokenInfo[], minTvl: number = 0): { root: TokenNode; tokenCount: number; visibleCount: number } {
  // Index all tokens
  const byAddr = new Map<string, TokenInfo>();
  for (const t of tokens) byAddr.set(t.address.toLowerCase(), t);

  // Determine which tokens survive the TVL filter.
  // A token is visible if:
  //   1. Its totalSupply >= minTvl, OR
  //   2. It is the quoteToken (ancestor) of any visible token
  const visible = new Set<string>();

  // Always include the root token (quoteToken = zeroAddress)
  for (const t of tokens) {
    if (t.quoteToken.toLowerCase() === zeroAddress.toLowerCase()) {
      visible.add(t.address.toLowerCase());
    }
  }

  if (minTvl <= 0) {
    for (const t of tokens) visible.add(t.address.toLowerCase());
  } else {
    // Pass 1: mark tokens meeting the threshold
    const meetsThreshold = new Set<string>();
    for (const t of tokens) {
      if (t.totalSupply >= minTvl) meetsThreshold.add(t.address.toLowerCase());
    }
    // Pass 2: walk ancestors of each threshold-meeting token to keep the tree connected
    for (const addr of meetsThreshold) {
      let cur = addr;
      while (cur && !visible.has(cur)) {
        visible.add(cur);
        const tok = byAddr.get(cur);
        if (!tok) break;
        cur = tok.quoteToken.toLowerCase();
        if (cur === zeroAddress.toLowerCase()) break;
      }
    }
  }

  // Build tree from visible tokens
  const nodeMap = new Map<string, TokenNode>();
  for (const t of tokens) {
    if (!visible.has(t.address.toLowerCase())) continue;
    nodeMap.set(t.address.toLowerCase(), {
      address: t.address,
      name: t.name,
      symbol: t.symbol,
      currency: t.currency,
      quoteToken: t.quoteToken,
      totalSupply: t.totalSupply,
      children: [],
    });
  }

  let rootNode: TokenNode | null = null;
  for (const [, node] of nodeMap) {
    const parentKey = node.quoteToken.toLowerCase();
    if (parentKey === zeroAddress.toLowerCase()) {
      rootNode = node;
    } else {
      const parent = nodeMap.get(parentKey);
      if (parent) parent.children.push(node);
    }
  }

  if (!rootNode) {
    rootNode = {
      address: zeroAddress,
      name: "Root",
      symbol: "ROOT",
      currency: "USD",
      quoteToken: zeroAddress,
      totalSupply: 0,
      children: [...nodeMap.values()],
    };
  }

  // Sort children: largest subtrees first
  function sortChildren(node: TokenNode) {
    node.children.sort((a, b) => {
      // Sort by subtree TVL, then by descendant count
      const tvlDiff = subtreeTvl(b) - subtreeTvl(a);
      if (Math.abs(tvlDiff) > 0.01) return tvlDiff;
      return countDescendants(b) - countDescendants(a);
    });
    node.children.forEach(sortChildren);
  }
  sortChildren(rootNode);

  return { root: rootNode, tokenCount: byAddr.size, visibleCount: nodeMap.size };
}

function subtreeTvl(node: TokenNode): number {
  let sum = node.totalSupply;
  for (const c of node.children) sum += subtreeTvl(c);
  return sum;
}

// ── Data fetching ─────────────────────────────────────────────────

/** Fetch genesis (pre-deployed) tokens including supply */
export async function fetchGenesisTokens(): Promise<TokenInfo[]> {
  const results: TokenInfo[] = [];
  for (const addr of GENESIS_TOKENS) {
    const [name, symbol, currency, quoteToken, totalSupply] = await Promise.all([
      client.readContract({ address: addr, abi: tip20Abi, functionName: "name" }),
      client.readContract({ address: addr, abi: tip20Abi, functionName: "symbol" }),
      client.readContract({ address: addr, abi: tip20Abi, functionName: "currency" }),
      client.readContract({ address: addr, abi: tip20Abi, functionName: "quoteToken" }),
      client.readContract({ address: addr, abi: tip20Abi, functionName: "totalSupply" }),
    ]);
    results.push({
      address: getAddress(addr),
      name: name as string,
      symbol: symbol as string,
      currency: currency as string,
      quoteToken: getAddress(quoteToken as Address),
      totalSupply: parseFloat(formatUnits(totalSupply as bigint, 6)),
    });
  }
  return results;
}

/**
 * Stream factory tokens with totalSupply fetched via multicall per batch.
 */
export async function streamFactoryTokens(
  onBatch: (newTokens: TokenInfo[], progress: string) => void,
  onDone: () => void,
): Promise<void> {
  const blockNumber = await client.getBlockNumber();
  const latest = Number(blockNumber);

  const CHUNK = 100_000;
  const ranges: [number, number][] = [];
  for (let start = 0; start <= latest; start += CHUNK) {
    ranges.push([start, Math.min(start + CHUNK - 1, latest)]);
  }

  let totalFetched = 0;

  async function fetchRange(from: number, to: number): Promise<{ address: Address; name: string; symbol: string; currency: string; quoteToken: Address }[]> {
    try {
      const logs = await client.getLogs({
        address: PRECOMPILES.TIP20_FACTORY,
        event: tip20FactoryAbi[1],
        fromBlock: BigInt(from),
        toBlock: BigInt(to),
      });
      return logs.map((log) => {
        const args = log.args as { token: Address; name: string; symbol: string; currency: string; quoteToken: Address };
        return {
          address: getAddress(args.token),
          name: args.name,
          symbol: args.symbol,
          currency: args.currency,
          quoteToken: getAddress(args.quoteToken),
        };
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("max block range") || errMsg.includes("max results")) {
        const mid = Math.floor((from + to) / 2);
        const a = await fetchRange(from, mid);
        const b = await fetchRange(mid + 1, to);
        return [...a, ...b];
      }
      console.error(`Error fetching ${from}-${to}:`, errMsg);
      return [];
    }
  }

  const CONCURRENCY = 4;
  let rangeIdx = 0;

  async function worker(): Promise<void> {
    while (rangeIdx < ranges.length) {
      const idx = rangeIdx++;
      const [from, to] = ranges[idx];

      // 1. Fetch events
      const raw = await fetchRange(from, to);
      if (raw.length === 0) {
        totalFetched += 0;
        onBatch([], `Blocks ${from.toLocaleString()}-${to.toLocaleString()} · ${totalFetched.toLocaleString()} tokens · ${Math.round(((idx + 1) / ranges.length) * 100)}%`);
        continue;
      }

      // 2. Batch-fetch totalSupply via multicall
      const addresses = raw.map((t) => t.address);
      const supplies = await batchFetchSupplies(addresses);

      // 3. Merge into TokenInfo
      const tokens: TokenInfo[] = raw.map((t) => ({
        ...t,
        address: t.address,
        quoteToken: t.quoteToken,
        totalSupply: supplies.get(t.address.toLowerCase()) ?? 0,
      }));

      totalFetched += tokens.length;
      onBatch(tokens, `Blocks ${from.toLocaleString()}-${to.toLocaleString()} · ${totalFetched.toLocaleString()} tokens · ${Math.round(((idx + 1) / ranges.length) * 100)}%`);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
  onDone();
}
