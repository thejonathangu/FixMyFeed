import { useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// WebGL ambient background: gradient mesh + perspective grid + particle field
// ---------------------------------------------------------------------------

// --- Particle program ---
const VERT = `#version 300 es
precision highp float;

in vec2 aPos;
in float aSize;
in vec4 aColor;
in float aPhase;

uniform float uTime;
uniform vec2 uResolution;

out vec4 vColor;
out float vPhase;

void main() {
  float t = uTime * 0.3 + aPhase * 6.2831;
  vec2 drift = vec2(sin(t * 0.7 + aPhase * 3.0), cos(t * 0.5 + aPhase * 5.0)) * 0.03;
  vec2 pos = aPos + drift;

  float breathe = 1.0 + sin(t * 1.5) * 0.15;

  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = aSize * breathe * min(uResolution.x, uResolution.y) * 0.003;

  vColor = aColor;
  vPhase = aPhase;
}`;

const FRAG = `#version 300 es
precision highp float;

in vec4 vColor;
in float vPhase;
uniform float uTime;

out vec4 fragColor;

void main() {
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);

  float alpha = smoothstep(0.5, 0.0, dist);
  alpha *= alpha;

  float pulse = 0.7 + 0.3 * sin(uTime * 2.0 + vPhase * 10.0);

  fragColor = vec4(vColor.rgb, vColor.a * alpha * pulse);
}`;

// --- Gradient mesh ---
const QUAD_VERT = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const QUAD_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uTime;
out vec4 fragColor;

void main() {
  vec2 uv = vUv;

  vec2 c1 = vec2(0.3 + sin(uTime * 0.15) * 0.2, 0.4 + cos(uTime * 0.12) * 0.2);
  vec2 c2 = vec2(0.7 + cos(uTime * 0.18) * 0.15, 0.6 + sin(uTime * 0.1) * 0.25);
  vec2 c3 = vec2(0.5 + sin(uTime * 0.08) * 0.3, 0.2 + cos(uTime * 0.14) * 0.15);

  float d1 = length(uv - c1);
  float d2 = length(uv - c2);
  float d3 = length(uv - c3);

  vec3 col = vec3(0.12, 0.11, 0.09) * smoothstep(0.8, 0.0, d1);
  col += vec3(0.08, 0.09, 0.08) * smoothstep(0.7, 0.0, d2);
  col += vec3(0.10, 0.07, 0.07) * smoothstep(0.6, 0.0, d3);
  col *= 0.12;

  fragColor = vec4(col, 1.0);
}`;

// --- Grid program ---
// Fullscreen quad with perspective-warped grid lines.
// Barrel-distorts the UV so lines curve gently toward edges, reinforcing
// the 3D depth of the neural space beneath the node graph.
const GRID_VERT = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const GRID_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;

out vec4 fragColor;

void main() {
  // Barrel / spherical warp — curves grid lines inward at edges,
  // giving the illusion that the grid lies on a gently convex surface.
  vec2 centered = vUv - 0.5;
  float r2 = dot(centered, centered);
  float warp = 1.0 + r2 * 0.28;
  vec2 warpedUv = centered * warp + 0.5;

  // Convert to pixel space for resolution-independent line width
  vec2 px = warpedUv * uResolution;

  // Minor grid: ~38 px cells
  float minor = 38.0;
  vec2 gMinor = fract(px / minor);
  vec2 dMinor = min(gMinor, 1.0 - gMinor) * minor; // dist in pixels
  float lineMinor = 1.0 - smoothstep(0.0, 0.75, min(dMinor.x, dMinor.y));

  // Major grid: every 4th minor cell = 152 px
  float major = 152.0;
  vec2 gMajor = fract(px / major);
  vec2 dMajor = min(gMajor, 1.0 - gMajor) * major;
  float lineMajor = 1.0 - smoothstep(0.0, 0.85, min(dMajor.x, dMajor.y));

  // Intersection dots: both axes near a major line simultaneously
  float iMajorX = 1.0 - smoothstep(0.0, 1.8, dMajor.x);
  float iMajorY = 1.0 - smoothstep(0.0, 1.8, dMajor.y);
  float intersection = iMajorX * iMajorY;

  // Radial vignette: two-part
  //   — fade near exact center so nodes have visual room
  //   — fade toward outer edges so grid doesn't box the scene
  float dist = length(centered);
  float centerOpen = smoothstep(0.0, 0.22, dist);   // open centre
  float edgeFade   = 1.0 - smoothstep(0.38, 0.52, dist); // fade edges
  float vignette   = centerOpen * edgeFade;

  // Very slow pulse — barely perceptible breathing
  float breath = 0.88 + 0.12 * sin(uTime * 0.28);

  // Warm parchment — echoes the paper.jpg texture tint
  vec3 lineCol = vec3(0.87, 0.83, 0.76);

  float alpha = (lineMinor * 0.055
               + lineMajor * 0.045
               + intersection * 0.06)
               * vignette * breath;

  fragColor = vec4(lineCol, alpha);
}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const vert = createShader(gl, gl.VERTEX_SHADER, vs);
  const frag = createShader(gl, gl.FRAGMENT_SHADER, fs);
  if (!vert || !frag) return null;

  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function WebGLBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    const particleProg = createProgram(gl, VERT, FRAG);
    const quadProg     = createProgram(gl, QUAD_VERT, QUAD_FRAG);
    const gridProg     = createProgram(gl, GRID_VERT, GRID_FRAG);
    if (!particleProg || !quadProg || !gridProg) return;

    // --- Particle data ---
    const PARTICLE_COUNT = 150;
    const particleData = new Float32Array(PARTICLE_COUNT * 8);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const off = i * 8;
      particleData[off]     = Math.random();
      particleData[off + 1] = Math.random();
      particleData[off + 2] = Math.random() * 15 + 3;

      const isValue = Math.random() > 0.4;
      if (isValue) {
        particleData[off + 3] = 0.35 + Math.random() * 0.15;
        particleData[off + 4] = 0.42 + Math.random() * 0.18;
        particleData[off + 5] = 0.36 + Math.random() * 0.12;
      } else {
        particleData[off + 3] = 0.45 + Math.random() * 0.2;
        particleData[off + 4] = 0.35 + Math.random() * 0.12;
        particleData[off + 5] = 0.34 + Math.random() * 0.1;
      }
      particleData[off + 6] = Math.random() * 0.08 + 0.02;
      particleData[off + 7] = Math.random();
    }

    const particleBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuf);
    gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.STATIC_DRAW);

    // Fullscreen quad (shared by gradient mesh + grid)
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    // --- Attribute locations ---
    const pAPos  = gl.getAttribLocation(particleProg, 'aPos');
    const pASize = gl.getAttribLocation(particleProg, 'aSize');
    const pAColor = gl.getAttribLocation(particleProg, 'aColor');
    const pAPhase = gl.getAttribLocation(particleProg, 'aPhase');
    const pUTime  = gl.getUniformLocation(particleProg, 'uTime');
    const pURes   = gl.getUniformLocation(particleProg, 'uResolution');

    const qAPos  = gl.getAttribLocation(quadProg, 'aPos');
    const qUTime = gl.getUniformLocation(quadProg, 'uTime');

    const gAPos  = gl.getAttribLocation(gridProg, 'aPos');
    const gUTime = gl.getUniformLocation(gridProg, 'uTime');
    const gURes  = gl.getUniformLocation(gridProg, 'uResolution');

    // --- VAOs ---
    const particleVAO = gl.createVertexArray();
    gl.bindVertexArray(particleVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuf);
    const stride = 8 * 4;
    gl.enableVertexAttribArray(pAPos);
    gl.vertexAttribPointer(pAPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(pASize);
    gl.vertexAttribPointer(pASize, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(pAColor);
    gl.vertexAttribPointer(pAColor, 4, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(pAPhase);
    gl.vertexAttribPointer(pAPhase, 1, gl.FLOAT, false, stride, 28);
    gl.bindVertexArray(null);

    const quadVAO = gl.createVertexArray();
    gl.bindVertexArray(quadVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(qAPos);
    gl.vertexAttribPointer(qAPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const gridVAO = gl.createVertexArray();
    gl.bindVertexArray(gridVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(gAPos);
    gl.vertexAttribPointer(gAPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // --- Resize ---
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      canvas!.width  = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let animId: number;
    const startTime = performance.now();

    function render() {
      const time = (performance.now() - startTime) / 1000;
      const { width, height } = canvas!;

      gl!.viewport(0, 0, width, height);
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.enable(gl!.BLEND);

      // 1 — Gradient mesh (normal blend, opaque dark background)
      gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);
      gl!.useProgram(quadProg);
      gl!.uniform1f(qUTime, time);
      gl!.bindVertexArray(quadVAO);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

      // 2 — Grid (normal blend on top of dark bg, very low alpha)
      gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);
      gl!.useProgram(gridProg);
      gl!.uniform1f(gUTime, time);
      gl!.uniform2f(gURes, width, height);
      gl!.bindVertexArray(gridVAO);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

      // 3 — Particles (additive blend so they glow over everything)
      gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE);
      gl!.useProgram(particleProg);
      gl!.uniform1f(pUTime, time);
      gl!.uniform2f(pURes, width, height);
      gl!.bindVertexArray(particleVAO);
      gl!.drawArrays(gl!.POINTS, 0, PARTICLE_COUNT);

      gl!.bindVertexArray(null);
      animId = requestAnimationFrame(render);
    }

    render();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
