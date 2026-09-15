// Fondos animados.
//
// Sustituye a la textura de papel, que sólo sabía ensuciarse. Aquí hay varios
// efectos seleccionables, todos con la misma regla: modulan el color del papel
// en vez de imponer el suyo, así el texto sigue siendo lo que más contrasta en
// la pantalla. La intensidad la decide quien escribe.
//
// Se dibuja directo en el canvas visible, no en uno fuera del documento: al ser
// animado, copiar cada fotograma de un canvas WebGL a uno 2D forzaría una
// lectura de la memoria de video en cada vuelta.
//
// El bucle sólo corre si hay un efecto elegido, la pestaña está visible y el
// sistema no pide movimiento reducido; en ese último caso se dibuja un solo
// fotograma quieto.

import { state, THEMES } from './state.js';

export const BACKDROPS = [
  { key: 'ninguno', label: 'Ninguno' },
  { key: 'cromo', label: 'Cromo' },
  { key: 'holograma', label: 'Holograma' },
  { key: 'burbujas', label: 'Burbujas' },
  { key: 'plasma', label: 'Plasma' }
];

const MODE = { ninguno: 0, cromo: 1, holograma: 2, burbujas: 3, plasma: 4 };

const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

const FS = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uNight;
uniform float uAmount;
uniform int uMode;

const float TAU = 6.2831853;

