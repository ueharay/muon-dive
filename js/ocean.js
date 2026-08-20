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
    uniform float uCross;     // 0..1 — water-surface breach sweep (S1)
    uniform float uFlow;      // 0..1 — scroll flow stirs the water (S8)
    uniform float uDescent;   // scroll position in viewports — how deep we have sunk
    uniform float uBubble;    // 0..1 — downward scroll drives the bubble column
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

    // Bubbles — three parallax layers of a jittered cell grid, one sphere per
    // occupied cell drawn as a rim plus a highlight. They always rise on their
    // own; scrolling down both speeds them up and seeds more of them, which is
    // what reads as the water going past you.
    float bubbles(vec2 suv, float t, float descent, float drive){
      float acc = 0.0;
      for (int i = 0; i < 3; i++){
        float fi = float(i);
        float scale = 15.0 + fi * 9.0;                       // small cells = small bubbles
        float speed = 0.30 - fi * 0.07;
        vec2 gp = suv * scale;
        gp.y -= t * speed * (0.7 + drive * 0.9);             // they rise on their own
        gp.y -= descent * (0.35 - fi * 0.08);                // and drift as you sink
        gp.x += sin(t * (0.9 + fi * 0.3) + gp.y * 1.3) * 0.05;
        vec2 gi = floor(gp);
        vec2 gf = fract(gp) - 0.5;
        float h = hash(gi + fi * 57.0);
        if (h < 0.975 - drive * 0.05) continue;
        float r = 0.055 + fract(h * 91.7) * 0.05;
        float d = length(gf);
        float body = smoothstep(r, r * 0.35, d) * 0.20;      // faint filled disc
        float rim  = smoothstep(r, r * 0.78, d) * smoothstep(r * 0.55, r * 0.78, d) * 0.5;
        acc += (body + rim) * (0.4 + 0.6 * fract(h * 13.3));
      }
      return acc;
    }

    void main(){
      vec2 uv = gl_FragCoord.xy / uRes.xy;
      float aspect = uRes.x / uRes.y;
      vec2 suv = vec2(uv.x * aspect, uv.y);
      float t = uTime;
      float depth = clamp(uDepth, 0.0, 1.0);

      // ---- the water ------------------------------------------------------
      // Clear water is a clean ramp, not a fog. Every fbm haze laid across the
      // mid-water is what made this read as murk: sea water absorbs ~20% of the
      // light per metre, so distance turns blue while the near field stays
      // transparent. Nothing is added here but colour.
      float y = clamp(uv.y + 0.06, 0.0, 1.0);
      vec3 col = mix(uDeep, uSurface, pow(y, 1.6));
      col = mix(col, uDeep, smoothstep(0.4, 1.0, abs(uv.x - 0.5) * 2.0) * 0.16);
      col = mix(col, uDeep, depth * 0.25);
      float vert = smoothstep(-0.15, 1.15, uv.y);

      // ---- the surface, seen from below ------------------------------------
      // A mirror, not a cloud. Three things make it read as water seen from
      // underneath: the ripples run as thin horizontal bands, those bands
      // compress toward the waterline because you are looking along the plane,
      // and the mirror carries dark facets as well as blown-out highlights —
      // it reflects the dark water below wherever it is not letting sky through.
      float sy = 0.64 + min(uDescent, 8.0) * 0.018;      // the surface recedes as you sink
      float dy = uv.y - sy;
      float surfMask = smoothstep(-0.02, 0.06, dy) * (1.0 - smoothstep(0.1, 0.8, depth));

      float u = 0.5 / (max(dy, 0.0) + 0.05);             // distance along the surface ~ 1/height
      vec2 wuv = vec2(suv.x * (0.6 + u * 0.10), u * 1.15 + t * 0.30);
      float mirror = fbm(wuv * 2.0) + fbm(wuv * 4.3 + 9.0) * 0.55;
      mirror = pow(clamp(mirror * 0.88, 0.0, 1.0), 1.5);

      // the dark side of the mirror first, then the sky punching through
      col = mix(col, col * 0.48, surfMask * (1.0 - mirror) * 0.85);
      col = mix(col, uLight, surfMask * pow(mirror, 2.4) * 0.9);

      // the sun itself, burning through one patch of the surface
      float sunX = (0.32 + uPointer.x * 0.36) * aspect;
      float glare = smoothstep(0.62, 0.0, length((suv - vec2(sunX, 1.02)) * vec2(0.55, 1.5)));
      col += uLight * glare * surfMask * 0.55;

      // ---- shafts of light -------------------------------------------------
      // Distinct beams radiating from the sun, built from angular streaks rather
      // than a raymarched fog — that is the difference between a shaft you can
      // see the edge of and a grey wash.
      vec2 sun = vec2((0.32 + uPointer.x * 0.36) * aspect, 1.22);
      vec2 sd = suv - sun;
      float ang = atan(sd.y, sd.x);
      float sdist = length(sd);
      // few and narrow: three or four shafts you notice, not a curtain
      float beams =
          pow(0.5 + 0.5 * sin(ang * 14.0 + t * 0.16), 13.0)
        + pow(0.5 + 0.5 * sin(ang * 23.0 - t * 0.11 + 1.7), 17.0) * 0.55;
      beams *= smoothstep(1.05, 0.12, sdist);   // they die well before the lower half
      beams *= (1.0 - depth * 0.5);
      col += uLight * beams * 0.24;

      // marine snow: two layers of slow drifting motes
      float snow = 0.0;
      for (int i = 0; i < 2; i++){
        float fi = float(i);
        vec2 gp = suv * (18.0 + fi * 11.0);
        gp.y += t * (0.12 + fi * 0.06);          // motes drift down on their own …
        gp.y -= uDescent * (0.55 + fi * 0.3);    // … but stream upward as you sink past them
        gp.x += sin(t * 0.2 + fi) * 0.3;
        vec2 gi = floor(gp);
        float h = hash(gi + fi * 33.0);
        if (h > 0.972){
          vec2 gf = fract(gp) - 0.5;
          snow += smoothstep(0.16, 0.0, length(gf)) * (0.4 + 0.6 * h);
        }
      }
      col += uLight * snow * 0.20 * (1.0 - depth * 0.3);

      // bubbles — a few at rest, a column of them while you scroll down
      float drive = 0.12 + uBubble * 0.88;
      float bub = bubbles(suv, t, uDescent, drive);
      col += uLight * bub * (0.42 + uBubble * 0.3) * (1.0 - depth * 0.25);

      // S8 — scrolling stirs the ceiling's glitter, where the light actually is
      col += uLight * mirror * uFlow * 0.14 * surfMask;
      col *= (1.0 + uFlow * 0.06);

      // S1 — THRESHOLD CROSSING: a bright refracting band sweeps up the screen
      // as uCross goes 0→1 (the moment you break the surface and go under).
      // Brightest mid-sweep, gone at both ends; a caustic crest rides its edge.
      if (uCross > 0.001) {
        float yb = 1.0 - uCross;                        // travels bottom → top
        float d  = uv.y - yb;
        float line  = smoothstep(0.17, 0.0, abs(d));
        float crest = smoothstep(0.05, 0.0, abs(d));
        float env   = clamp(uCross * (1.0 - uCross) * 4.0, 0.0, 1.0);   // 0→1→0
        float rip   = caustic(suv * 1.4 + vec2(0.0, yb * 3.0), t * 1.7);
        col += uLight   * (line * 0.5 + crest * 0.95 + rip * crest * 0.6) * env;
        col += uSurface * smoothstep(0.0, 0.5, d) * line * 0.22 * env;   // light wash above the crest
      }

      // haze + vignette (kept gentle so edges never darken into dread) + grain
      float vign = smoothstep(1.3, 0.28 - depth * 0.04, length(uv - 0.5));
      col *= mix(0.9, 1.0, vign);
      col += (hash(uv * uRes.xy * 0.5 + t) - 0.5) * 0.016;

      col = col / (col + vec3(0.85));
      col = pow(col, vec3(0.88));
      // Reinhard flattens hue along with the highlights; put the water back
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, 1.28);

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
    // The drawing buffer is opaque (alpha:false), so a canvas we never draw into
    // would composite as flat black over the CSS fallback gradient. Any failure
    // below has to take the canvas out of the page, not just stop rendering.
    const bail = () => { canvas.style.display = 'none'; return NULL_API; };

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
            || canvas.getContext('experimental-webgl');
    if (!gl) return bail();

    const colors = Object.assign({ surface: '#1d6f86', deep: '#03080f', light: '#8fe6df' }, opts.colors || {});

    const prog = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return bail();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)){
      console.warn('[ocean] link error:', gl.getProgramInfoLog(prog));
      return bail();                         // → the CSS gradient shows instead
    }
    gl.useProgram(prog);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    ['uRes','uTime','uDepth','uPointer','uCross','uFlow','uDescent','uBubble','uSurface','uDeep','uLight']
      .forEach(n => U[n] = gl.getUniformLocation(prog, n));
    gl.uniform3fv(U.uSurface, hexToRgb(colors.surface));
    gl.uniform3fv(U.uDeep,    hexToRgb(colors.deep));
    gl.uniform3fv(U.uLight,   hexToRgb(colors.light));

    const state = {
      depth: 0, depthTarget: 0,
      px: 0.5, py: 0.5, pxT: 0.5, pyT: 0.5,
      cross: 0, flow: 0, flowTarget: 0,
      descent: 0, descentTarget: 0, bubble: 0, bubbleTarget: 0,
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
      state.flow += (state.flowTarget - state.flow) * 0.08;
      state.bubble += (state.bubbleTarget - state.bubble) * 0.1;
      state.descent += (state.descentTarget - state.descent) * 0.05;
      gl.uniform1f(U.uTime, state.t);
      gl.uniform1f(U.uDepth, state.depth);
      gl.uniform2f(U.uPointer, state.px, state.py);
      gl.uniform1f(U.uCross, state.cross);
      gl.uniform1f(U.uFlow, state.flow);
      gl.uniform1f(U.uDescent, state.descent);
      gl.uniform1f(U.uBubble, state.bubble);
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
      setCross(v){ state.cross = Math.max(0, Math.min(1, v)); },   // S1 — driven by a scroll-triggered sweep
      setFlow(v){ state.flowTarget = Math.max(0, Math.min(1, v)); }, // S8 — scroll velocity
      setDescent(v){ state.descentTarget = v; },                    // scroll position, in viewports
      setBubble(v){ state.bubbleTarget = Math.max(0, Math.min(1, v)); },
      resume(){ resume(); },
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
