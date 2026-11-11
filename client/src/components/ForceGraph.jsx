import { useMemo } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

const RADIUS = { source: 11, note: 9, tag: 6, concept: 13 };
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// Lays the graph out once (no animation), then draws it as a scalable SVG.
export default function ForceGraph({ nodes, links, selectedId, onSelect, showLinkLabels = false }) {
  const layout = useMemo(() => {
    const ns = nodes.map((n) => ({ ...n }));
    const ls = links.map((l) => ({ ...l }));
    const sim = forceSimulation(ns)
      .force('link', forceLink(ls).id((d) => d.id).distance(showLinkLabels ? 150 : 95).strength(0.6))
      .force('charge', forceManyBody().strength(showLinkLabels ? -520 : -300))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide(showLinkLabels ? 60 : 44))
      .stop();
    for (let i = 0; i < 320; i++) sim.tick();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of ns) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    }
    const pad = 90;
    return {
      nodes: ns,
      links: ls,
      viewBox: `${minX - pad} ${minY - pad} ${Math.max(maxX - minX + pad * 2, 300)} ${Math.max(maxY - minY + pad * 2, 260)}`,
    };
  }, [nodes, links, showLinkLabels]);

  const neighbours = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set([selectedId]);
    for (const l of layout.links) {
      if (l.source.id === selectedId) set.add(l.target.id);
      if (l.target.id === selectedId) set.add(l.source.id);
    }
    return set;
  }, [selectedId, layout]);

  return (
    <svg className="graph" viewBox={layout.viewBox} role="group" aria-label="Map of this topic">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="graph-arrow" />
        </marker>
      </defs>
      {layout.links.map((l, i) => {
        const active = !neighbours || (neighbours.has(l.source.id) && neighbours.has(l.target.id) && (l.source.id === selectedId || l.target.id === selectedId));
        const dx = l.target.x - l.source.x;
        const dy = l.target.y - l.source.y;
        const dist = Math.hypot(dx, dy) || 1;
        const r = RADIUS[l.target.type] || 10;
        const x2 = l.target.x - (dx / dist) * (r + 3);
        const y2 = l.target.y - (dy / dist) * (r + 3);
        return (
          <g key={i} className={`graph-link ${l.kind || ''} ${active ? '' : 'dim'}`}>
            <line x1={l.source.x} y1={l.source.y} x2={x2} y2={y2} markerEnd={showLinkLabels ? 'url(#arrow)' : undefined} />
            {showLinkLabels && l.label && (!selectedId || active) && (
              <text x={(l.source.x + l.target.x) / 2} y={(l.source.y + l.target.y) / 2 - 4} className="graph-link-label">
                {truncate(l.label, 24)}
              </text>
            )}
          </g>
        );
      })}
      {layout.nodes.map((n) => {
        const r = RADIUS[n.type] || 10;
        const dim = neighbours && !neighbours.has(n.id);
        return (
          <g
            key={n.id}
            transform={`translate(${n.x},${n.y})`}
            className={`graph-node t-${n.type} ${n.id === selectedId ? 'selected' : ''} ${dim ? 'dim' : ''} ${n.outside ? 'outside' : ''}`}
            onClick={() => onSelect(n.id === selectedId ? null : n.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(n.id))}
            tabIndex={0}
            role="button"
            aria-label={n.label}
          >
            <circle r={r} />
            <text y={r + 15}>{truncate(n.label, n.type === 'concept' ? 30 : 26)}</text>
          </g>
        );
      })}
    </svg>
  );
}