float hash(vec2 p){
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

// Paleta iridiscente: tres cosenos desfasados, el truco de Iñigo Quílez.
vec3 iris(float t){
  return 0.5 + 0.5 * cos(TAU * (vec3(0.0, 0.33, 0.67) + t));
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes.y;
  float asp = uRes.x / uRes.y;
  float t = uTime;
  vec3 fx = uPaper;

  if (uMode == 1) {
    // CROMO. Bandas duras de acero con un filo iridiscente en cada canto, que
    // es lo que delata al metal pulido, y un brillo especular corriendo.
    vec2 q = uv * 1.5;
    float w = fbm(q + vec2(t * 0.04, -t * 0.025));
    float wave = sin((q.x * 0.7 + q.y * 0.5 + w * 2.8) * TAU);
    float metal = smoothstep(-0.14, 0.14, wave);
    float edge = 1.0 - abs(wave);
    fx = mix(vec3(0.44, 0.48, 0.58), vec3(0.97, 0.98, 1.0), metal);
    fx += iris(w * 0.8 + t * 0.03) * pow(edge, 2.2) * 0.55;
    fx += pow(max(0.0, wave), 22.0) * 0.6;

  } else if (uMode == 2) {
    // HOLOGRAMA. Difracción como la cara grabada de un disco: el arcoíris gira
    // con el ángulo y el radio, arrugado por ruido como papel holográfico.
    vec2 c = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float r = length(c);
    float a = atan(c.y, c.x);
    float crinkle = fbm(uv * 2.6 + t * 0.03);
    float h = a / TAU * 3.0 + r * 1.8 + crinkle * 1.4 + t * 0.04;
    float ring = 0.5 + 0.5 * sin(r * 90.0 - t * 0.7);
    fx = iris(h) * 0.9 + 0.25;
    fx += ring * 0.12;

  } else if (uMode == 3) {
    // BURBUJAS. Metabolas a la deriva con el canto teñido y un punto de luz:
    // el gel translúcido de las primeras interfaces de cristal.
    float field = 0.0;
    float spec = 0.0;
    for (int i = 0; i < 5; i++){
      float fi = float(i);
      vec2 c = vec2(
        0.5 * asp + sin(t * 0.14 + fi * 2.1) * 0.6 * asp,
        0.5 + cos(t * 0.11 + fi * 1.7) * 0.42
      );
      float rad = 0.26 + 0.12 * hash(vec2(fi, 3.0));
      vec2 d = (uv - c) / rad;
      field += exp(-dot(d, d) * 1.6);
      spec = max(spec, exp(-dot(d - vec2(0.0, 0.45), d - vec2(0.0, 0.45)) * 34.0));
    }
    float body = smoothstep(0.22, 0.95, field);
    float rim = smoothstep(0.5, 0.8, field) - smoothstep(0.8, 1.15, field);
    fx = mix(vec3(0.80, 0.86, 0.95), vec3(0.42, 0.72, 0.92), body);
    fx += iris(0.62 + t * 0.02) * rim * 0.8;
    fx += spec * 0.9;

  } else if (uMode == 4) {
    // PLASMA. Suma de senos y paleta que rota: la demo de siempre.
    float v = sin(uv.x * 5.0 + t * 0.4)
            + sin(uv.y * 4.4 + t * 0.31)
            + sin((uv.x + uv.y) * 3.3 + t * 0.23)
            + sin(length(uv - vec2(0.5 * asp, 0.5)) * 7.0 - t * 0.45);
    v *= 0.25;
    fx = iris(v * 0.9 + t * 0.03) * 0.95;
  }

  if (uMode != 0) {
    // LEGIBILIDAD. El efecto pone el matiz; la luminancia se encauza a una
    // banda donde el texto sigue ganando. De día se aclara hacia el blanco
    // (de ahí el iridiscente pastel, que además es el del papel holográfico);
    // de noche se oscurece conservando el matiz, y queda neón sobre negro.
    float l = dot(fx, vec3(0.299, 0.587, 0.114));
    float lo = mix(0.90, 0.60, uAmount);
    float hi = 0.985;
    if (uNight > 0.5) { lo = 0.015; hi = mix(0.05, 0.26, uAmount); }

    float target = clamp(l, lo, hi);
    if (target > l) fx = mix(fx, vec3(1.0), (target - l) / max(1.0 - l, 0.001));
    else fx *= target / max(l, 0.001);

    // Y la mezcla final con el papel: la intensidad decide cuánto se aleja del
    // color de la casa.
    fx = mix(uPaper, fx, clamp(uAmount, 0.0, 1.0));
  }

  gl_FragColor = vec4(clamp(fx, 0.0, 1.0), 1.0);
}
`;

let canvas = null;
let gl = null;
let program = null;
const loc = {};
let raf = null;
let start = 0;
let last = 0;

const FRAME = 1000 / 30; // treinta cuadros bastan y cuestan la mitad
const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function hexRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  ];
}

export function initBackdrop(el) {
  canvas = el;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false }) ||
         canvas.getContext('experimental-webgl');
  } catch {
    gl = null;
  }
  if (!gl) return false;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };

  const vs = compile(gl.VERTEX_SHADER, VS);
  const fs = vs && compile(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) {
    gl = null;
    return false;
  }

  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl = null;
    return false;
  }
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);

  for (const name of ['uRes', 'uTime', 'uPaper', 'uInk', 'uNight', 'uAmount', 'uMode']) {
    loc[name] = gl.getUniformLocation(program, name);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else run();
  });

  return true;
}

function frame(time) {
  const mode = MODE[state.backdrop] || 0;
  if (!gl || !mode) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(window.innerWidth * dpr));
  const h = Math.max(1, Math.round(window.innerHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const t = THEMES[state.theme];
  gl.viewport(0, 0, w, h);
  gl.useProgram(program);
  gl.uniform2f(loc.uRes, w, h);
  gl.uniform1f(loc.uTime, (time - start) / 1000);
  gl.uniform3fv(loc.uPaper, hexRgb(t.paper));
  gl.uniform3fv(loc.uInk, hexRgb(t.ink));
  gl.uniform1f(loc.uNight, state.theme === 1 ? 1 : 0);
  gl.uniform1f(loc.uAmount, state.backdropAmount ?? 0.5);
  gl.uniform1i(loc.uMode, mode);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function loop(time) {
  raf = requestAnimationFrame(loop);
  if (time - last < FRAME) return;
  last = time;
  frame(time);
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
}

/** Aplica el estado actual: enciende, apaga o redibuja. */
export function run() {
  const mode = MODE[state.backdrop] || 0;
  if (canvas) canvas.hidden = !mode || !gl;
  if (!gl || !mode) return stop();

  if (!start) start = performance.now();

  if (still() || document.hidden) {
    stop();
    frame(performance.now());
    return;
  }
  if (!raf) raf = requestAnimationFrame(loop);
}
