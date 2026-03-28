import { useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// WebGL ambient particle field with bloom-like glow and gradient mesh
// ---------------------------------------------------------------------------

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

  // Gentle breathing
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

  // Soft radial falloff — creates glow
  float alpha = smoothstep(0.5, 0.0, dist);
  alpha *= alpha; // extra softness

  // Pulse
  float pulse = 0.7 + 0.3 * sin(uTime * 2.0 + vPhase * 10.0);

  fragColor = vec4(vColor.rgb, vColor.a * alpha * pulse);
}`;

// Gradient mesh shader for background atmosphere
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
  // Animated gradient mesh
  vec2 uv = vUv;

  // Moving color centers
  vec2 c1 = vec2(0.3 + sin(uTime * 0.15) * 0.2, 0.4 + cos(uTime * 0.12) * 0.2);
  vec2 c2 = vec2(0.7 + cos(uTime * 0.18) * 0.15, 0.6 + sin(uTime * 0.1) * 0.25);
  vec2 c3 = vec2(0.5 + sin(uTime * 0.08) * 0.3, 0.2 + cos(uTime * 0.14) * 0.15);

  float d1 = length(uv - c1);
  float d2 = length(uv - c2);
  float d3 = length(uv - c3);

  // Teal glow
  vec3 col = vec3(0.0, 0.15, 0.13) * smoothstep(0.8, 0.0, d1);
  // Blue glow
  col += vec3(0.04, 0.08, 0.2) * smoothstep(0.7, 0.0, d2);
  // Red dim glow
  col += vec3(0.12, 0.02, 0.02) * smoothstep(0.6, 0.0, d3);

  // Overall intensity — very subtle
  col *= 0.35;

  fragColor = vec4(col, 1.0);
}`;

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

export default function WebGLBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    // --- Particle program ---
    const particleProg = createProgram(gl, VERT, FRAG);
    // --- Gradient mesh program ---
    const quadProg = createProgram(gl, QUAD_VERT, QUAD_FRAG);
    if (!particleProg || !quadProg) return;

    // Particle data
    const PARTICLE_COUNT = 150;
    const particleData = new Float32Array(PARTICLE_COUNT * 8); // x, y, size, r, g, b, a, phase

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const off = i * 8;
      particleData[off] = Math.random();     // x
      particleData[off + 1] = Math.random(); // y
      particleData[off + 2] = Math.random() * 15 + 3; // size

      const isValue = Math.random() > 0.35;
      if (isValue) {
        particleData[off + 3] = 0;                              // r
        particleData[off + 4] = 0.6 + Math.random() * 0.4;     // g
        particleData[off + 5] = 0.5 + Math.random() * 0.33;    // b
      } else {
        particleData[off + 3] = 0.3 + Math.random() * 0.3;     // r
        particleData[off + 4] = 0.05;                           // g
        particleData[off + 5] = 0.05;                           // b
      }
      particleData[off + 6] = Math.random() * 0.15 + 0.03;  // alpha
      particleData[off + 7] = Math.random();                  // phase
    }

    const particleBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuf);
    gl.bufferData(gl.ARRAY_BUFFER, particleData, gl.STATIC_DRAW);

    // Fullscreen quad for gradient mesh
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    // Locations — particles
    const pAPos = gl.getAttribLocation(particleProg, 'aPos');
    const pASize = gl.getAttribLocation(particleProg, 'aSize');
    const pAColor = gl.getAttribLocation(particleProg, 'aColor');
    const pAPhase = gl.getAttribLocation(particleProg, 'aPhase');
    const pUTime = gl.getUniformLocation(particleProg, 'uTime');
    const pURes = gl.getUniformLocation(particleProg, 'uResolution');

    // Locations — quad
    const qAPos = gl.getAttribLocation(quadProg, 'aPos');
    const qUTime = gl.getUniformLocation(quadProg, 'uTime');

    // VAOs
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

    // Resize
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      canvas!.width = Math.round(w * dpr);
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

      // Enable blending
      gl!.enable(gl!.BLEND);
      gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE); // additive blending

      // Draw gradient mesh
      gl!.useProgram(quadProg);
      gl!.uniform1f(qUTime, time);
      gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA); // normal blend for bg
      gl!.bindVertexArray(quadVAO);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

      // Draw particles with additive blending
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
