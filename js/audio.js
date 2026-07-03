/* =========================================================================
   無音 MUON — js/audio.js  (S6 · depth-driven underwater ambience)
   The brand is named "silence" — so let people hear the descent toward it.
   Opt-in only (no autoplay). A nav toggle starts a synthesised soundscape that
   travels with depth:

       surface   →  ざー   a bright water-wash (filtered noise)
       descending →  ゴポゴポ  procedurally-scheduled bubbles (the star)
       deep       →  無音   everything muffles and falls to true silence

   Every bubble is a sine whose pitch rings upward for a few dozen ms — the
   physics of a real bubble — with randomised size, pitch and timing so it
   burbles instead of beeps. No audio files; nothing extra to download.

   main.js drives it each frame via window.MUON_AUDIO.setDepth(0..~0.62).
   ========================================================================= */
(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);

  let ctx = null, master = null;
  let washSrc = null, washLP = null, washGain = null;
  let bubBus = null, bubLP = null;
  let on = false, depth = 0, btn = null, sched = 0, nextBub = 0;

  const MAX_D = 0.6;                 // the deepest section (silence) sits near here
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  // bell curve — bubbles are absent at the surface, peak mid-descent, gone deep
  const bellRand = (t) => Math.exp(-Math.pow((t - 0.5) / 0.3, 2));

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    // ---- wash layer: brown-ish noise → lowpass (the "ざー") ----
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.0; }
    washSrc = ctx.createBufferSource(); washSrc.buffer = buf; washSrc.loop = true;
    washLP = ctx.createBiquadFilter(); washLP.type = 'lowpass'; washLP.frequency.value = 6000; washLP.Q.value = 0.5;
    washGain = ctx.createGain(); washGain.gain.value = 0;
    washSrc.connect(washLP); washLP.connect(washGain);

    // ---- bubble bus: all bubbles run through one lowpass that closes with depth ----
    bubLP = ctx.createBiquadFilter(); bubLP.type = 'lowpass'; bubLP.frequency.value = 1800; bubLP.Q.value = 0.7;
    bubBus = ctx.createGain(); bubBus.gain.value = 1;
    bubBus.connect(bubLP);

    // ---- master: the whole bed approaches silence in the deep ----
    master = ctx.createGain(); master.gain.value = 0;
    washGain.connect(master); bubLP.connect(master); master.connect(ctx.destination);
    washSrc.start();
  }

  // one bubble: a short sine whose pitch rings upward (small bubble = higher/faster)
  function bubble(when) {
    const big = Math.random() < 0.28;
    const f0 = big ? 110 + Math.random() * 150 : 260 + Math.random() * 640;
    const dur = big ? 0.12 + Math.random() * 0.11 : 0.045 + Math.random() * 0.06;
    const peak = (big ? 0.5 : 0.34) * (0.7 + Math.random() * 0.3);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.exponentialRampToValueAtTime(f0 * (big ? 1.9 : 2.7), when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g); g.connect(bubBus);
    osc.start(when); osc.stop(when + dur + 0.03);
  }

  // lookahead scheduler — bubble rate rides the depth bell, silent past the deep
  function pump() {
    if (!on || !ctx) return;
    const t = clamp01(depth / MAX_D);
    const rate = t > 0.9 ? 0 : bellRand(t) * 17 + t * 1.5;   // bubbles / sec
    const ahead = ctx.currentTime + 0.14;
    if (nextBub < ctx.currentTime) nextBub = ctx.currentTime + 0.02;
    while (rate > 0 && nextBub < ahead) {
      bubble(nextBub);
      nextBub += (0.5 + Math.random()) / rate;               // jittered gaps → burble
    }
  }

  function apply(smooth) {
    if (!on || !ctx) return;
    const t = clamp01(depth / MAX_D), now = ctx.currentTime, tc = smooth ? 0.5 : 0.15;
    // ざー: bright wash at the surface, muffles + fades out by mid-descent
    washLP.frequency.setTargetAtTime(6000 * Math.pow(0.22, t), now, 0.2);
    washGain.gain.setTargetAtTime(Math.max(0, 0.05 * (1 - t / 0.5)) * (t > 0.85 ? 0 : 1), now, tc);
    // ゴポゴポ: bubbles muffle as you sink
    bubLP.frequency.setTargetAtTime(2000 * Math.pow(0.32, t), now, 0.2);
    bubBus.gain.setTargetAtTime(t > 0.9 ? 0 : 0.9, now, tc);
    // 無音: the master bed dies to silence in the deep
    master.gain.setTargetAtTime(t > 0.95 ? 0 : 0.6 * (1 - t * 0.25), now, tc);
  }

  function start() {
    try { if (!ctx) build(); } catch (e) { fail(); return; }
    ctx.resume();
    on = true; setBtn(true);
    nextBub = ctx.currentTime + 0.05;
    apply(true);
    clearInterval(sched);
    sched = setInterval(pump, 60);
  }
  function stop() {
    on = false; setBtn(false);
    clearInterval(sched); sched = 0;
    if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
  }
  function fail() { if (btn) { btn.disabled = true; btn.title = 'この環境では音を再生できません'; } }

  function setBtn(state) {
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(state));
    btn.classList.toggle('is-on', state);
    btn.setAttribute('aria-label', state ? '環境音を止める' : '環境音を再生（潜るほど静かに）');
  }

  function injectButton() {
    const actions = $('.nav__actions');
    if (!actions) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav__sound';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', '環境音を再生（潜るほど静かに）');
    btn.innerHTML = '<i></i><i></i><i></i>';
    const lang = $('.nav__lang', actions);
    actions.insertBefore(btn, lang || actions.firstChild);
    btn.addEventListener('click', () => (on ? stop() : start()));
  }

  function init() {
    injectButton();
    window.MUON_AUDIO = {
      setDepth(v) { depth = v; apply(false); },
      isOn: () => on,
      toggle() { on ? stop() : start(); },
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
