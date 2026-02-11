import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import TreeGraph from "./TreeGraph";
import {
  fetchGenesisTokens,
  streamFactoryTokens,
  buildTree,
  type TokenInfo,
  type TokenNode,
} from "./fetchTokens";
import { NETWORKS, type NetworkId } from "./chain";

// ── URL params ────────────────────────────────────────────────────

function parseInitialParams(): { minTvl: number; excluded: string[]; network: NetworkId } {
  const params = new URLSearchParams(window.location.search);
  const tvl = parseFloat(params.get("minTvl") || "0");
  const exc = params.get("exclude");
  const net = params.get("network");
  return {
    minTvl: Number.isFinite(tvl) && tvl > 0 ? tvl : 0,
    excluded: exc ? exc.split(",").filter(Boolean) : [],
    network: net === "testnet" ? "testnet" : "mainnet",
  };
}

// ── Hooks ─────────────────────────────────────────────────────────

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const handler = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return size;
}

// ── TVL Slider ────────────────────────────────────────────────────

// Log-scale slider: position 0–1 maps to 0 → maxTvl on a log scale
const SLIDER_STEPS = 500;

function positionToTvl(pos: number, maxTvl: number): number {
  if (pos <= 0) return 0;
  // Map [0,1] → [0, log10(maxTvl)]
  const logMax = Math.log10(Math.max(maxTvl, 1));
  return Math.pow(10, pos * logMax);
}

function tvlToPosition(tvl: number, maxTvl: number): number {
  if (tvl <= 0) return 0;
  const logMax = Math.log10(Math.max(maxTvl, 1));
  return Math.log10(tvl) / logMax;
}

function formatTvl(n: number): string {
  if (n <= 0) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(0);
  return n.toFixed(2);
}

