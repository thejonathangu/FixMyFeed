import { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { NodeData } from '../services/dataService';
import WebGLBackground from './WebGLBackground';

interface HoveredNode {
  node: NodeData;
  screenX: number;
  screenY: number;
}

interface SelectedNode {
  node: NodeData;
}

// ---------------------------------------------------------------------------
// 2D node graph with CSS 3D perspective rotation + WebGL background
// ---------------------------------------------------------------------------
// Focal length for perspective projection — higher = flatter, lower = more dramatic
const FOCAL = 600;
// How many canvas-pixels the Z range maps to
const DEPTH_SCALE = 280;
// Auto-rotation: max degrees and period in ms
const AUTO_ROT_MAX = 8;
const AUTO_ROT_PERIOD = 15000;

export default function NodeGraph({ nodes }: { nodes: NodeData[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<HoveredNode | null>(null);
  const [selected, setSelected] = useState<SelectedNode | null>(null);

  // Rotation state (manual CSS tilt)
  const [rotation, setRotation] = useState({ rx: 0, ry: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, rx: 0, ry: 0 });
  // Auto-rotation: pauses while user is dragging
  const autoRotPaused = useRef(false);
  const autoRotPausedAt = useRef(0);

  // Track size
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  // Animated positions (now includes z)
  const currentPos = useRef<Map<string, { x: number; y: number; z: number; weight: number }>>(new Map());

  // Last projected screen positions from the draw loop — used for accurate hit testing
  const screenPos = useRef<Map<string, { sx: number; sy: number; r: number }>>(new Map());

  const toPixel = useCallback((nx: number, ny: number) => {
    const { w, h } = sizeRef.current;
    const padX = 80;
    const padY = 60;
    return {
      px: padX + nx * (w - padX * 2),
      py: padY + ny * (h - padY * 2),
    };
  }, []);

  const getRadius = (weight: number) => 8 + weight * 30;

  const getColor = (category: 'toxic' | 'value', weight: number, alpha = 1) => {
    if (category === 'value') {
      const g = 109 + weight * 40;
      const b = 90 + weight * 35;
      return `rgba(90, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
    }
    const r = 120 + weight * 70;
    const g = 90 + weight * 25;
    const b = 90 + weight * 18;
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
  };

  const hitTest = useCallback(
    (mx: number, my: number): NodeData | null => {
      // Use actual screen positions from the last draw frame (front-to-back priority)
      const sorted = [...nodes].sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
      for (const n of sorted) {
        const sp = screenPos.current.get(n.id);
        if (!sp) continue;
        const dx = mx - sp.sx;
        const dy = my - sp.sy;
        if (dx * dx + dy * dy <= (sp.r + 6) * (sp.r + 6)) return n;
      }
      return null;
    },
    [nodes],
  );

  // Resize observer
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        sizeRef.current = { w: width, h: height, dpr };
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
    });

    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;

    function draw() {
      const { w, h, dpr } = sizeRef.current;
      if (w === 0 || h === 0) {
        animId = requestAnimationFrame(draw);
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Auto-rotation: slow sine oscillation unless user is dragging
      const now = Date.now();
      const autoRy = autoRotPaused.current
        ? 0
        : AUTO_ROT_MAX * Math.sin((now / AUTO_ROT_PERIOD) * Math.PI * 2);

      // Perspective projection helper:
      // rotates the node's X around the Y axis by autoRy degrees, then applies
      // a simple divide-by-depth scale so far nodes appear smaller + dimmer.
      const ryRad = (autoRy * Math.PI) / 180;
      const project = (nx: number, ny: number, nz: number) => {
        // Convert normalized [0,1] coords to centered world coords
        const wx = (nx - 0.5) * w;
        const wy = (ny - 0.5) * h;
        const wz = nz * DEPTH_SCALE;
        // Rotate around Y axis
        const rx3 = wx * Math.cos(ryRad) - wz * Math.sin(ryRad);
        const rz3 = wx * Math.sin(ryRad) + wz * Math.cos(ryRad);
        // Perspective divide
        const scale = FOCAL / (FOCAL + rz3);
        return {
          sx: w / 2 + rx3 * scale,
          sy: h / 2 + wy * scale,
          scale,          // > 1 = in front, < 1 = behind
        };
      };

      // Lerp animated positions
      const lerpFactor = 0.1;
      for (const n of nodes) {
        const { px: tx, py: ty } = toPixel(n.x, n.y);
        const tz = n.z ?? 0;
        let cur = currentPos.current.get(n.id);
        if (!cur) {
          cur = { x: tx, y: ty, z: tz, weight: n.weight };
          currentPos.current.set(n.id, cur);
        } else {
          cur.x += (tx - cur.x) * lerpFactor;
          cur.y += (ty - cur.y) * lerpFactor;
          cur.z += (tz - cur.z) * lerpFactor;
          cur.weight += (n.weight - cur.weight) * lerpFactor;
        }
      }

      const posMap = currentPos.current;

      // Highlight set
      const selectedId = selected?.node.id;
      const hoveredId = hovered?.node.id;
      const highlightIds = new Set<string>();

      if (selectedId) {
        const sNode = nodes.find((n) => n.id === selectedId);
        if (sNode) {
          highlightIds.add(selectedId);
          sNode.connections.forEach((c) => highlightIds.add(c));
        }
      } else if (hoveredId) {
        const hNode = nodes.find((n) => n.id === hoveredId);
        if (hNode) {
          highlightIds.add(hoveredId);
          hNode.connections.forEach((c) => highlightIds.add(c));
        }
      }

      // --- Connections --- (use projected screen positions)
      for (const n of nodes) {
        const from = posMap.get(n.id);
        if (!from) continue;
        const pFrom = project(n.x, n.y, from.z);

        for (const connId of n.connections) {
          if (connId < n.id) continue;
          const toNode = nodes.find((nd) => nd.id === connId);
          const to = posMap.get(connId);
          if (!to || !toNode) continue;
          const pTo = project(toNode.x, toNode.y, to.z);

          const isHighlighted =
            highlightIds.size > 0 && highlightIds.has(n.id) && highlightIds.has(connId);
          const isDimmed = highlightIds.size > 0 && !isHighlighted;

          ctx.beginPath();
          ctx.moveTo(pFrom.sx, pFrom.sy);
          ctx.lineTo(pTo.sx, pTo.sy);

          if (isHighlighted) {
            const isVal = n.category === 'value';
            ctx.strokeStyle = isVal ? 'rgba(90, 109, 90, 0.45)' : 'rgba(158, 107, 107, 0.4)';
            ctx.lineWidth = 1.5;
          } else if (isDimmed) {
            ctx.strokeStyle = 'rgba(44, 38, 31, 0.04)';
            ctx.lineWidth = 0.5;
          } else {
            ctx.strokeStyle = 'rgba(44, 38, 31, 0.08)';
            ctx.lineWidth = 0.5;
          }
          ctx.stroke();
        }
      }

      // --- Nodes ---
      // Painter's algorithm: sort back-to-front by projected Z so front nodes
      // always paint on top of rear ones.
      const sorted = [...nodes].sort((a, b) => {
        const za = posMap.get(a.id)?.z ?? 0;
        const zb = posMap.get(b.id)?.z ?? 0;
        return za - zb; // negative Z (back) renders first
      });

      for (const n of sorted) {
        const cur = posMap.get(n.id);
        if (!cur) continue;

        // Project to screen with depth
        const proj = project(n.x, n.y, cur.z);
        const { sx, sy, scale } = proj;

        // Scale radius and alpha by perspective depth
        const r = getRadius(cur.weight) * scale;
        const depthAlpha = Math.max(0.25, Math.min(1, scale * 1.2));

        // Store projected screen position so hitTest can use exact drawn coords
        screenPos.current.set(n.id, { sx, sy, r });
        const isDimmed = highlightIds.size > 0 && !highlightIds.has(n.id);
        const isActive = highlightIds.has(n.id);
        const alpha = (isDimmed ? 0.12 : 1) * depthAlpha;

        // Outer glow (only for front nodes — scale > 0.9)
        if (!isDimmed && n.category === 'value' && cur.weight > 0.25 && scale > 0.9) {
          const grad = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 2.8);
          grad.addColorStop(0, getColor('value', cur.weight, 0.18 * depthAlpha));
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.beginPath();
          ctx.arc(sx, sy, r * 2.8, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        if (isActive && n.category === 'toxic') {
          const grad = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 2);
          grad.addColorStop(0, `rgba(158, 107, 107, ${0.14 * depthAlpha})`);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.beginPath();
          ctx.arc(sx, sy, r * 2, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Body
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = getColor(n.category, cur.weight, alpha);
        ctx.fill();

        // Specular highlight
        if (!isDimmed && cur.weight > 0.15) {
          const spec = ctx.createRadialGradient(
            sx - r * 0.3, sy - r * 0.3, 0,
            sx, sy, r,
          );
          spec.addColorStop(0, `rgba(255, 255, 255, ${0.15 * cur.weight * depthAlpha})`);
          spec.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fillStyle = spec;
          ctx.fill();
        }

        // Label
        if (!isDimmed) {
          const fontSize = Math.max(8, Math.min(11, r * 0.45));
          ctx.font = `500 ${fontSize}px "DM Sans", system-ui, sans-serif`;
          ctx.textAlign = 'center';

          if (r >= 18) {
            ctx.textBaseline = 'middle';
            ctx.fillStyle =
              n.category === 'value'
                ? `rgba(44, 38, 31, ${Math.min(0.35, cur.weight * 0.5) * depthAlpha})`
                : `rgba(253, 250, 246, ${Math.min(0.9, cur.weight * 1.0) * depthAlpha})`;
            ctx.fillText(n.theme_name, sx, sy);
          } else {
            ctx.textBaseline = 'top';
            ctx.fillStyle =
              n.category === 'value'
                ? `rgba(90, 109, 90, ${Math.max(0.35, cur.weight) * depthAlpha})`
                : `rgba(200, 140, 130, ${Math.max(0.35, cur.weight * 0.75) * depthAlpha})`;
            ctx.fillText(n.theme_name, sx, sy + r + 4);
          }
        }
      }

      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, [nodes, toPixel, selected, hovered]);

  // --- Drag to rotate ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      isDragging.current = true;
      autoRotPaused.current = true; // pause auto-rotation while dragging
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        rx: rotation.rx,
        ry: rotation.ry,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }, [rotation]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) {
      // Normal hover
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const node = hitTest(mx, my);

      if (node) {
        setHovered({ node, screenX: e.clientX, screenY: e.clientY });
        canvas.style.cursor = 'pointer';
      } else {
        setHovered(null);
        canvas.style.cursor = 'default';
      }
      return;
    }

    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    setRotation({
      rx: Math.max(-25, Math.min(25, dragStart.current.rx - dy * 0.15)),
      ry: Math.max(-30, Math.min(30, dragStart.current.ry + dx * 0.15)),
    });
  }, [hitTest]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    // Resume auto-rotation 1.5s after the user releases
    autoRotPausedAt.current = Date.now();
    setTimeout(() => {
      autoRotPaused.current = false;
    }, 1500);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey) return; // was a rotation drag
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const node = hitTest(mx, my);

      if (node) {
        setSelected((prev) => (prev?.node.id === node.id ? null : { node }));
      } else {
        setSelected(null);
      }
    },
    [hitTest],
  );

  // Double-click to reset rotation
  const handleDoubleClick = useCallback(() => {
    setRotation({ rx: 0, ry: 0 });
  }, []);

  const connectedNodes = selected
    ? nodes.filter((n) => selected.node.connections.includes(n.id))
    : [];

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* WebGL ambient background */}
      <WebGLBackground />

      {/* Perspective container */}
      <div
        className="absolute inset-0"
        style={{ perspective: '1200px', perspectiveOrigin: '50% 50%' }}
      >
        <div
          ref={wrapperRef}
          className="absolute inset-0 transition-transform duration-100 ease-out"
          style={{
            transform: `rotateX(${rotation.rx}deg) rotateY(${rotation.ry}deg)`,
            transformStyle: 'preserve-3d',
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              setHovered(null);
              isDragging.current = false;
            }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={(e) => e.preventDefault()}
            className="block w-full h-full"
          />
        </div>
      </div>

      {/* Rotation hint */}
      {rotation.rx === 0 && rotation.ry === 0 && (
        <div className="absolute bottom-3 right-3 z-20 pointer-events-none">
          <div
            className="rounded-md px-2.5 py-1 font-body text-[9px] tracking-wide text-text-dim uppercase"
            style={{
              background: 'rgba(253, 250, 246, 0.88)',
              border: '1px solid rgba(44,38,31,0.12)',
            }}
          >
            Shift+Drag to rotate
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      <AnimatePresence>
        {hovered && !selected && (
          <motion.div
            key="tooltip"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="fixed z-50 pointer-events-none"
            style={{ left: hovered.screenX + 16, top: hovered.screenY - 8 }}
          >
            <div
              className="rounded-lg border px-3 py-2 max-w-xs"
              style={{
                background: 'rgba(253, 250, 246, 0.95)',
                borderColor:
                  hovered.node.category === 'value'
                    ? 'rgba(90, 109, 90, 0.35)'
                    : 'rgba(158, 107, 107, 0.35)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <p
                className="font-body text-[10px] tracking-wide uppercase mb-0.5 font-medium"
                style={{
                  color: hovered.node.category === 'value' ? '#5a6d5a' : '#9e6b6b',
                }}
              >
                {hovered.node.category === 'value' ? 'High Value' : 'Toxic'}
              </p>
              <p className="text-sm text-text-primary font-medium">
                {hovered.node.theme_name}
              </p>
              <p className="text-xs text-text-muted mt-1">Click for details</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected node detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-4 right-4 w-72 z-40"
          >
            <div
              className="rounded-xl border overflow-hidden"
              style={{
                background: 'rgba(253, 250, 246, 0.94)',
                borderColor:
                  selected.node.category === 'value'
                    ? 'rgba(90, 109, 90, 0.25)'
                    : 'rgba(158, 107, 107, 0.25)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 12px 40px rgba(44, 38, 31, 0.12)',
              }}
            >
              <div
                className="h-[2px]"
                style={{
                  background:
                    selected.node.category === 'value'
                      ? 'linear-gradient(90deg, transparent, #5a6d5a, transparent)'
                      : 'linear-gradient(90deg, transparent, #9e6b6b, transparent)',
                }}
              />

              <div className="p-5">
                <button
                  onClick={() => setSelected(null)}
                  className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full text-text-dim hover:text-text-primary hover:bg-stone-400/20 transition-colors text-xs"
                >
                  ✕
                </button>

                <div
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 mb-3"
                  style={{
                    background:
                      selected.node.category === 'value'
                        ? 'rgba(90, 109, 90, 0.12)'
                        : 'rgba(158, 107, 107, 0.12)',
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background:
                        selected.node.category === 'value' ? '#5a6d5a' : '#9e6b6b',
                    }}
                  />
                  <span
                    className="font-body text-[9px] tracking-wide uppercase font-medium"
                    style={{
                      color:
                        selected.node.category === 'value' ? '#5a6d5a' : '#9e6b6b',
                    }}
                  >
                    {selected.node.category === 'value' ? 'High Value' : 'Toxic Pattern'}
                  </span>
                </div>

                <h3 className="text-lg text-text-primary font-medium mb-2">
                  {selected.node.theme_name}
                </h3>
                <p className="text-sm text-text-muted leading-relaxed mb-4">
                  {selected.node.description}
                </p>

                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-body text-[9px] tracking-wide text-text-dim uppercase">
                      Influence weight
                    </span>
                    <span className="font-body text-xs text-text-muted tabular-nums">
                      {Math.round(selected.node.weight * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-stone-400/35 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${selected.node.weight * 100}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      style={{
                        background:
                          selected.node.category === 'value'
                            ? 'linear-gradient(90deg, #6b6560, #5a6d5a)'
                            : 'linear-gradient(90deg, #8a6a6a, #9e6b6b)',
                      }}
                    />
                  </div>
                </div>

                {connectedNodes.length > 0 && (
                  <div>
                    <p className="font-body text-[9px] tracking-wide text-text-dim uppercase mb-2">
                      Connected Nodes ({connectedNodes.length})
                    </p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {connectedNodes.map((cn) => (
                        <button
                          key={cn.id}
                          onClick={() => setSelected({ node: cn })}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-stone-500/15 transition-colors text-left"
                        >
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              background: cn.category === 'value' ? '#5a6d5a' : '#9e6b6b',
                              opacity: Math.max(0.4, cn.weight),
                            }}
                          />
                          <span className="text-xs text-text-muted truncate">
                            {cn.theme_name}
                          </span>
                          <span className="text-[10px] text-text-dim ml-auto tabular-nums shrink-0">
                            {Math.round(cn.weight * 100)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
