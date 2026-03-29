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
const FOCAL = 600;
const DEPTH_SCALE = 280;
const AUTO_ROT_MAX = 8;
const AUTO_ROT_PERIOD = 15000;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 3.5;
const ZOOM_STEP = 0.18;

export default function NodeGraph({ nodes }: { nodes: NodeData[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<HoveredNode | null>(null);
  const [selected, setSelected] = useState<SelectedNode | null>(null);

  // Rotation state
  const [rotation, setRotation] = useState({ rx: 0, ry: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, rx: 0, ry: 0 });
  const autoRotPaused = useRef(false);
  const autoRotPausedAt = useRef(0);

  // Zoom state — ref for draw loop (no stale closure), state for UI buttons
  const zoomRef = useRef(1);
  const [zoom, setZoom] = useState(1);

  const applyZoom = useCallback((rawSx: number, rawSy: number) => {
    const { w, h } = sizeRef.current;
    return {
      sx: w / 2 + (rawSx - w / 2) * zoomRef.current,
      sy: h / 2 + (rawSy - h / 2) * zoomRef.current,
    };
  }, []);

  const setZoomClamped = useCallback((next: number) => {
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    zoomRef.current = z;
    setZoom(z);
  }, []);

  // Track size
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  // Animated positions
  const currentPos = useRef<Map<string, { x: number; y: number; z: number; weight: number }>>(new Map());

  // Last projected screen positions — used for hit testing
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

  const getColor = (category: 'toxic' | 'value' | 'neutral', weight: number, alpha = 1) => {
    if (category === 'value') {
      const g = 109 + weight * 40;
      const b = 90 + weight * 35;
      return `rgba(90, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
    }
    if (category === 'neutral') {
      const r = 180 + weight * 30;
      const g = 140 + weight * 20;
      const b = 60 + weight * 20;
      return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
    }
    const r = 120 + weight * 70;
    const g = 90 + weight * 25;
    const b = 90 + weight * 18;
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
  };

  const hitTest = useCallback(
    (mx: number, my: number): NodeData | null => {
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

      const now = Date.now();
      const autoRy = autoRotPaused.current
        ? 0
        : AUTO_ROT_MAX * Math.sin((now / AUTO_ROT_PERIOD) * Math.PI * 2);

      const ryRad = (autoRy * Math.PI) / 180;
      const projectRaw = (nx: number, ny: number, nz: number) => {
        const wx = (nx - 0.5) * w;
        const wy = (ny - 0.5) * h;
        const wz = nz * DEPTH_SCALE;
        const rx3 = wx * Math.cos(ryRad) - wz * Math.sin(ryRad);
        const rz3 = wx * Math.sin(ryRad) + wz * Math.cos(ryRad);
        const scale = FOCAL / (FOCAL + rz3);
        return {
          sx: w / 2 + rx3 * scale,
          sy: h / 2 + wy * scale,
          scale,
        };
      };

      // Project + apply zoom (centered on canvas midpoint)
      const z = zoomRef.current;
      const project = (nx: number, ny: number, nz: number) => {
        const raw = projectRaw(nx, ny, nz);
        return {
          sx: w / 2 + (raw.sx - w / 2) * z,
          sy: h / 2 + (raw.sy - h / 2) * z,
          scale: raw.scale,
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

      // --- Connections ---
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
            ctx.strokeStyle = isVal ? 'rgba(78, 119, 84, 0.45)' : 'rgba(168, 96, 99, 0.4)';
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

      // --- Nodes (painter's algorithm: back to front) ---
      const sorted = [...nodes].sort((a, b) => {
        const za = posMap.get(a.id)?.z ?? 0;
        const zb = posMap.get(b.id)?.z ?? 0;
        return za - zb;
      });

      for (const n of sorted) {
        const cur = posMap.get(n.id);
        if (!cur) continue;

        const { sx, sy, scale } = project(n.x, n.y, cur.z);

        // Scale radius by both perspective depth and zoom
        const r = getRadius(cur.weight) * scale * z;
        const depthAlpha = Math.max(0.25, Math.min(1, scale * 1.2));

        // Store zoom-adjusted screen position for accurate hit testing
        screenPos.current.set(n.id, { sx, sy, r });

        const isDimmed = highlightIds.size > 0 && !highlightIds.has(n.id);
        const isActive = highlightIds.has(n.id);
        const alpha = (isDimmed ? 0.12 : 1) * depthAlpha;

        // Outer glow
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
          grad.addColorStop(0, `rgba(168, 96, 99, ${0.14 * depthAlpha})`);
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
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.95, Math.max(0.45, cur.weight * 1.0)) * depthAlpha})`;
            ctx.fillText(n.theme_name, sx, sy);
          } else {
            ctx.textBaseline = 'top';
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.45, cur.weight * depthAlpha)})`;
            ctx.fillText(n.theme_name, sx, sy + r + 4);
          }
        }
      }

      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, [nodes, toPixel, selected, hovered, applyZoom]);

  // --- Scroll to zoom ---
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP;
      setZoomClamped(zoomRef.current * factor);
    },
    [setZoomClamped],
  );

  // --- Drag to rotate ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      isDragging.current = true;
      autoRotPaused.current = true;
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
    autoRotPausedAt.current = Date.now();
    setTimeout(() => {
      autoRotPaused.current = false;
    }, 1500);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey) return;
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

  const handleDoubleClick = useCallback(() => {
    setRotation({ rx: 0, ry: 0 });
    setZoomClamped(1);
  }, [setZoomClamped]);

  const connectedNodes = selected
    ? nodes.filter((n) => selected.node.connections.includes(n.id))
    : [];

  const zoomPct = Math.round(zoom * 100);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <WebGLBackground />

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
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            className="block w-full h-full"
          />
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col items-center gap-1">
        <motion.button
          type="button"
          aria-label="Zoom in"
          onClick={() => setZoomClamped(zoomRef.current * (1 + ZOOM_STEP))}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          disabled={zoom >= ZOOM_MAX}
          className="w-8 h-8 flex items-center justify-center rounded-lg font-body text-sm select-none disabled:opacity-30"
          style={{
            background: 'rgba(253, 250, 246, 0.88)',
            border: '1px solid rgba(44,38,31,0.13)',
            color: 'var(--color-text-primary)',
            boxShadow: '0 1px 4px rgba(44,38,31,0.1)',
          }}
        >
          +
        </motion.button>

        {/* Zoom level badge */}
        <div
          className="px-1.5 py-0.5 rounded font-body text-[9px] tracking-wide tabular-nums select-none"
          style={{
            background: 'rgba(253, 250, 246, 0.82)',
            border: '1px solid rgba(44,38,31,0.1)',
            color: 'var(--color-text-dim)',
          }}
        >
          {zoomPct}%
        </div>

        <motion.button
          type="button"
          aria-label="Zoom out"
          onClick={() => setZoomClamped(zoomRef.current * (1 - ZOOM_STEP))}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          disabled={zoom <= ZOOM_MIN}
          className="w-8 h-8 flex items-center justify-center rounded-lg font-body text-sm select-none disabled:opacity-30"
          style={{
            background: 'rgba(253, 250, 246, 0.88)',
            border: '1px solid rgba(44,38,31,0.13)',
            color: 'var(--color-text-primary)',
            boxShadow: '0 1px 4px rgba(44,38,31,0.1)',
          }}
        >
          −
        </motion.button>

        {/* Reset zoom (only shown when not at 100%) */}
        <AnimatePresence>
          {zoom !== 1 && (
            <motion.button
              key="reset"
              type="button"
              aria-label="Reset zoom"
              onClick={() => setZoomClamped(1)}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.93 }}
              className="w-8 h-8 flex items-center justify-center rounded-lg font-body select-none"
              style={{
                background: 'rgba(253, 250, 246, 0.88)',
                border: '1px solid rgba(44,38,31,0.13)',
                color: 'var(--color-text-dim)',
                boxShadow: '0 1px 4px rgba(44,38,31,0.1)',
                fontSize: 9,
                letterSpacing: '0.04em',
              }}
              title="Reset to 100%"
            >
              ↺
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Hints */}
      {rotation.rx === 0 && rotation.ry === 0 && zoom === 1 && (
        <div className="absolute bottom-4 right-16 z-20 pointer-events-none">
          <div
            className="rounded-md px-2.5 py-1 font-body text-[9px] tracking-wide text-text-dim uppercase"
            style={{
              background: 'rgba(253, 250, 246, 0.88)',
              border: '1px solid rgba(44,38,31,0.12)',
            }}
          >
            Scroll to zoom · Shift+Drag to rotate
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
                    ? 'rgba(78, 119, 84, 0.35)'
                    : hovered.node.category === 'neutral'
                    ? 'rgba(181, 132, 61, 0.35)'
                    : 'rgba(168, 96, 99, 0.35)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <p
                className="font-body text-[10px] tracking-wide uppercase mb-0.5 font-medium"
                style={{
                  color: hovered.node.category === 'value' ? '#4e7754' : hovered.node.category === 'neutral' ? '#b5843d' : '#a86063',
                }}
              >
                {hovered.node.category === 'value' ? 'High Value' : hovered.node.category === 'neutral' ? 'Neutral' : 'Toxic'}
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
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
            className="absolute top-4 right-4 w-72 z-40"
          >
            <div
              className="rounded-xl border overflow-hidden"
              style={{
                background: 'rgba(253, 250, 246, 0.94)',
                borderColor:
                  selected.node.category === 'value'
                    ? 'rgba(78, 119, 84, 0.25)'
                    : 'rgba(168, 96, 99, 0.25)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 12px 40px rgba(44, 38, 31, 0.12)',
              }}
            >
              <div
                className="h-[2px]"
                style={{
                  background:
                    selected.node.category === 'value'
                      ? 'linear-gradient(90deg, transparent, #4e7754, transparent)'
                      : 'linear-gradient(90deg, transparent, #a86063, transparent)',
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
                        ? 'rgba(78, 119, 84, 0.12)'
                        : 'rgba(168, 96, 99, 0.12)',
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background:
                        selected.node.category === 'value' ? '#4e7754' : '#a86063',
                    }}
                  />
                  <span
                    className="font-body text-[9px] tracking-wide uppercase font-medium"
                    style={{
                      color:
                        selected.node.category === 'value' ? '#4e7754' : '#a86063',
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
                            ? 'linear-gradient(90deg, #6b6560, #4e7754)'
                            : 'linear-gradient(90deg, #9e585e, #a86063)',
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
                              background: cn.category === 'value' ? '#4e7754' : '#a86063',
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
