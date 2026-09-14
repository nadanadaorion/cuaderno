// Textura de papel.
//
// Un shader de fragmento dibuja grano, fibra, nubes de espesor, manchas de
// borde deformado y motas sueltas. El resultado es estático: se genera una vez
// por tema y tamaño de ventana. Para no dejar una capa WebGL viva
// compositándose bajo el texto, se pinta en un canvas fuera del documento y su
// resultado se copia al canvas 2D visible.

import { state, THEMES } from './state.js';

const SEED = 7.31;

const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

const FS = `
precision highp float;
uniform vec2 uRes;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uNight;
uniform float uSeed;

// Hash de Dave Hoskins: se mantiene bien distribuido con coordenadas grandes,
// donde el clásico fract(sin(dot(...))) se degrada y apelmaza las motas en una
// esquina de la pantalla.
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

// Manchas: discos de borde deformado por ruido, repartidos con hash.
float stains(vec2 uv, float asp){
  float acc = 0.0;
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    vec2 c = vec2(hash(vec2(fi, uSeed)) * asp, hash(vec2(fi + 13.0, uSeed + 1.7)));
    float r = 0.045 + 0.11 * hash(vec2(fi + 31.0, uSeed));
    float warp = fbm(uv * 7.0 + fi * 9.0) - 0.5;
    float d = length(uv - c) + warp * 0.075;
    acc += (1.0 - smoothstep(r * 0.55, r, d)) * (0.35 + 0.65 * hash(vec2(fi + 57.0, uSeed)));
  }
  return acc;
}

// Motas: partículas mínimas, en dos escalas, muy espaciadas.
float specks(vec2 uv){
  float s = 0.0;
  s += step(0.99977, hash(floor(uv * 340.0) + uSeed));
  s += step(0.99986, hash(floor(uv * 160.0 + 17.0) + uSeed + 91.0)) * 1.6;
  return s;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes.y;
  float asp = uRes.x / uRes.y;
  vec2 cuv = gl_FragCoord.xy / uRes;

  float grain = hash(gl_FragCoord.xy + uSeed) - 0.5;
  // Dos vetas cruzadas: una sola estirada en x leía como rayado vertical.
  float fiberA = fbm(vec2(uv.x * 95.0, uv.y * 26.0)) - 0.5;
  float fiberB = fbm(vec2(uv.x * 22.0, uv.y * 110.0)) - 0.5;
  float cloud = fbm(uv * 2.6 + uSeed) - 0.5;
  float coarse = fbm(uv * 9.0 + 4.0) - 0.5;
  float st = stains(uv, asp);
  float sp = specks(uv);

  vec2 e = abs(cuv - 0.5) * 2.0;
  float vig = pow(max(e.x, e.y), 3.4);

  float shade = 0.0;
  shade -= grain * 0.045;
  shade -= fiberA * 0.028;
  shade -= fiberB * 0.022;
  shade -= cloud * 0.075;
  shade -= coarse * 0.032;
  shade -= min(st, 1.5) * 0.07;
  shade -= sp * 0.19;
  shade -= vig * 0.075;

  vec3 day = uPaper * (1.0 + shade);
  // En negro, multiplicar no hace nada: la mancha se suma en tinta.
  vec3 night = uPaper + max(-shade, 0.0) * uInk * 0.62;
  vec3 col = mix(day, night, uNight);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

let canvas = null;
let ctx2d = null;
let glCanvas = null;
let gl = null;
let program = null;
const loc = {};

function hexRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  ];
}

export function initPaper(el) {
  canvas = el;
  try {
    ctx2d = canvas.getContext('2d');
    glCanvas = document.createElement('canvas');
    gl =
      glCanvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true }) ||
      glCanvas.getContext('experimental-webgl');
  } catch {
    gl = null;
  }
  if (!gl || !ctx2d) {
    gl = null;
    return false;
  }

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

  for (const name of ['uRes', 'uPaper', 'uInk', 'uNight', 'uSeed']) {
    loc[name] = gl.getUniformLocation(program, name);
  }
  return true;
}

export function drawPaper() {
  const on = state.texture !== false;
  if (canvas) canvas.hidden = !on;
  if (!on || !gl) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(window.innerWidth * dpr));
  const h = Math.max(1, Math.round(window.innerHeight * dpr));

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    glCanvas.width = w;
    glCanvas.height = h;
  }

  const t = THEMES[state.theme];
  gl.viewport(0, 0, w, h);
  gl.useProgram(program);
  gl.uniform2f(loc.uRes, w, h);
  gl.uniform3fv(loc.uPaper, hexRgb(t.paper));
  gl.uniform3fv(loc.uInk, hexRgb(t.ink));
  gl.uniform1f(loc.uNight, state.theme === 1 ? 1 : 0);
  gl.uniform1f(loc.uSeed, SEED);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  ctx2d.clearRect(0, 0, w, h);
  ctx2d.drawImage(glCanvas, 0, 0);
}
