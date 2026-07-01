/*
 * ocean.js — WebGL underwater light field
 * Full-screen fragment shader: domain-warped caustics, volumetric god-rays,
 * depth-driven colour grade and drifting marine snow. No dependencies (WebGL1).
 *
 * Public API:
 *   const ocean = Ocean.mount(canvas, { colors })
 *   ocean.setDepth(0..1)   // 0 = sunlit surface, 1 = abyss (driven by scroll)
 *   ocean.setPointer(x, y) // normalised 0..1 (light source follows, subtly)
 *   ocean.destroy()
 *
 * Perf: renders at DPR 1.0 (soft, out-of-focus field behind overlays — extra
 * pixels are invisible), caps to ~30fps, pauses on hidden tab, and reallocates
 * the drawing buffer only on real width changes (ignores mobile URL-bar height).
 */
const Ocean = (() => {
  const VERT = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;

    uniform vec2  uRes;
    uniform float uTime;
    uniform float uDepth;     // 0 surface .. 1 abyss
    uniform vec2  uPointer;   // 0..1
    uniform vec3  uSurface;
    uniform vec3  uDeep;
    uniform vec3  uLight;

    float hash(vec2 p){
      p = fract(p * vec2(233.34, 851.73));
      p += dot(p, p + 23.45);
      return fract(p.x * p.y);
    }
    float noise(vec2 p){
      vec2 i = floor(p); vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                 mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
    }
    // 4-octave fbm (was 5 — the 5th octave is imperceptible behind grain)
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 4; i++){ v += a * noise(p); p = m * p; a *= 0.5; }
      return v;
    }

    // caustic network: sharp bright veins (reads as water, not fog)
    float caustic(vec2 uv, float t){
      vec2 p = uv * 5.0;
      float warp = fbm(p * 0.5 + t * 0.05);
      p += vec2(warp, fbm(p + 4.0)) * 0.9;
      float n1 = fbm(p + vec2(t * 0.10, t * 0.06));
      float n2 = fbm(p * 1.7 - vec2(t * 0.08, t * 0.12));
      float c = abs(n1 - n2);
      c = pow(1.0 - c, 8.5);        // tighter ridge → thin, crisp veins
      return c;
    }

    void main(){
      vec2 uv = gl_FragCoord.xy / uRes.xy;
      float aspect = uRes.x / uRes.y;
      vec2 suv = vec2(uv.x * aspect, uv.y);
      float t = uTime;
      float depth = clamp(uDepth, 0.0, 1.0);

      // vertical depth gradient — descend pushes everything toward the abyss
      float vert = smoothstep(-0.15, 1.15, uv.y);
      vec3 col = mix(uDeep, uSurface, vert);
      col = mix(col, uDeep, depth * 0.92);

      // volumetric god rays from an off-screen top light (10-tap raymarch)
      vec2 lightPos = vec2(0.30 + uPointer.x * 0.40, 1.25);
      vec2 dir = suv - vec2(lightPos.x * aspect, lightPos.y);
      float dl = length(dir);
      vec2 stp = dir / 10.0;
      vec2 sp = vec2(lightPos.x * aspect, lightPos.y);
      float rays = 0.0, decay = 1.0;
      for (int i = 0; i < 10; i++){
        sp += stp;
        rays += fbm(sp * 2.2 + vec2(0.0, -t * 0.35)) * decay;
        decay *= 0.86;
      }
      rays = pow(rays / 10.0, 2.2) * 2.6;
      rays *= smoothstep(1.4, 0.1, dl);
      rays *= (1.0 - depth * 0.95);            // rays die as we descend

      // caustics, strongest near surface, gone in the deep
      float caus = caustic(suv + vec2(0.0, -t * 0.02), t);
      caus += caustic(suv * 1.8 + 10.0, t * 1.3) * 0.5;
      caus *= (1.0 - vert * 0.35);
      caus *= (1.0 - depth);

      col += uLight * rays * 0.85;
      col += uLight * caus * 0.40;

      // marine snow: two layers of slow drifting motes
      float snow = 0.0;
      for (int i = 0; i < 2; i++){
        float fi = float(i);
        vec2 gp = suv * (18.0 + fi * 11.0);
        gp.y += t * (0.12 + fi * 0.06);
        gp.x += sin(t * 0.2 + fi) * 0.3;
        vec2 gi = floor(gp);
        float h = hash(gi + fi * 33.0);
        if (h > 0.972){
          vec2 gf = fract(gp) - 0.5;
          snow += smoothstep(0.16, 0.0, length(gf)) * (0.4 + 0.6 * h);
        }
      }
      col += uLight * snow * 0.5 * (1.0 - depth * 0.3);

      // haze + vignette (tightens with depth) + grain
      float vign = smoothstep(1.25, 0.32 - depth * 0.06, length(uv - 0.5));
      col *= mix(0.78, 1.0, vign);
      col += (hash(uv * uRes.xy * 0.5 + t) - 0.5) * 0.035;

      col = col / (col + vec3(0.85));
      col = pow(col, vec3(0.92));

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(gl, type, src){
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
      console.warn('[ocean] shader error:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function hexToRgb(hex){
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  const NULL_API = { supported: false, setDepth(){}, setPointer(){}, setColors(){}, destroy(){} };

  function mount(canvas, opts = {}){
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
            || canvas.getContext('experimental-webgl');
    if (!gl) return NULL_API;

    const colors = Object.assign({ surface: '#1d6f86', deep: '#03080f', light: '#8fe6df' }, opts.colors || {});

    const prog = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return NULL_API;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)){
      console.warn('[ocean] link error:', gl.getProgramInfoLog(prog));
      return NULL_API;                       // → CSS --abyss background shows instead
    }
    gl.useProgram(prog);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    ['uRes','uTime','uDepth','uPointer','uSurface','uDeep','uLight'].forEach(n => U[n] = gl.getUniformLocation(prog, n));
    gl.uniform3fv(U.uSurface, hexToRgb(colors.surface));
    gl.uniform3fv(U.uDeep,    hexToRgb(colors.deep));
    gl.uniform3fv(U.uLight,   hexToRgb(colors.light));

    const state = {
      depth: 0, depthTarget: 0,
      px: 0.5, py: 0.5, pxT: 0.5, pyT: 0.5,
      running: true, t: 0, lastTime: 0, raf: 0, lastW: 0, lastH: 0,
    };

    // render at DPR 1.0 — this is a blurred field behind grain + overlays;
    // extra device pixels cost 2-3x fragments for zero perceptible gain.
    const DPR = 1.0;
    function applySize(){
      const w = Math.max(1, Math.floor(canvas.clientWidth * DPR));
      const h = Math.max(1, Math.floor(canvas.clientHeight * DPR));
      canvas.width = w; canvas.height = h;
      state.lastW = w; state.lastH = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.uRes, w, h);
    }
    applySize();

    // Only reallocate the GL buffer on a real width change (or a big height
    // change) — mobile URL-bar show/hide spams tiny height-only resizes.
    let resizeTimer = 0;
    function onResize(){
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const w = Math.floor(canvas.clientWidth * DPR);
        const h = Math.floor(canvas.clientHeight * DPR);
        if (w === state.lastW && Math.abs(h - state.lastH) < 120) return;
        applySize();
      }, 150);
    }
    window.addEventListener('resize', onResize);

    const FRAME = 1000 / 30;                  // ~30fps is indistinguishable for soft caustics
    function frame(now){
      if (!state.running) return;
      state.raf = requestAnimationFrame(frame);
      if (state.lastTime === 0) state.lastTime = now;
      const dt = now - state.lastTime;
      if (dt < FRAME) return;
      state.lastTime = now;
      state.t += Math.min(dt, 100) / 1000;    // clamp big gaps (post-pause) so phase never snaps

      state.depth += (state.depthTarget - state.depth) * 0.06;
      state.px += (state.pxT - state.px) * 0.05;
      state.py += (state.pyT - state.py) * 0.05;
      gl.uniform1f(U.uTime, state.t);
      gl.uniform1f(U.uDepth, state.depth);
      gl.uniform2f(U.uPointer, state.px, state.py);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    state.raf = requestAnimationFrame(frame);

    function pause(){ state.running = false; cancelAnimationFrame(state.raf); }
    function resume(){
      if (state.running || document.hidden) return;
      state.running = true;
      state.lastTime = 0;                      // reseed dt; state.t persists → continuous phase
      state.raf = requestAnimationFrame(frame);
    }
    const onVis = () => { if (document.hidden) pause(); else resume(); };
    document.addEventListener('visibilitychange', onVis);

    // GPU context loss: stop cleanly (CSS --abyss shows through); restore on regain.
    const onLost = (e) => { e.preventDefault(); pause(); };
    const onRestored = () => { applySize(); resume(); };
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);

    return {
      supported: true,
      setDepth(v){ state.depthTarget = Math.max(0, Math.min(1, v)); },
      setPointer(x, y){ state.pxT = x; state.pyT = y; },
      setColors(c){
        if (c.surface) gl.uniform3fv(U.uSurface, hexToRgb(c.surface));
        if (c.deep)    gl.uniform3fv(U.uDeep,    hexToRgb(c.deep));
        if (c.light)   gl.uniform3fv(U.uLight,   hexToRgb(c.light));
      },
      destroy(){
        pause();
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
      },
    };
  }

  return { mount };
})();