function TvlSlider({
  value,
  maxTvl,
  onChange,
}: {
  value: number;
  maxTvl: number;
  onChange: (tvl: number) => void;
}) {
  const pos = tvlToPosition(value, maxTvl);
  const sliderVal = Math.round(pos * SLIDER_STEPS);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "6px 12px",
        background: "#1e293b",
        borderRadius: "8px",
        border: "1px solid #334155",
        minWidth: "320px",
      }}
    >
      <label style={{ color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap", fontWeight: 500 }}>
        Min TVL
      </label>
      <input
        type="range"
        min={0}
        max={SLIDER_STEPS}
        value={sliderVal}
        onChange={(e) => {
          const p = parseInt(e.target.value) / SLIDER_STEPS;
          onChange(p <= 0.005 ? 0 : positionToTvl(p, maxTvl));
        }}
        style={{ flex: 1, accentColor: "#3b82f6", cursor: "pointer" }}
      />
      <span
        style={{
          color: "#e2e8f0",
          fontSize: "13px",
          fontWeight: 600,
          minWidth: "64px",
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value <= 0 ? "Off" : `${formatTvl(value)}`}
      </span>
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────────

const CURRENCY_COLORS: Record<string, string> = {
  USD: "#4ade80",
  EUR: "#60a5fa",
  GBP: "#f472b6",
  JPY: "#fb923c",
  BRL: "#a78bfa",
  ARS: "#facc15",
  MXN: "#f87171",
  CAD: "#34d399",
  AUD: "#38bdf8",
  SGD: "#c084fc",
  HKD: "#fb7185",
  KRW: "#2dd4bf",
  INR: "#fbbf24",
  CHF: "#a3e635",
  SEK: "#67e8f9",
};

function Legend({ currencies }: { currencies: Map<string, number> }) {
  const sorted = [...currencies.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center", padding: "4px 0" }}>
      {sorted.map(([cur, count]) => (
        <div key={cur} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "2px",
              background: CURRENCY_COLORS[cur] || "#94a3b8",
            }}
          />
          <span style={{ color: "#94a3b8" }}>
            {cur} ({count.toLocaleString()})
          </span>
        </div>
      ))}
    </div>
  );
}

function countCurrencies(node: TokenNode): Map<string, number> {
  const map = new Map<string, number>();
  function walk(n: TokenNode) {
    map.set(n.currency || "?", (map.get(n.currency || "?") || 0) + 1);
    n.children.forEach(walk);
  }
  walk(node);
  return map;
}

// ── Token Exclude Filter ──────────────────────────────────────────

function TokenFilter({
  excluded,
  onAdd,
  onRemove,
  suggestions,
}: {
  excluded: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  suggestions: string[];
}) {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.length > 0
    ? suggestions
        .filter((s) => s.toLowerCase().includes(query.toLowerCase()) && !excluded.includes(s))
        .slice(0, 8)
    : [];

  function addToken(name: string) {
    onAdd(name);
    setQuery("");
    setShowSuggestions(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          background: "#1e293b",
          borderRadius: "8px",
          border: "1px solid #334155",
          flexWrap: "wrap",
          minWidth: "200px",
        }}
      >
        {excluded.map((name) => (
          <span
            key={name}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              background: "#334155",
              borderRadius: "4px",
              padding: "2px 6px",
              fontSize: "11px",
              color: "#e2e8f0",
              whiteSpace: "nowrap",
            }}
          >
            {name}
            <button
              onClick={() => onRemove(name)}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: "0 1px",
                fontSize: "13px",
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Exclude token..."
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered.length > 0) {
              addToken(filtered[0]);
            }
            if (e.key === "Escape") {
              setShowSuggestions(false);
              inputRef.current?.blur();
            }
          }}
          style={{
            background: "none",
            border: "none",
            outline: "none",
            color: "#e2e8f0",
            fontSize: "12px",
            flex: 1,
            minWidth: "100px",
            padding: "3px 0",
          }}
        />
      </div>
      {showSuggestions && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "6px",
            zIndex: 20,
            maxHeight: "180px",
            overflowY: "auto",
          }}
        >
          {filtered.map((name) => (
            <button
              key={name}
              onMouseDown={(e) => {
                e.preventDefault();
                addToken(name);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                color: "#e2e8f0",
                fontSize: "12px",
                padding: "6px 10px",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#334155")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────

export default function App() {
  const [initialParams] = useState(parseInitialParams);
  const [allTokens, setAllTokens] = useState<TokenInfo[]>([]);
  const [progress, setProgress] = useState("Initializing...");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minTvl, setMinTvl] = useState(initialParams.minTvl);
  const [excluded, setExcluded] = useState<string[]>(initialParams.excluded);
  const [networkId, setNetworkId] = useState<NetworkId>(initialParams.network);
  const [copied, setCopied] = useState(false);
  const { width, height } = useWindowSize();

  // Accumulate tokens in a ref; periodically flush into state
  const pendingRef = useRef<TokenInfo[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (pendingRef.current.length === 0) return;
    const batch = pendingRef.current;
    pendingRef.current = [];
    setAllTokens((prev) => [...prev, ...batch]);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      flush();
    }, 600);
  }, [flush]);

  const network = NETWORKS[networkId];

  const load = useCallback(async () => {
    try {
      setError(null);
      setDone(false);
      setAllTokens([]);
      pendingRef.current = [];

      setProgress("Fetching genesis tokens...");
      const genesis = await fetchGenesisTokens(network);
      setAllTokens(genesis);

      setProgress("Streaming factory tokens...");
      await streamFactoryTokens(
        network,
        (newTokens, progressMsg) => {
          setProgress(progressMsg);
          if (newTokens.length > 0) {
            pendingRef.current.push(...newTokens);
            scheduleFlush();
          }
        },
        () => {
          // Final flush
          if (flushTimer.current) {
            clearTimeout(flushTimer.current);
            flushTimer.current = null;
          }
          flush();
          setDone(true);
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [flush, scheduleFlush, network]);

  useEffect(() => {
    load();
  }, [load]);

  // Compute max TVL across all tokens (for slider range)
  const maxTvl = useMemo(() => {
    let max = 0;
    for (const t of allTokens) {
      if (t.totalSupply > max) max = t.totalSupply;
    }
    return max;
  }, [allTokens]);

  // Unique token symbols for autocomplete suggestions
  const tokenSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const t of allTokens) set.add(t.symbol);
    return [...set].sort();
  }, [allTokens]);

  // Filter out excluded tokens, then build the tree
  const filteredTokens = useMemo(() => {
    if (excluded.length === 0) return allTokens;
    const excludeSet = new Set(excluded.map((s) => s.toLowerCase()));
    return allTokens.filter((t) => !excludeSet.has(t.symbol.toLowerCase()));
  }, [allTokens, excluded]);

  const { root, tokenCount, visibleCount } = useMemo(
    () => buildTree(filteredTokens, minTvl),
    [filteredTokens, minTvl]
  );

  const currencies = useMemo(() => countCurrencies(root), [root]);

  function handleShare() {
    const params = new URLSearchParams();
    if (networkId !== "mainnet") params.set("network", networkId);
    if (minTvl > 0) params.set("minTvl", minTvl.toFixed(2));
    if (excluded.length > 0) params.set("exclude", excluded.join(","));
    const qs = params.toString();
    const url = window.location.origin + window.location.pathname + (qs ? `?${qs}` : "");
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const mapWidth = Math.max(width - 40, 600);
  const mapHeight = Math.max(height - 170, 350);

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: "16px" }}>
        <div style={{ color: "#f87171", fontSize: "18px" }}>Error: {error}</div>
        <button onClick={load} style={{ padding: "8px 16px", borderRadius: "6px", background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  if (allTokens.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: "16px" }}>
        <div className="spinner" />
        <div style={{ color: "#94a3b8", fontSize: "14px" }}>{progress}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 20px" }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "#f1f5f9" }}>
            Tempo DEX Token Tree
          </h1>
          <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px" }}>
            {visibleCount.toLocaleString()} of {tokenCount.toLocaleString()} tokens shown
            {" "}&middot; {network.label}
            {!done && <> &middot; {progress}</>}
            {" "}&middot; Scroll to zoom, drag to pan
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <TokenFilter
            excluded={excluded}
            onAdd={(name) => setExcluded((prev) => prev.includes(name) ? prev : [...prev, name])}
            onRemove={(name) => setExcluded((prev) => prev.filter((n) => n !== name))}
            suggestions={tokenSymbols}
          />
          <TvlSlider value={minTvl} maxTvl={maxTvl} onChange={setMinTvl} />
          {/* Network toggle */}
          <div
            style={{
              display: "flex",
              borderRadius: "8px",
              border: "1px solid #334155",
              overflow: "hidden",
            }}
          >
            {(["mainnet", "testnet"] as const).map((net) => (
              <button
                key={net}
                onClick={() => setNetworkId(net)}
                style={{
                  padding: "6px 12px",
                  border: "none",
                  background: networkId === net ? "#3b82f6" : "#1e293b",
                  color: networkId === net ? "#fff" : "#64748b",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: networkId === net ? 600 : 400,
                  whiteSpace: "nowrap",
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                {NETWORKS[net].label}
              </button>
            ))}
          </div>
          <button
            onClick={handleShare}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid #334155",
              background: copied ? "#22c55e" : "#1e293b",
              color: copied ? "#fff" : "#94a3b8",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 500,
              whiteSpace: "nowrap",
              transition: "background 0.2s, color 0.2s",
            }}
          >
            {copied ? "Copied!" : "Share"}
          </button>
          {!done && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>Streaming</span>
            </div>
          )}
        </div>
      </div>

      <Legend currencies={currencies} />

      <TreeGraph root={root} width={mapWidth} height={mapHeight} />
    </div>
  );
}
