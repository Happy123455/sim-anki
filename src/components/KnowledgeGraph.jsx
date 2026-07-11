import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Search, X, ZoomIn, ZoomOut, Maximize2, ChevronDown, ChevronRight, Settings } from 'lucide-react';

// ─── Default simulation parameters ───
const DEFAULT_FORCES = {
  centerForce: 0.012,
  repelForce: 800,
  linkForce: 0.004,
  linkDistance: 140
};

const NODE_STYLES = {
  deck:    { radius: 16, glowColor: '#8b5cf6', baseColor: '#7c3aed' },
  card:    { radius: 9,  glowColor: '#3b82f6', baseColor: '#2563eb' },
  concept: { radius: 11, glowColor: '#06b6d4', baseColor: '#0891b2' }
};

const EDGE_STYLES = {
  contains:     { dash: [5, 4], color: 'rgba(139, 92, 246, 0.25)' },
  related:      { dash: [],    color: 'rgba(59, 130, 246, 0.35)' },
  prerequisite: { dash: [],    color: 'rgba(245, 158, 11, 0.4)', arrow: true },
  tagged:       { dash: [3, 3], color: 'rgba(6, 182, 212, 0.3)' }
};

function getDifficultyHex(card) {
  if (!card || !card.state || !card.state.repetitions) return '#3b82f6';
  const d = card.state.difficulty || 5;
  const ratio = (10 - d) / 10;
  const r = Math.round(239 + (34 - 239) * ratio);
  const g = Math.round(68 + (197 - 68) * ratio);
  const b = Math.round(68 + (94 - 68) * ratio);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function hexAlpha(hex, a255) {
  if (hex.startsWith('#') && hex.length === 7) return hex + Math.round(a255).toString(16).padStart(2,'0');
  return hex;
}

// ─── Collapsible section widget ───
function Section({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%',
          background: 'none', border: 'none', color: '#e2e8f0', padding: '0.6rem 0.75rem',
          cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, textAlign: 'left'
        }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span>{icon}</span>
        <span>{title}</span>
      </button>
      {open && <div style={{ padding: '0 0.75rem 0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>{children}</div>}
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#a0aec0', cursor: 'pointer' }}>
      <span>{label}</span>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: '32px', height: '18px', borderRadius: '9px', position: 'relative',
          background: value ? '#8b5cf6' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s', cursor: 'pointer'
        }}
      >
        <div style={{
          width: '14px', height: '14px', borderRadius: '50%', background: '#fff',
          position: 'absolute', top: '2px', left: value ? '16px' : '2px', transition: 'left 0.2s'
        }} />
      </div>
    </label>
  );
}

function Slider({ label, value, onChange, min, max, step = 1, displayValue }) {
  return (
    <div style={{ fontSize: '0.75rem', color: '#a0aec0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
        <span>{label}</span>
        <span style={{ color: '#c084fc', fontWeight: 600 }}>{displayValue !== undefined ? displayValue : value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#8b5cf6', height: '4px' }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════
export default function KnowledgeGraph({ graphData, cards = [], decks = [], onClose, onSelectCard, onSelectDeck }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animFrameRef = useRef(null);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const drawRef = useRef(null);
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, nodeId: null, lastCamX: 0, lastCamY: 0 });
  const touchRef = useRef({ lastDist: 0 });

  // ─── UI state ───
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

  // ─── Filter state ───
  const [showTags, setShowTags] = useState(true);
  const [showOrphans, setShowOrphans] = useState(true);
  const [showCards, setShowCards] = useState(true);
  const [showDecks, setShowDecks] = useState(true);

  // ─── Display state ───
  const [showArrows, setShowArrows] = useState(true);
  const [textFadeZoom, setTextFadeZoom] = useState(0.4);
  const [nodeSizeMultiplier, setNodeSizeMultiplier] = useState(1.0);
  const [linkThickness, setLinkThickness] = useState(1.0);

  // ─── Force engine state ───
  const [forces, setForces] = useState({ ...DEFAULT_FORCES });

  // ─── Local graph state ───
  const [localMode, setLocalMode] = useState(false);
  const [localDepth, setLocalDepth] = useState(2);
  const [showIncoming, setShowIncoming] = useState(true);
  const [showOutgoing, setShowOutgoing] = useState(true);
  const [showNeighborLinks, setShowNeighborLinks] = useState(true);

  // ─── Color groups state ───
  const [colorGroups, setColorGroups] = useState([
    { id: 1, keyword: '', color: '#ef4444', active: true },
  ]);

  // ═══ Canvas sizing ═══
  useEffect(() => {
    const sizeCanvas = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        setCanvasReady(true);
        if (drawRef.current) drawRef.current();
      }
    };
    const timer = setTimeout(sizeCanvas, 50);
    window.addEventListener('resize', sizeCanvas);
    return () => { clearTimeout(timer); window.removeEventListener('resize', sizeCanvas); };
  }, []);

  // Resize canvas when panel toggles
  useEffect(() => {
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        if (drawRef.current) drawRef.current();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [showPanel]);

  // ═══ Initialize nodes ═══
  useEffect(() => {
    if (!canvasReady || !graphData || !graphData.nodes) return;
    const cardMap = new Map(cards.map(c => [c.id, c]));
    const nodeCount = graphData.nodes.length;
    const spread = Math.max(200, nodeCount * 12);

    nodesRef.current = graphData.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / nodeCount;
      const r = spread * (0.3 + Math.random() * 0.7);
      const card = cardMap.get(n.id);
      return {
        ...n,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        vx: 0, vy: 0,
        radius: NODE_STYLES[n.type]?.radius || 8,
        color: n.type === 'card' ? getDifficultyHex(card) : (NODE_STYLES[n.type]?.baseColor || '#888888'),
        glowColor: n.type === 'card' ? getDifficultyHex(card) : (NODE_STYLES[n.type]?.glowColor || '#888888'),
        pinned: false,
        card
      };
    });
    edgesRef.current = (graphData.edges || []).map(e => ({ ...e }));
    setIsSimulating(true);
  }, [canvasReady, graphData, cards]);

  // ═══ Compute visible set (filters + local graph) ═══
  const getVisibleSet = useCallback(() => {
    const allNodes = nodesRef.current;
    const allEdges = edgesRef.current;
    if (!allNodes.length) return { nodes: [], edges: [] };

    // Build adjacency
    const adj = new Map();
    const inEdges = new Map();
    const outEdges = new Map();
    allNodes.forEach(n => { adj.set(n.id, new Set()); inEdges.set(n.id, []); outEdges.set(n.id, []); });
    allEdges.forEach(e => {
      if (adj.has(e.source)) adj.get(e.source).add(e.target);
      if (adj.has(e.target)) adj.get(e.target).add(e.source);
      if (outEdges.has(e.source)) outEdges.get(e.source).push(e);
      if (inEdges.has(e.target)) inEdges.get(e.target).push(e);
    });

    let visibleNodeIds = new Set(allNodes.map(n => n.id));

    // Type filters
    if (!showTags) allNodes.forEach(n => { if (n.type === 'concept') visibleNodeIds.delete(n.id); });
    if (!showCards) allNodes.forEach(n => { if (n.type === 'card') visibleNodeIds.delete(n.id); });
    if (!showDecks) allNodes.forEach(n => { if (n.type === 'deck') visibleNodeIds.delete(n.id); });

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      allNodes.forEach(n => {
        if (!n.label.toLowerCase().includes(q)) visibleNodeIds.delete(n.id);
      });
    }

    // Orphan filter
    if (!showOrphans) {
      allNodes.forEach(n => {
        const neighbors = adj.get(n.id);
        if (!neighbors || neighbors.size === 0) visibleNodeIds.delete(n.id);
      });
    }

    // Local graph mode
    if (localMode && selectedNode) {
      const localSet = new Set();
      let frontier = new Set([selectedNode.id]);
      localSet.add(selectedNode.id);

      for (let d = 0; d < localDepth; d++) {
        const next = new Set();
        frontier.forEach(nid => {
          if (showOutgoing) {
            (outEdges.get(nid) || []).forEach(e => {
              if (!localSet.has(e.target)) { localSet.add(e.target); next.add(e.target); }
            });
          }
          if (showIncoming) {
            (inEdges.get(nid) || []).forEach(e => {
              if (!localSet.has(e.source)) { localSet.add(e.source); next.add(e.source); }
            });
          }
        });
        frontier = next;
      }
      visibleNodeIds = new Set([...visibleNodeIds].filter(id => localSet.has(id)));
    }

    const nodes = allNodes.filter(n => visibleNodeIds.has(n.id));

    let edges = allEdges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

    // Neighbor links filter in local mode
    if (localMode && selectedNode && !showNeighborLinks) {
      edges = edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id);
    }

    return { nodes, edges };
  }, [searchQuery, showTags, showOrphans, showCards, showDecks, localMode, selectedNode, localDepth, showIncoming, showOutgoing, showNeighborLinks]);

  // ═══ Color group matching ═══
  const getGroupColor = useCallback((node) => {
    for (const group of colorGroups) {
      if (!group.active || !group.keyword.trim()) continue;
      const kw = group.keyword.toLowerCase();
      if (node.label.toLowerCase().includes(kw) || (node.type && node.type.toLowerCase().includes(kw))) {
        return group.color;
      }
    }
    return null;
  }, [colorGroups]);

  // ═══ Draw ═══
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const cam = cameraRef.current;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0a16';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    const gs = 60 * cam.zoom;
    if (gs > 5) {
      const ox = (cam.x * cam.zoom + width / 2) % gs;
      const oy = (cam.y * cam.zoom + height / 2) % gs;
      for (let x = ox; x < width; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = oy; y < height; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    }

    ctx.save();
    ctx.translate(width / 2 + cam.x * cam.zoom, height / 2 + cam.y * cam.zoom);
    ctx.scale(cam.zoom, cam.zoom);

    const { nodes, edges } = getVisibleSet();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const szMul = nodeSizeMultiplier;
    const lkMul = linkThickness;

    // ── Edges ──
    edges.forEach(e => {
      const src = nodeMap.get(e.source), tgt = nodeMap.get(e.target);
      if (!src || !tgt) return;
      const style = EDGE_STYLES[e.label] || EDGE_STYLES.related;
      const hl = hoveredNode && (e.source === hoveredNode.id || e.target === hoveredNode.id);

      ctx.beginPath();
      ctx.strokeStyle = hl ? 'rgba(255,255,255,0.6)' : style.color;
      ctx.lineWidth = (hl ? 2.5 : (1 + (e.weight || 0.5) * 1.5)) * lkMul;
      if (style.dash.length) ctx.setLineDash(style.dash); else ctx.setLineDash([]);
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow
      if (showArrows && (style.arrow || e.label === 'prerequisite' || e.label === 'contains')) {
        const dx = tgt.x - src.x, dy = tgt.y - src.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const ux = dx / len, uy = dy / len;
          const tr = (tgt.radius || 9) * szMul;
          const tipX = tgt.x - ux * tr * 1.5, tipY = tgt.y - uy * tr * 1.5;
          const as = 7 * lkMul;
          ctx.beginPath();
          ctx.fillStyle = hl ? 'rgba(255,255,255,0.6)' : style.color;
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - ux * as + uy * as * 0.5, tipY - uy * as - ux * as * 0.5);
          ctx.lineTo(tipX - ux * as - uy * as * 0.5, tipY - uy * as + ux * as * 0.5);
          ctx.closePath();
          ctx.fill();
        }
      }
    });

    // ── Nodes ──
    const showText = cam.zoom >= textFadeZoom;
    nodes.forEach(n => {
      const isHov = hoveredNode && hoveredNode.id === n.id;
      const isSel = selectedNode && selectedNode.id === n.id;
      const isLocal = localMode && selectedNode && selectedNode.id === n.id;
      const groupCol = getGroupColor(n);
      const col = groupCol || n.color;
      const glow = groupCol || n.glowColor;
      const rad = (n.radius || 9) * szMul;

      // Glow
      ctx.beginPath();
      const gr = rad * (isHov ? 3.5 : 2.5);
      const gradient = ctx.createRadialGradient(n.x, n.y, rad * 0.3, n.x, n.y, gr);
      gradient.addColorStop(0, hexAlpha(glow, 64));
      gradient.addColorStop(1, hexAlpha(glow, 0));
      ctx.fillStyle = gradient;
      ctx.arc(n.x, n.y, gr, 0, Math.PI * 2);
      ctx.fill();

      // Circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();

      // Ring
      ctx.strokeStyle = isLocal ? '#fbbf24' : isSel ? '#fbbf24' : isHov ? '#ffffff' : hexAlpha(col, 128);
      ctx.lineWidth = isLocal ? 3.5 : isSel ? 3 : isHov ? 2.5 : 1.5;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(n.x, n.y, rad * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();

      // Label
      if (showText || isHov || isSel) {
        const fs = n.type === 'deck' ? 11 : n.type === 'concept' ? 10 : 9;
        ctx.font = `${n.type === 'deck' ? '700' : '500'} ${fs}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = (isHov || isSel) ? 1 : Math.min(1, (cam.zoom - textFadeZoom) / 0.3 + 0.3);
        ctx.fillStyle = '#ffffff';
        let lbl = n.label;
        if (lbl.length > 28) lbl = lbl.substring(0, 25) + '\u2026';
        ctx.fillText(lbl, n.x, n.y + rad + 4);
        ctx.globalAlpha = 1;
      }
    });

    ctx.restore();
  }, [searchQuery, hoveredNode, selectedNode, showArrows, textFadeZoom, nodeSizeMultiplier, linkThickness, getVisibleSet, getGroupColor, localMode]);

  useEffect(() => { drawRef.current = draw; }, [draw]);

  // ═══ Force simulation ═══
  useEffect(() => {
    if (!isSimulating) return;
    let iterCount = 0;
    let running = true;

    const simulate = () => {
      if (!running) return;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      if (!nodes.length) { setIsSimulating(false); return; }

      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      nodes.forEach(n => { n.fx = 0; n.fy = 0; });

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const f = forces.repelForce / (dist * dist);
          const fx = (dx / dist) * f, fy = (dy / dist) * f;
          a.fx -= fx; a.fy -= fy;
          b.fx += fx; b.fy += fy;
        }
      }

      // Attraction
      edges.forEach(e => {
        const s = nodeMap.get(e.source), t = nodeMap.get(e.target);
        if (!s || !t) return;
        const dx = t.x - s.x, dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const disp = dist - forces.linkDistance;
        const f = forces.linkForce * disp * (e.weight || 0.5);
        const fx = (dx / Math.max(dist, 1)) * f, fy = (dy / Math.max(dist, 1)) * f;
        s.fx += fx; s.fy += fy;
        t.fx -= fx; t.fy -= fy;
      });

      // Center gravity
      nodes.forEach(n => { n.fx -= n.x * forces.centerForce; n.fy -= n.y * forces.centerForce; });

      let totalV = 0;
      nodes.forEach(n => {
        if (n.pinned) return;
        n.vx = (n.vx + n.fx) * 0.92;
        n.vy = (n.vy + n.fy) * 0.92;
        const sp = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (sp > 5) { n.vx = (n.vx / sp) * 5; n.vy = (n.vy / sp) * 5; }
        n.x += n.vx; n.y += n.vy;
        totalV += sp;
      });

      iterCount++;
      if (totalV / nodes.length < 0.05 || iterCount > 500) {
        if (drawRef.current) drawRef.current();
        setIsSimulating(false);
        return;
      }
      if (drawRef.current) drawRef.current();
      animFrameRef.current = requestAnimationFrame(simulate);
    };

    animFrameRef.current = requestAnimationFrame(simulate);
    return () => { running = false; if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [isSimulating, forces]);

  // Redraw on state changes
  useEffect(() => {
    if (!isSimulating && canvasReady) draw();
  }, [draw, isSimulating, canvasReady]);

  // Re-simulate when forces change
  const restartSim = () => setIsSimulating(true);

  // ═══ Interactions ═══
  const getNodeAtPos = useCallback((cx, cy) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const mx = (cx - rect.left - rect.width / 2) / cam.zoom - cam.x;
    const my = (cy - rect.top - rect.height / 2) / cam.zoom - cam.y;
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const dx = mx - n.x, dy = my - n.y;
      const r = (n.radius || 9) * nodeSizeMultiplier + 5;
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  }, [nodeSizeMultiplier]);

  const handleMouseDown = useCallback((e) => {
    const node = getNodeAtPos(e.clientX, e.clientY);
    if (node) {
      dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, nodeId: node.id, lastCamX: 0, lastCamY: 0 };
      node.pinned = true;
    } else {
      dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, nodeId: null, lastCamX: cameraRef.current.x, lastCamY: cameraRef.current.y };
    }
  }, [getNodeAtPos]);

  const handleMouseMove = useCallback((e) => {
    const d = dragRef.current, cam = cameraRef.current;
    if (d.active && d.nodeId) {
      const node = nodesRef.current.find(n => n.id === d.nodeId);
      if (node) {
        const rect = canvasRef.current.getBoundingClientRect();
        node.x = (e.clientX - rect.left - rect.width / 2) / cam.zoom - cam.x;
        node.y = (e.clientY - rect.top - rect.height / 2) / cam.zoom - cam.y;
        draw();
      }
    } else if (d.active) {
      cam.x = d.lastCamX + (e.clientX - d.startX) / cam.zoom;
      cam.y = d.lastCamY + (e.clientY - d.startY) / cam.zoom;
      draw();
    } else {
      const node = getNodeAtPos(e.clientX, e.clientY);
      setHoveredNode(node);
      if (canvasRef.current) canvasRef.current.style.cursor = node ? 'pointer' : 'grab';
    }
  }, [draw, getNodeAtPos]);

  const handleMouseUp = useCallback((e) => {
    const d = dragRef.current;
    if (d.active && d.nodeId) {
      const node = nodesRef.current.find(n => n.id === d.nodeId);
      if (node) {
        node.pinned = false;
        const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
          setSelectedNode(node);
          if (node.type === 'card' && onSelectCard) onSelectCard(node.id);
          if (node.type === 'deck' && onSelectDeck) onSelectDeck(node.id);
        }
      }
    }
    dragRef.current = { active: false, startX: 0, startY: 0, nodeId: null, lastCamX: 0, lastCamY: 0 };
  }, [onSelectCard, onSelectDeck]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    cameraRef.current.zoom = Math.max(0.1, Math.min(5, cameraRef.current.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    draw();
  }, [draw]);

  // Touch
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const node = getNodeAtPos(t.clientX, t.clientY);
      if (node) { dragRef.current = { active: true, startX: t.clientX, startY: t.clientY, nodeId: node.id, lastCamX: 0, lastCamY: 0 }; node.pinned = true; }
      else { dragRef.current = { active: true, startX: t.clientX, startY: t.clientY, nodeId: null, lastCamX: cameraRef.current.x, lastCamY: cameraRef.current.y }; }
    } else if (e.touches.length === 2) {
      touchRef.current.lastDist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
    }
  }, [getNodeAtPos]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      if (touchRef.current.lastDist) { cameraRef.current.zoom = Math.max(0.1, Math.min(5, cameraRef.current.zoom * (dist / touchRef.current.lastDist))); draw(); }
      touchRef.current.lastDist = dist;
      return;
    }
    const t = e.touches[0], d = dragRef.current, cam = cameraRef.current;
    if (d.active && d.nodeId) {
      const node = nodesRef.current.find(n => n.id === d.nodeId);
      if (node) { const rect = canvasRef.current.getBoundingClientRect(); node.x = (t.clientX - rect.left - rect.width / 2) / cam.zoom - cam.x; node.y = (t.clientY - rect.top - rect.height / 2) / cam.zoom - cam.y; draw(); }
    } else if (d.active) { cam.x = d.lastCamX + (t.clientX - d.startX) / cam.zoom; cam.y = d.lastCamY + (t.clientY - d.startY) / cam.zoom; draw(); }
  }, [draw]);

  const handleTouchEnd = useCallback((e) => {
    const d = dragRef.current;
    if (d.active && d.nodeId) {
      const node = nodesRef.current.find(n => n.id === d.nodeId);
      if (node) { node.pinned = false; const t = e.changedTouches[0]; if (Math.abs(t.clientX - d.startX) < 10 && Math.abs(t.clientY - d.startY) < 10) { setSelectedNode(node); if (node.type === 'card' && onSelectCard) onSelectCard(node.id); if (node.type === 'deck' && onSelectDeck) onSelectDeck(node.id); } }
    }
    dragRef.current = { active: false, startX: 0, startY: 0, nodeId: null, lastCamX: 0, lastCamY: 0 };
    touchRef.current.lastDist = 0;
  }, [onSelectCard, onSelectDeck]);

  const resetView = () => { cameraRef.current = { x: 0, y: 0, zoom: 1 }; draw(); };

  const { nodes: visNodes } = getVisibleSet();
  const stats = {
    total: nodesRef.current.length,
    visible: visNodes.length,
    decks: visNodes.filter(n => n.type === 'deck').length,
    cards: visNodes.filter(n => n.type === 'card').length,
    concepts: visNodes.filter(n => n.type === 'concept').length,
  };

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0a0a16', zIndex: 1100, display: 'flex', flexDirection: 'column' }}>

      {/* ── Top Bar ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.45rem 0.75rem', background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, gap: '0.5rem', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button onClick={() => setShowPanel(!showPanel)} style={{ ...btnStyle, padding: '0.25rem' }} title="Toggle Settings"><Settings size={16} /></button>
          <span style={{ fontWeight: 700, color: '#c084fc', fontSize: '0.95rem' }}>{'\uD83E\uDDE0'} Knowledge Graph</span>
          <span style={{ fontSize: '0.65rem', color: '#888' }}>
            {stats.visible}/{stats.total} nodes ({stats.decks}d {stats.cards}c {stats.concepts}t)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} style={{ position: 'absolute', left: '7px', color: '#666' }} />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..."
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', color: '#fff', padding: '0.25rem 0.4rem 0.25rem 1.6rem', fontSize: '0.75rem', width: '120px' }}
            />
            {searchQuery && <X size={11} onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '5px', color: '#666', cursor: 'pointer' }} />}
          </div>
          <button onClick={() => { cameraRef.current.zoom = Math.max(0.1, cameraRef.current.zoom * 0.7); draw(); }} style={btnStyle} title="Zoom Out"><ZoomOut size={15} /></button>
          <button onClick={() => { cameraRef.current.zoom = Math.min(5, cameraRef.current.zoom * 1.3); draw(); }} style={btnStyle} title="Zoom In"><ZoomIn size={15} /></button>
          <button onClick={resetView} style={btnStyle} title="Reset"><Maximize2 size={15} /></button>
          <button onClick={onClose} style={{ ...btnStyle, color: '#f87171' }} title="Close"><X size={17} /></button>
        </div>
      </div>

      {/* ── Body: Panel + Canvas ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Settings Panel ── */}
        {showPanel && (
          <div style={{
            width: '240px', minWidth: '240px', background: 'rgba(255,255,255,0.02)',
            borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto',
            flexShrink: 0, fontSize: '0.75rem'
          }}>
            {/* Filters */}
            <Section title="Filters" icon={'\u2699\uFE0F'}>
              <Toggle label="Show Tags (Concepts)" value={showTags} onChange={setShowTags} />
              <Toggle label="Show Cards" value={showCards} onChange={setShowCards} />
              <Toggle label="Show Decks" value={showDecks} onChange={setShowDecks} />
              <Toggle label="Show Orphans" value={showOrphans} onChange={setShowOrphans} />
            </Section>

            {/* Groups */}
            <Section title="Groups" icon={'\uD83C\uDFA8'} defaultOpen={false}>
              {colorGroups.map((g, i) => (
                <div key={g.id} style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                  <input type="color" value={g.color} onChange={(e) => {
                    const updated = [...colorGroups]; updated[i] = { ...g, color: e.target.value }; setColorGroups(updated);
                  }} style={{ width: '24px', height: '24px', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                  <input type="text" value={g.keyword} placeholder="keyword..." onChange={(e) => {
                    const updated = [...colorGroups]; updated[i] = { ...g, keyword: e.target.value }; setColorGroups(updated);
                  }} style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#fff', padding: '0.2rem 0.4rem', fontSize: '0.72rem' }} />
                  <button onClick={() => setColorGroups(colorGroups.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0.15rem', fontSize: '0.8rem' }}>×</button>
                </div>
              ))}
              <button onClick={() => setColorGroups([...colorGroups, { id: Date.now(), keyword: '', color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'), active: true }])}
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '4px', color: '#c084fc', padding: '0.25rem', fontSize: '0.7rem', cursor: 'pointer', width: '100%' }}>
                + Add Color Group
              </button>
            </Section>

            {/* Display */}
            <Section title="Display" icon={'\uD83D\uDC41\uFE0F'}>
              <Toggle label="Show Arrows" value={showArrows} onChange={setShowArrows} />
              <Slider label="Text Fade Threshold" value={textFadeZoom} onChange={setTextFadeZoom} min={0.1} max={2} step={0.05} displayValue={textFadeZoom.toFixed(2)} />
              <Slider label="Node Size" value={nodeSizeMultiplier} onChange={setNodeSizeMultiplier} min={0.3} max={3} step={0.1} displayValue={nodeSizeMultiplier.toFixed(1) + 'x'} />
              <Slider label="Link Thickness" value={linkThickness} onChange={setLinkThickness} min={0.2} max={3} step={0.1} displayValue={linkThickness.toFixed(1) + 'x'} />
            </Section>

            {/* Force Engine */}
            <Section title="Force Engine" icon={'\uD83E\uDDEE'}>
              <Slider label="Center Force" value={forces.centerForce} onChange={(v) => setForces(f => ({ ...f, centerForce: v }))} min={0} max={0.1} step={0.002} displayValue={forces.centerForce.toFixed(3)} />
              <Slider label="Repel Force" value={forces.repelForce} onChange={(v) => setForces(f => ({ ...f, repelForce: v }))} min={0} max={3000} step={50} />
              <Slider label="Link Force" value={forces.linkForce} onChange={(v) => setForces(f => ({ ...f, linkForce: v }))} min={0} max={0.02} step={0.001} displayValue={forces.linkForce.toFixed(3)} />
              <Slider label="Link Distance" value={forces.linkDistance} onChange={(v) => setForces(f => ({ ...f, linkDistance: v }))} min={30} max={400} step={10} />
              <button onClick={restartSim} style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '4px', color: '#c084fc', padding: '0.3rem', fontSize: '0.72rem', cursor: 'pointer', width: '100%', marginTop: '0.2rem' }}>
                {'\u26A1'} Re-simulate
              </button>
              <button onClick={() => { setForces({ ...DEFAULT_FORCES }); restartSim(); }} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', color: '#888', padding: '0.25rem', fontSize: '0.68rem', cursor: 'pointer', width: '100%' }}>
                Reset Defaults
              </button>
            </Section>

            {/* Local Graph */}
            <Section title="Local Graph" icon={'\uD83D\uDCCD'} defaultOpen={false}>
              <Toggle label="Local Mode" value={localMode} onChange={setLocalMode} />
              {localMode && (
                <>
                  <div style={{ fontSize: '0.7rem', color: '#888', padding: '0.2rem 0' }}>
                    {selectedNode ? `Focused: ${selectedNode.label}` : 'Click a node to focus'}
                  </div>
                  <Slider label="Depth" value={localDepth} onChange={setLocalDepth} min={1} max={5} step={1} />
                  <Toggle label="Incoming Links" value={showIncoming} onChange={setShowIncoming} />
                  <Toggle label="Outgoing Links" value={showOutgoing} onChange={setShowOutgoing} />
                  <Toggle label="Neighbor Links" value={showNeighborLinks} onChange={setShowNeighborLinks} />
                </>
              )}
            </Section>
          </div>
        )}

        {/* ── Canvas ── */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <canvas ref={canvasRef}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onWheel={handleWheel} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
            style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
          />

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(10,10,22,0.88)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '7px', padding: '0.5rem 0.7rem', fontSize: '0.65rem' }}>
            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
              <LI color="#8b5cf6" label="Deck" s={10} />
              <LI color="#3b82f6" label="Card" s={7} />
              <LI color="#06b6d4" label="Concept" s={8} />
            </div>
          </div>

          {/* Tooltip */}
          {hoveredNode && (
            <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(10,10,22,0.92)', border: `1px solid ${hoveredNode.glowColor}40`, borderRadius: '7px', padding: '0.5rem 0.7rem', maxWidth: '220px' }}>
              <div style={{ fontSize: '0.68rem', color: hoveredNode.glowColor, fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.15rem' }}>{hoveredNode.type}</div>
              <div style={{ fontSize: '0.82rem', color: '#fff', fontWeight: 600 }}>{hoveredNode.label}</div>
              {hoveredNode.card && hoveredNode.card.concept && (
                <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.2rem' }}>{hoveredNode.card.concept}</div>
              )}
            </div>
          )}

          {isSimulating && (
            <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '16px', padding: '0.2rem 0.7rem', fontSize: '0.68rem', color: '#c084fc' }}>
              {'\u26A1'} Simulating...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '5px', color: '#ccc', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center'
};

function LI({ color, label, s }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <div style={{ width: s, height: s, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}60` }} />
      <span style={{ color: '#999' }}>{label}</span>
    </div>
  );
}
