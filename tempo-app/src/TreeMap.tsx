import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import type { TokenNode } from "./fetchTokens";

interface TreeMapProps {
  root: TokenNode;
  width: number;
  height: number;
}

interface D3Node {
  name: string;
  symbol: string;
  address: string;
  currency: string;
  totalSupply: number;
  childCount: number;
  children?: D3Node[];
}

function tokenToD3(node: TokenNode): D3Node {
  return {
    name: node.name,
    symbol: node.symbol,
    address: node.address,
    currency: node.currency,
    totalSupply: node.totalSupply,
    childCount: node.children.length,
    children: node.children.length > 0 ? node.children.map(tokenToD3) : undefined,
  };
}

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

function getCurrencyColor(currency: string): string {
  return CURRENCY_COLORS[currency] || "#94a3b8";
}

function formatSupply(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(0);
  if (n > 0) return n.toFixed(2);
  return "0";
}

function renderToSvg(
  svgEl: SVGSVGElement,
  data: D3Node,
  width: number,
  height: number,
  callbacks: {
    onZoom: (node: D3Node) => void;
    onTooltipEnter: (e: MouseEvent, node: D3Node) => void;
    onTooltipMove: (e: MouseEvent, node: D3Node) => void;
    onTooltipLeave: () => void;
  }
) {
  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();

  const hierarchy = d3
    .hierarchy(data)
    .sum((d) => {
      if (d.children) return 0;
      // Use totalSupply for sizing, with a small floor so zero-supply tokens are still visible
      return Math.max(d.totalSupply, 0.01);
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const treemap = d3
    .treemap<D3Node>()
    .size([width, height])
    .paddingOuter(3)
    .paddingTop(22)
    .paddingInner(1)
    .round(true);

  const layoutRoot = treemap(hierarchy);
  const nodes = layoutRoot.descendants();
  const g = svg.append("g");

  const cell = g
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

  cell
    .append("rect")
    .attr("width", (d) => Math.max(0, d.x1 - d.x0))
    .attr("height", (d) => Math.max(0, d.y1 - d.y0))
    .attr("rx", (d) => (d.depth === 0 ? 0 : 3))
    .attr("fill", (d) => {
      if (d.children) return d.depth === 0 ? "#1a1a2e" : `${getCurrencyColor(d.data.currency)}18`;
      return getCurrencyColor(d.data.currency);
    })
    .attr("fill-opacity", (d) => (d.children ? 1 : 0.82))
    .attr("stroke", (d) => (d.children && d.depth > 0 ? getCurrencyColor(d.data.currency) : "none"))
    .attr("stroke-width", (d) => (d.children && d.depth > 0 ? 1 : 0))
    .attr("stroke-opacity", 0.25)
    .style("cursor", (d) => (d.children ? "pointer" : "default"))
    .on("click", (_event, d) => {
      if (d.children && d.depth > 0) callbacks.onZoom(d.data);
    })
    .on("mouseenter", function (event, d) {
      if (!d.children) {
        d3.select(this).attr("fill-opacity", 1).attr("stroke", "#fff").attr("stroke-width", 2);
        callbacks.onTooltipEnter(event as unknown as MouseEvent, d.data);
      }
    })
    .on("mousemove", (event, d) => {
      if (!d.children) callbacks.onTooltipMove(event as unknown as MouseEvent, d.data);
    })
    .on("mouseleave", function (_event, d) {
      if (!d.children) {
        d3.select(this).attr("fill-opacity", 0.82).attr("stroke", "none").attr("stroke-width", 0);
        callbacks.onTooltipLeave();
      }
    });

  // Group labels
  cell
    .filter((d) => !!d.children && d.depth > 0)
    .append("text")
    .attr("x", 5)
    .attr("y", 15)
    .attr("fill", (d) => getCurrencyColor(d.data.currency))
    .attr("font-size", "10px")
    .attr("font-weight", "600")
    .text((d) => {
      const w = d.x1 - d.x0;
      if (w < 35) return "";
      return w < 100
        ? d.data.symbol
        : `${d.data.symbol} (${d.data.childCount}) · ${formatSupply(d.value ?? 0)}`;
    });

  // Leaf labels
  cell
    .filter((d) => !d.children)
    .append("text")
    .attr("x", 3)
    .attr("y", 12)
    .attr("fill", "#000")
    .attr("fill-opacity", 0.8)
    .attr("font-size", (d) => {
      const w = d.x1 - d.x0;
      if (w > 60) return "10px";
      if (w > 35) return "8px";
      return "0px";
    })
    .attr("font-weight", "600")
    .text((d) => {
      const w = d.x1 - d.x0;
      if (w < 25) return "";
      return d.data.symbol;
    });

  // Supply label on larger leaves
  cell
    .filter((d) => !d.children)
    .append("text")
    .attr("x", 3)
    .attr("y", 23)
    .attr("fill", "#000")
    .attr("fill-opacity", 0.55)
    .attr("font-size", (d) => {
      const w = d.x1 - d.x0;
      const h = d.y1 - d.y0;
      if (w > 55 && h > 28) return "9px";
      return "0px";
    })
    .text((d) => formatSupply(d.data.totalSupply));
}

export default function TreeMap({ root, width, height }: TreeMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: D3Node } | null>(null);
  const [zoomPath, setZoomPath] = useState<D3Node[]>([]);

  const draw = useCallback(
    (data: D3Node) => {
      if (!svgRef.current) return;
      renderToSvg(svgRef.current, data, width, height, {
        onZoom: (node) => setZoomPath((prev) => [...prev, node]),
        onTooltipEnter: (e, node) => {
          const rect = svgRef.current!.getBoundingClientRect();
          setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, node });
        },
        onTooltipMove: (e, node) => {
          const rect = svgRef.current!.getBoundingClientRect();
          setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, node });
        },
        onTooltipLeave: () => setTooltip(null),
      });
    },
    [width, height]
  );

  // Navigate to the zoomed subtree within the latest root
  const resolveZoom = useCallback(
    (fullData: D3Node, path: D3Node[]): D3Node => {
      let current = fullData;
      for (const pathNode of path) {
        const found = current.children?.find((c) => c.address === pathNode.address);
        if (!found) return fullData; // path broken, reset
        current = found;
      }
      return current;
    },
    []
  );

  useEffect(() => {
    const fullData = tokenToD3(root);
    const target = resolveZoom(fullData, zoomPath);
    if (target === fullData && zoomPath.length > 0) {
      setZoomPath([]); // path broke, reset
    }
    draw(target);
  }, [root, width, height, draw, zoomPath, resolveZoom]);

  function handleBreadcrumbClick(index: number) {
    if (index === -1) setZoomPath([]);
    else setZoomPath((prev) => prev.slice(0, index + 1));
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", gap: "2px", alignItems: "center", marginBottom: "6px", fontSize: "13px" }}>
        <button
          onClick={() => handleBreadcrumbClick(-1)}
          style={{
            background: "none",
            border: "none",
            color: zoomPath.length === 0 ? "#fff" : "#94a3b8",
            cursor: "pointer",
            padding: "2px 4px",
            fontSize: "13px",
            fontWeight: zoomPath.length === 0 ? 600 : 400,
          }}
        >
          {root.symbol || "Root"}
        </button>
        {zoomPath.map((node, i) => (
          <span key={node.address}>
            <span style={{ color: "#475569", margin: "0 2px" }}>/</span>
            <button
              onClick={() => handleBreadcrumbClick(i)}
              style={{
                background: "none",
                border: "none",
                color: i === zoomPath.length - 1 ? "#fff" : "#94a3b8",
                cursor: "pointer",
                padding: "2px 4px",
                fontSize: "13px",
                fontWeight: i === zoomPath.length - 1 ? 600 : 400,
              }}
            >
              {node.symbol}
            </button>
          </span>
        ))}
      </div>

      <svg ref={svgRef} width={width} height={height} />

      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: Math.min(tooltip.x + 12, width - 260),
            top: tooltip.y - 10,
            background: "#1e1e2e",
            border: "1px solid #334155",
            borderRadius: "8px",
            padding: "10px 14px",
            fontSize: "13px",
            color: "#e2e8f0",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: "230px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "2px" }}>{tooltip.node.name}</div>
          <div style={{ color: "#94a3b8", marginBottom: "6px", fontSize: "12px" }}>{tooltip.node.symbol}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
            <span style={{ color: "#64748b" }}>Currency</span>
            <span style={{ color: getCurrencyColor(tooltip.node.currency), fontWeight: 600 }}>
              {tooltip.node.currency}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
            <span style={{ color: "#64748b" }}>TVL (PathUSD)</span>
            <span style={{ fontWeight: 600 }}>{formatSupply(tooltip.node.totalSupply)}</span>
          </div>
          {tooltip.node.childCount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
              <span style={{ color: "#64748b" }}>Children</span>
              <span>{tooltip.node.childCount}</span>
            </div>
          )}
          <div
            style={{
              color: "#475569",
              fontSize: "10px",
              marginTop: "6px",
              fontFamily: "monospace",
              wordBreak: "break-all",
            }}
          >
            {tooltip.node.address}
          </div>
        </div>
      )}
    </div>
  );
}
