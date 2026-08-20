/* =========================================================================
   ZEN DIVE Manila — chat widget
   Talks to /api/chat (Vercel Serverless Function, same origin as the site —
   no CORS setup needed) which holds the Gemini API key server-side and
   answers from a system prompt containing the course/price/schedule copy.
   No RAG, no vector DB — the site's own content is small enough to hand the
   model whole. See api/README.md for the backend code and deploy steps.
   ========================================================================= */
(() => {
  'use strict';

  const ENDPOINT = '/api/chat';

  const $ = (s, c = document) => c.querySelector(s);

  function init() {
    const widget  = $('#chatWidget');
    const toggle  = $('#chatToggle');
    const panel   = $('#chatPanel');
    const body    = $('#chatBody');
    const form    = $('#chatForm');
    const input   = $('#chatInput');
    const send    = form && form.querySelector('.chatw__send');
    if (!widget || !toggle || !panel || !body || !form || !input) return;

    let open = false;
    let busy = false;
    const history = []; // [{role:'user'|'model', text}] — sent back each turn for context

    function setOpen(next) {
      open = next;
      widget.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      panel.setAttribute('aria-hidden', String(!open));
      if (open) {
        requestAnimationFrame(() => input.focus({ preventScroll: true }));
      }
    }

    toggle.addEventListener('click', () => setOpen(!open));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) { setOpen(false); toggle.focus(); }
    });

    document.addEventListener('click', (e) => {
      if (open && !widget.contains(e.target)) setOpen(false);
    });

    function addMessage(text, role) {
      const el = document.createElement('div');
      el.className = `chatw__msg chatw__msg--${role}`;
      el.textContent = text;
      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
      return el;
    }

    function addPending() {
      const el = document.createElement('div');
      el.className = 'chatw__msg chatw__msg--pending';
      el.innerHTML = '<i></i><i></i><i></i>';
      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
      return el;
    }

    async function sendMessage(text) {
      if (busy) return;
      busy = true;
      send.disabled = true;

      addMessage(text, 'user');
      history.push({ role: 'user', text });
      input.value = '';

      const pending = addPending();

      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: text, history: history.slice(-10) }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        const reply = (data && data.reply) ? data.reply.trim() : '';
        pending.remove();
        if (reply) {
          addMessage(reply, 'bot');
          history.push({ role: 'model', text: reply });
        } else {
          addMessage('うまく回答できませんでした。LINEでも相談できます。', 'error');
        }
      } catch (err) {
        pending.remove();
        addMessage('接続できませんでした。少し時間をおいて、もう一度お試しください。', 'error');
        console.error('[chat] request failed:', err);
      } finally {
        busy = false;
        send.disabled = false;
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) sendMessage(text);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
