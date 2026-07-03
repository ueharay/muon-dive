/* =========================================================================
   無音 MUON — js/audio.js  (S6 · depth-driven underwater ambience)
   The brand is named "silence" — so let people hear it. Opt-in only (no
   autoplay): a nav toggle starts a generated water ambience that muffles as
   you descend (a lowpass sweeps shut with depth) and falls to true silence at
   the SILENCE beat. No audio files — everything is synthesised from noise, so
   there is nothing extra to download.

   main.js drives it every frame via window.MUON_AUDIO.setDepth(0..~0.62).
   ========================================================================= */
(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);

  let ctx = null, master = null, lp = null, on = false, depth = 0, btn = null;
  const MAX_D = 0.6;          // the deepest section (silence) sits near here
  const F_SURF = 5200, F_DEEP = 150;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    // brown-ish noise loop = the body of the water
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;

    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = F_SURF; lp.Q.value = 0.6;

    // a slow swell so the ambience breathes rather than hisses
    const swell = ctx.createGain(); swell.gain.value = 1;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain); lfoGain.connect(swell.gain);

    // a soft low "pressure" tone that only surfaces in the deep
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 58;
    const subGain = ctx.createGain(); subGain.gain.value = 0;

    master = ctx.createGain(); master.gain.value = 0;

    noise.connect(lp); lp.connect(swell); swell.connect(master);
    sub.connect(subGain); subGain.connect(master);
    master.connect(ctx.destination);
    noise.start(); lfo.start(); sub.start();

    build.subGain = subGain;
  }

  function apply(smooth) {
    if (!on || !ctx) return;
    const t = Math.min(depth / MAX_D, 1);
    const freq = F_SURF * Math.pow(F_DEEP / F_SURF, t);
    const now = ctx.currentTime, tc = smooth ? 0.5 : 0.12;
    lp.frequency.setTargetAtTime(freq, now, 0.12);
    // fade the whole bed toward silence past ~90% depth (the SILENCE beat)
    const vol = t > 0.9 ? 0.0 : 0.06 * (1 - t * 0.5);
    master.gain.setTargetAtTime(vol, now, tc);
    if (build.subGain) build.subGain.gain.setTargetAtTime(t > 0.9 ? 0 : 0.05 * t, now, 0.3);
  }

  function start() {
    try { if (!ctx) build(); } catch (e) { fail(); return; }
    ctx.resume();
    on = true;
    setBtn(true);
    apply(true);
  }
  function stop() {
    on = false;
    setBtn(false);
    if (master && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
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
    // three bars that animate when on = "sound"; flat when off = "silence"
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
