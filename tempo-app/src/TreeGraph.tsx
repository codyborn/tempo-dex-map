import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import type { TokenNode } from "./fetchTokens";

interface TreeGraphProps {
  root: TokenNode;
  width: number;
  height: number;
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

function getColor(currency: string): string {
  return CURRENCY_COLORS[currency] || "#94a3b8";
}

function formatTvl(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(0)}`;
  if (n > 0) return `$${n.toFixed(2)}`;
  return "$0";
}

interface HNode {
  name: string;
  symbol: string;
  address: string;
  currency: string;
  totalSupply: number;
  childCount: number;
  children?: HNode[];
}

function toHNode(node: TokenNode): HNode {
  return {
    name: node.name,
    symbol: node.symbol,
    address: node.address,
    currency: node.currency,
    totalSupply: node.totalSupply,
    childCount: node.children.length,
    children: node.children.length > 0 ? node.children.map(toHNode) : undefined,
  };
}

// Convert radial coordinates (angle, radius) to cartesian (x, y)
function radialPoint(angle: number, radius: number): [number, number] {
  return [radius * Math.cos(angle - Math.PI / 2), radius * Math.sin(angle - Math.PI / 2)];
}

export default function TreeGraph({ root, width, height }: TreeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const draw = useCallback(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const data = toHNode(root);
    const hierarchy = d3.hierarchy(data);
    const leafCount = hierarchy.leaves().length;

    // Radial tree layout — spreads children around the center
    const radius = Math.min(width, height) / 2 - 120;
    const treeLayout = d3
      .tree<HNode>()
      .size([2 * Math.PI, Math.max(radius, 150)])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);

    const treeRoot = treeLayout(hierarchy);
    const nodes = treeRoot.descendants();
    const links = treeRoot.links();

    // Root group that gets zoomed/panned
    const g = svg.append("g");

    // Initial transform — center the tree
    const initialTransform = d3.zoomIdentity.translate(width / 2, height / 2);

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    zoomRef.current = zoom;
    svg.call(zoom).call(zoom.transform, initialTransform);

    // ── Edges ──────────────────────────────────────────────────

    // Radial link generator
    g.append("g")
      .attr("fill", "none")
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("d", (d) => {
        const sourceAngle = d.source.x;
        const sourceRadius = d.source.y;
        const targetAngle = d.target.x;
        const targetRadius = d.target.y;
        const [sx, sy] = radialPoint(sourceAngle, sourceRadius);
        const [tx, ty] = radialPoint(targetAngle, targetRadius);
        // Curved path via a control point at source radius, target angle
        const [cx, cy] = radialPoint(targetAngle, sourceRadius);
        return `M${sx},${sy}Q${cx},${cy} ${tx},${ty}`;
      })
      .attr("stroke", (d) => getColor(d.target.data.currency))
      .attr("stroke-opacity", 0.35)
      .attr("stroke-width", (d) => {
        const tvl = d.target.data.totalSupply;
        if (tvl >= 1_000_000) return 2.5;
        if (tvl >= 1_000) return 1.8;
        return 1;
      });

    // Edge TVL labels — placed at midpoint of each link
    const edgeLabels = g.append("g")
      .selectAll("text")
      .data(links)
      .join("text");

    edgeLabels.each(function (d) {
      const sourceAngle = d.source.x;
      const sourceRadius = d.source.y;
      const targetAngle = d.target.x;
      const targetRadius = d.target.y;
      const midAngle = (sourceAngle + targetAngle) / 2;
      const midRadius = (sourceRadius + targetRadius) / 2;
      const [mx, my] = radialPoint(midAngle, midRadius);

      const tvl = d.target.data.totalSupply;
      if (tvl <= 0) return;

      // Only show labels when there's enough space (skip if too many nodes packed together)
      const showLabel = leafCount < 60 || tvl >= 1_000;

      if (showLabel) {
        d3.select(this)
          .attr("x", mx)
          .attr("y", my)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .attr("fill", getColor(d.target.data.currency))
          .attr("fill-opacity", 0.6)
          .attr("font-size", "8px")
          .attr("font-weight", "500")
          .text(formatTvl(tvl));
      }
    });

    // ── Nodes ──────────────────────────────────────────────────

    const node = g
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("transform", (d) => {
        if (d.depth === 0) return "translate(0,0)";
        const [x, y] = radialPoint(d.x, d.y);
        return `translate(${x},${y})`;
      });

    // Node circles
    node
      .append("circle")
      .attr("r", (d) => {
        if (d.depth === 0) return 16;
        const tvl = d.data.totalSupply;
        if (tvl >= 1_000_000) return 8;
        if (tvl >= 1_000) return 6;
        return 4;
      })
      .attr("fill", (d) => getColor(d.data.currency))
      .attr("fill-opacity", 0.9)
      .attr("stroke", (d) => getColor(d.data.currency))
      .attr("stroke-width", (d) => (d.depth === 0 ? 3 : 1.5))
      .attr("stroke-opacity", 1)
      .style("cursor", "pointer");

    // Node symbol labels — radially oriented, outside the circle
    node
      .append("text")
      .attr("dy", "0.35em")
      .attr("text-anchor", (d) => {
        if (d.depth === 0) return "middle";
        // Left side of circle: right-align text; right side: left-align
        const angle = d.x;
        return angle > Math.PI ? "end" : "start";
      })
      .attr("transform", (d) => {
        if (d.depth === 0) return "translate(0,-24)";
        const angle = d.x;
        const r = d.data.totalSupply >= 1_000_000 ? 8 : d.data.totalSupply >= 1_000 ? 6 : 4;
        const offset = r + 5;
        // Rotate text to follow the radial direction
        const rotateDeg = ((angle * 180) / Math.PI - 90);
        const flip = angle > Math.PI;
        return `rotate(${flip ? rotateDeg + 180 : rotateDeg})translate(${flip ? -offset : offset},0)`;
      })
      .attr("fill", "#e2e8f0")
      .attr("font-size", (d) => (d.depth === 0 ? "14px" : "10px"))
      .attr("font-weight", (d) => (d.depth === 0 ? "700" : "500"))
      .text((d) => d.data.symbol);

    // Root TVL label
    node
      .filter((d) => d.depth === 0 && d.data.totalSupply > 0)
      .append("text")
      .attr("dy", "0.35em")
      .attr("y", 24)
      .attr("text-anchor", "middle")
      .attr("fill", "#64748b")
      .attr("font-size", "10px")
      .text((d) => formatTvl(d.data.totalSupply));

    // ── Tooltip on hover ───────────────────────────────────────

    let tooltipDiv = d3.select<HTMLDivElement, unknown>("#tree-tooltip");
    if (tooltipDiv.empty()) {
      tooltipDiv = d3
        .select("body")
        .append("div")
        .attr("id", "tree-tooltip")
        .style("position", "fixed")
        .style("pointer-events", "none")
        .style("background", "#1e1e2e")
        .style("border", "1px solid #334155")
        .style("border-radius", "8px")
        .style("padding", "10px 14px")
        .style("font-size", "13px")
        .style("color", "#e2e8f0")
        .style("z-index", "1000")
        .style("min-width", "220px")
        .style("box-shadow", "0 4px 12px rgba(0,0,0,0.5)")
        .style("display", "none");
    }

    node
      .on("mouseenter", (_event, d) => {
        const nd = d.data;
        tooltipDiv
          .style("display", "block")
          .html(
            `<div style="font-weight:700;font-size:15px;margin-bottom:2px">${nd.name}</div>` +
              `<div style="color:#94a3b8;font-size:12px;margin-bottom:6px">${nd.symbol}</div>` +
              `<div style="display:flex;justify-content:space-between;margin-bottom:3px">` +
              `<span style="color:#64748b">Currency</span>` +
              `<span style="color:${getColor(nd.currency)};font-weight:600">${nd.currency}</span></div>` +
              `<div style="display:flex;justify-content:space-between;margin-bottom:3px">` +
              `<span style="color:#64748b">TVL (PathUSD)</span>` +
              `<span style="font-weight:600">${formatTvl(nd.totalSupply)}</span></div>` +
              (nd.childCount > 0
                ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px">` +
                  `<span style="color:#64748b">Children</span><span>${nd.childCount}</span></div>`
                : "") +
              `<div style="color:#475569;font-size:10px;margin-top:6px;font-family:monospace;word-break:break-all">${nd.address}</div>`
          );
      })
      .on("mousemove", (event) => {
        tooltipDiv
          .style("left", event.clientX + 14 + "px")
          .style("top", event.clientY - 10 + "px");
      })
      .on("mouseleave", () => {
        tooltipDiv.style("display", "none");
      });
  }, [root, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Zoom controls
  function handleZoom(direction: "in" | "out" | "fit") {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    const zoom = zoomRef.current;

    if (direction === "fit") {
      const g = svg.select("g");
      const bounds = (g.node() as SVGGElement)?.getBBox();
      if (!bounds) return;
      const padding = 60;
      const scale = Math.min(
        (width - padding * 2) / bounds.width,
        (height - padding * 2) / bounds.height,
        2
      );
      const tx = width / 2 - (bounds.x + bounds.width / 2) * scale;
      const ty = height / 2 - (bounds.y + bounds.height / 2) * scale;
      svg
        .transition()
        .duration(500)
        .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    } else {
      const factor = direction === "in" ? 1.4 : 1 / 1.4;
      svg.transition().duration(300).call(zoom.scaleBy, factor);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Zoom controls */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          gap: "4px",
          zIndex: 5,
        }}
      >
        {(["in", "out", "fit"] as const).map((dir) => (
          <button
            key={dir}
            onClick={() => handleZoom(dir)}
            style={{
              width: 32,
              height: 32,
              borderRadius: "6px",
              border: "1px solid #334155",
              background: "#1e293b",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {dir === "in" ? "+" : dir === "out" ? "\u2212" : "\u2750"}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ background: "#0f172a", borderRadius: "8px" }}
      />
    </div>
  );
}
