import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Search, X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const SIMULATION = {
  repulsion: 800,
  attraction: 0.004,
  centerGravity: 0.012,
  damping: 0.92,
  maxVelocity: 5,
  idealEdgeLength: 140,
  settleThreshold: 0.05,
  maxIterations: 500
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

function getDifficultyColor(card) {
  if (!card || !card.state || !card.state.repetitions) return '#3b82f6';
  const d = card.state.difficulty || 5;
  const hue = ((10 - d) / 10) * 120;
  return `hsl(${hue.toFixed(0)}, 75%, 55%)`;
}

export default function KnowledgeGraph({ graphData, cards = [], decks = [], onClose, onSelectCard, onSelectDeck }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animFrameRef = useRef(null);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isSimulating, setIsSimulating] = useState(true);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, nodeId: null, lastCamX: 0, lastCamY: 0 });

  // Initialize nodes with positions
  useEffect(() => {
    if (!graphData || !graphData.nodes) return;

    const cardMap = new Map(cards.map(c => [c.id, c]));
    const nodeCount = graphData.nodes.length;
    const spreadRadius = Math.max(200, nodeCount * 12);

    nodesRef.current = graphData.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / nodeCount;
      const r = spreadRadius * (0.3 + Math.random() * 0.7);
      const card = cardMap.get(n.id);
      return {
        ...n,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        radius: NODE_STYLES[n.type]?.radius || 8,
        color: n.type === 'card' ? getDifficultyColor(card) : (NODE_STYLES[n.type]?.baseColor || '#888'),
        glowColor: n.type === 'card' ? getDifficultyColor(card) : (NODE_STYLES[n.type]?.glowColor || '#888'),
        pinned: false
      };
    });

    edgesRef.current = (graphData.edges || []).map(e => ({ ...e }));
    setIsSimulating(true);
  }, [graphData, cards]);

  // Force simulation
  useEffect(() => {
    if (!isSimulating) return;
    let iterCount = 0;

    const simulate = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      if (!nodes.length) return;

      const nodeMap = new Map(nodes.map(n => [n.id, n]));

      // Reset forces
      nodes.forEach(n => { n.fx = 0; n.fy = 0; });

      // Repulsion (all pairs)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = SIMULATION.repulsion / (dist * dist);
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          a.fx -= fx; a.fy -= fy;
          b.fx += fx; b.fy += fy;
        }
      }

      // Attraction along edges
      edges.forEach(e => {
        const source = nodeMap.get(e.source), target = nodeMap.get(e.target);
        if (!source || !target) return;
        const dx = target.x - source.x, dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const displacement = dist - SIMULATION.idealEdgeLength;
        const force = SIMULATION.attraction * displacement * (e.weight || 0.5);
        const fx = (dx / Math.max(dist, 1)) * force;
        const fy = (dy / Math.max(dist, 1)) * force;
        source.fx += fx; source.fy += fy;
        target.fx -= fx; target.fy -= fy;
      });

      // Center gravity
      nodes.forEach(n => {
        n.fx -= n.x * SIMULATION.centerGravity;
        n.fy -= n.y * SIMULATION.centerGravity;
      });

      // Apply forces
      let totalVelocity = 0;
      nodes.forEach(n => {
        if (n.pinned) return;
        n.vx = (n.vx + n.fx) * SIMULATION.damping;
        n.vy = (n.vy + n.fy) * SIMULATION.damping;
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (speed > SIMULATION.maxVelocity) {
          n.vx = (n.vx / speed) * SIMULATION.maxVelocity;
          n.vy = (n.vy / speed) * SIMULATION.maxVelocity;
        }
        n.x += n.vx;
        n.y += n.vy;
        totalVelocity += speed;
      });

      iterCount++;
      if (totalVelocity / nodes.length < SIMULATION.settleThreshold || iterCount > SIMULATION.maxIterations) {
        setIsSimulating(false);
      }

      draw();
      if (isSimulating) {
        animFrameRef.current = requestAnimationFrame(simulate);
      }
    };

    animFrameRef.current = requestAnimationFrame(simulate);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [isSimulating]);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const cam = cameraRef.current;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0a0a16';
    ctx.fillRect(0, 0, width, height);

    // Grid pattern (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    const gridSize = 60 * cam.zoom;
    const offsetX = (cam.x * cam.zoom + width / 2) % gridSize;
    const offsetY = (cam.y * cam.zoom + height / 2) % gridSize;
    for (let x = offsetX; x < width; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = offsetY; y < height; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    ctx.save();
    ctx.translate(width / 2 + cam.x * cam.zoom, height / 2 + cam.y * cam.zoom);
    ctx.scale(cam.zoom, cam.zoom);

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = (n) => !searchQuery || n.label.toLowerCase().includes(searchLower);

    // Draw edges
    edges.forEach(e => {
      const source = nodeMap.get(e.source), target = nodeMap.get(e.target);
      if (!source || !target) return;

      const style = EDGE_STYLES[e.label] || EDGE_STYLES.related;
      const isHighlighted = hoveredNode && (e.source === hoveredNode.id || e.target === hoveredNode.id);

      ctx.beginPath();
      ctx.strokeStyle = isHighlighted ? 'rgba(255,255,255,0.6)' : style.color;
      ctx.lineWidth = isHighlighted ? 2.5 : (1 + (e.weight || 0.5) * 1.5);

      if (style.dash.length) ctx.setLineDash(style.dash);
      else ctx.setLineDash([]);

      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow for prerequisite
      if (style.arrow) {
        const dx = target.x - source.x, dy = target.y - source.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len, uy = dy / len;
        const tipX = target.x - ux * target.radius * 1.5;
        const tipY = target.y - uy * target.radius * 1.5;
        const arrowSize = 8;
        ctx.beginPath();
        ctx.fillStyle = isHighlighted ? 'rgba(255,255,255,0.6)' : style.color;
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - ux * arrowSize + uy * arrowSize * 0.5, tipY - uy * arrowSize - ux * arrowSize * 0.5);
        ctx.lineTo(tipX - ux * arrowSize - uy * arrowSize * 0.5, tipY - uy * arrowSize + ux * arrowSize * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    });

    // Draw nodes
    nodes.forEach(n => {
      const matches = matchesSearch(n);
      const isHovered = hoveredNode && hoveredNode.id === n.id;
      const isSelected = selectedNode && selectedNode.id === n.id;
      const alpha = searchQuery && !matches ? 0.15 : 1;

      // Glow
      if (alpha > 0.5) {
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(n.x, n.y, n.radius * 0.3, n.x, n.y, n.radius * (isHovered ? 3.5 : 2.5));
        gradient.addColorStop(0, n.glowColor + '40');
        gradient.addColorStop(1, n.glowColor + '00');
        ctx.fillStyle = gradient;
        ctx.arc(n.x, n.y, n.radius * (isHovered ? 3.5 : 2.5), 0, Math.PI * 2);
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = alpha < 1 ? (n.color + '30') : n.color;
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fbbf24' : isHovered ? '#fff' : (n.color + '80');
      ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 1.5;
      ctx.stroke();

      // Inner highlight
      if (alpha > 0.5) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
      }

      // Label
      const fontSize = n.type === 'deck' ? 11 : n.type === 'concept' ? 10 : 9;
      ctx.font = `${n.type === 'deck' ? '700' : '500'} ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = alpha < 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)';

      // Truncate long labels
      let displayLabel = n.label;
      if (displayLabel.length > 25) displayLabel = displayLabel.substring(0, 22) + '\u2026';
      ctx.fillText(displayLabel, n.x, n.y + n.radius + 5);
    });

    ctx.restore();
  }, [searchQuery, hoveredNode, selectedNode]);

  // Redraw when not simulating
  useEffect(() => {
    if (!isSimulating) draw();
  }, [draw, isSimulating, searchQuery, hoveredNode, selectedNode]);

  // Canvas resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      draw();
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Mouse interactions
  const getNodeAtPos = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const mx = (clientX - rect.left - rect.width / 2) / cam.zoom - cam.x;
    const my = (clientY - rect.top - rect.height / 2) / cam.zoom - cam.y;

    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const dx = mx - n.x, dy = my - n.y;
      if (dx * dx + dy * dy <= (n.radius + 5) * (n.radius + 5)) return n;
    }
    return null;
  }, []);

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
    const d = dragRef.current;
    const cam = cameraRef.current;

    if (d.active && d.nodeId) {
      const node = nodesRef.current.find(n => n.id === d.nodeId);
      if (node) {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
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
      if (canvasRef.current) {
        canvasRef.current.style.cursor = node ? 'pointer' : 'grab';
      }
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
    const cam = cameraRef.current;
    const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
    cam.zoom = Math.max(0.15, Math.min(4, cam.zoom * zoomFactor));
    draw();
  }, [draw]);

  // Touch support for mobile
  const touchRef = useRef({ lastDist: 0 });

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const node = getNodeAtPos(t.clientX, t.clientY);
      if (node) {
        dragRef.current = { active: true, startX: t.clientX, startY: t.clientY, nodeId: node.id, lastCamX: 0, lastCamY: 0 };
        node.pinned = true;
      } else {
        dragRef.current = { active: true, startX: t.clientX, startY: t.clientY, nodeId: null, lastCamX: cameraRef.current.x, lastCamY: cameraRef.current.y };
      }
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1];
      touchRef.current.lastDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    }
  }, [getNodeAtPos]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (touchRef.current.lastDist) {
        const scale = dist / touchRef.current.lastDist;
        cameraRef.current.zoom = Math.max(0.15, Math.min(4, cameraRef.current.zoom * scale));
        draw();
      }
      touchRef.current.lastDist = dist;
      return;
    }

    const t = e.touches[0];
    const d = dragRef.current;
    const cam = cameraRef.current;
    if (d.active && d.nodeId) {
      const node = nodesRef.current.find(n => n.id === d.nodeId);
      if (node) {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        node.x = (t.clientX - rect.left - rect.width / 2) / cam.zoom - cam.x;
        node.y = (t.clientY - rect.top - rect.height / 2) / cam.zoom - cam.y;
        draw();
      }
    } else if (d.active) {
      cam.x = d.lastCamX + (t.clientX - d.startX) / cam.zoom;
      cam.y = d.lastCamY + (t.clientY - d.startY) / cam.zoom;
      draw();
    }
  }, [draw]);

  const handleTouchEnd = useCallback((e) => {
    const d = dragRef.current;
    if (d.active && d.nodeId) {
      const node = nodesRef.current.find(n => n.id === d.nodeId);
      if (node) {
        node.pinned = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - d.startX, dy = t.clientY - d.startY;
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
          setSelectedNode(node);
          if (node.type === 'card' && onSelectCard) onSelectCard(node.id);
          if (node.type === 'deck' && onSelectDeck) onSelectDeck(node.id);
        }
      }
    }
    dragRef.current = { active: false, startX: 0, startY: 0, nodeId: null, lastCamX: 0, lastCamY: 0 };
    touchRef.current.lastDist = 0;
  }, [onSelectCard, onSelectDeck]);

  const resetView = () => { cameraRef.current = { x: 0, y: 0, zoom: 1 }; draw(); };
  const zoomIn = () => { cameraRef.current.zoom = Math.min(4, cameraRef.current.zoom * 1.3); draw(); };
  const zoomOut = () => { cameraRef.current.zoom = Math.max(0.15, cameraRef.current.zoom * 0.7); draw(); };

  const nodeStats = {
    decks: nodesRef.current.filter(n => n.type === 'deck').length,
    cards: nodesRef.current.filter(n => n.type === 'card').length,
    concepts: nodesRef.current.filter(n => n.type === 'concept').length,
    edges: edgesRef.current.length
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: '#0a0a16', zIndex: 1100, display: 'flex', flexDirection: 'column'
    }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, flexWrap: 'wrap', gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontWeight: 700, color: '#c084fc', fontSize: '1rem' }}>{'\uD83E\uDDE0'} Knowledge Graph</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {nodeStats.decks}d {nodeStats.cards}c {nodeStats.concepts}concepts {nodeStats.edges}edges
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes..."
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px', color: '#fff', padding: '0.3rem 0.5rem 0.3rem 1.8rem',
                fontSize: '0.8rem', width: '140px'
              }}
            />
            {searchQuery && (
              <X size={12} onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '6px', color: 'var(--text-muted)', cursor: 'pointer' }} />
            )}
          </div>
          <button onClick={zoomOut} style={btnStyle} title="Zoom Out"><ZoomOut size={16} /></button>
          <button onClick={zoomIn} style={btnStyle} title="Zoom In"><ZoomIn size={16} /></button>
          <button onClick={resetView} style={btnStyle} title="Reset View"><Maximize2 size={16} /></button>
          <button onClick={onClose} style={{ ...btnStyle, color: '#f87171' }} title="Close"><X size={18} /></button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
        />

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: '12px', left: '12px',
          background: 'rgba(10, 10, 22, 0.85)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px', padding: '0.6rem 0.8rem', fontSize: '0.7rem'
        }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <LegendItem color="#8b5cf6" label="Deck" size={12} />
            <LegendItem color="#3b82f6" label="Card" size={8} />
            <LegendItem color="#06b6d4" label="Concept" size={9} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)' }}>{'\u2500\u2500'} related</span>
            <span style={{ color: 'var(--text-muted)' }}>- - contains</span>
            <span style={{ color: 'var(--text-muted)' }}>{'\u2500\u2500\u25B6'} prerequisite</span>
          </div>
        </div>

        {/* Tooltip */}
        {hoveredNode && (
          <div style={{
            position: 'absolute', top: '12px', right: '12px',
            background: 'rgba(10, 10, 22, 0.9)', border: `1px solid ${hoveredNode.glowColor}40`,
            borderRadius: '8px', padding: '0.6rem 0.8rem', maxWidth: '250px'
          }}>
            <div style={{ fontSize: '0.75rem', color: hoveredNode.glowColor, fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.2rem' }}>{hoveredNode.type}</div>
            <div style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>{hoveredNode.label}</div>
          </div>
        )}

        {/* Simulating indicator */}
        {isSimulating && (
          <div style={{
            position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '20px', padding: '0.25rem 0.75rem', fontSize: '0.7rem', color: '#c084fc'
          }}>
            Simulating layout...
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer',
  padding: '0.3rem', display: 'flex', alignItems: 'center'
};

function LegendItem({ color, label, size }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}60` }} />
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}
