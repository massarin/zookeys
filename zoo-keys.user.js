// ==UserScript==
// @name         Zoo Keys — keyboard shortcuts for Zooniverse classification
// @namespace    https://www.zooniverse.org/
// @version      1.1.0
// @description  Classify with single keypresses instead of clicking. Press ? for help.
// @author       Natalie Hogg
// @homepageURL  https://github.com/nataliehogg/zoo-keys
// @supportURL   https://github.com/nataliehogg/zoo-keys/issues
// @downloadURL  https://raw.githubusercontent.com/nataliehogg/zoo-keys/main/zoo-keys.user.js
// @updateURL    https://raw.githubusercontent.com/nataliehogg/zoo-keys/main/zoo-keys.user.js
// @match        https://www.zooniverse.org/*
// @match        https://*.zooniverse.org/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* eslint-disable no-console */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG — edit this block to match your project's answer buttons.
  //
  //   id       stable name for this binding; keys remapped in the panel are
  //            stored against it, so don't rename an id you've already used
  //   key      the default keyboard key (lowercase, single character)
  //   label    what shows in the on-screen help
  //   match    regexes tried in order against each button's visible text;
  //            the first button that matches wins
  // ---------------------------------------------------------------------------
  const CONFIG = {
    // Click the answer AND then the Done/Next button, so one keypress = one
    // finished classification. Toggle at runtime with the ` key.
    autoAdvance: true,

    // Milliseconds to wait after choosing an answer before pressing Done.
    // Increase if the interface is slow and Done gets missed.
    advanceDelay: 150,

    bindings: [
      { id: 'a', key: 'a', label: 'A',          match: [/^a$/i, /^a[\s.:)\-–—]/i, /\ba\b/i] },
      { id: 'b', key: 'b', label: 'B',          match: [/^b$/i, /^b[\s.:)\-–—]/i, /\bb\b/i] },
      { id: 'c', key: 'c', label: 'C',          match: [/^c$/i, /^c[\s.:)\-–—]/i, /\bc\b/i] },
      { id: 'x', key: 'x', label: 'X',          match: [/^x$/i, /^x[\s.:)\-–—]/i, /\bx\b/i] },
      { id: 'o', key: 'o', label: 'Off-centre', match: [/off[\s-]?cent/i, /^o$/i, /^o[\s.:)\-–—]/i] },
    ],

    // Keys that just press Done/Next without choosing anything.
    doneKeys: [' ', 'Enter'],

    // Text of the submit button, most-preferred first. "Done" is tried before
    // "Done & Talk" so you don't get dumped into the Talk board.
    doneMatch: [/^done$/i, /^next$/i, /^submit$/i, /^continue$/i, /^done\s*(&|and)\s*talk$/i],

    // Buttons that are never answers, however their text matches.
    exclude: /^(done|next|back|submit|continue|talk|help|about|home|sign in|sign out|log in|register|menu|close|skip|collect|favourite|favorite|subject info|metadata|zoom|pan|rotate|invert|reset|annotate|fullscreen|settings|share|report|hide|show|previous|start|classify|profile|search|notifications|language|donate)\b/i,

    showHudOnLoad: true,
  };

  // ---------------------------------------------------------------------------
  // Internals — you shouldn't need to touch anything below here.
  // ---------------------------------------------------------------------------

  const STORE_KEY = 'zooKeys.settings.v1';
  const state = Object.assign(
    // keys: { bindingId: key } overriding CONFIG, set from the panel's edit mode.
    { autoAdvance: CONFIG.autoAdvance, hudVisible: CONFIG.showHudOnLoad, keys: {} },
    readStore()
  );
  if (!state.keys || typeof state.keys !== 'object') state.keys = {};

  // Keys the panel refuses to bind, because they already do something else.
  const RESERVED = new Set(['`', 'h', '?', '/', 'Escape', ...CONFIG.doneKeys]);

  // The live bindings: CONFIG with any remapped keys applied.
  function bindings() {
    return CONFIG.bindings.map((b) => Object.assign({}, b, { key: state.keys[b.id] || b.key }));
  }

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function writeStore() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          autoAdvance: state.autoAdvance,
          hudVisible: state.hudVisible,
          keys: state.keys,
        })
      );
    } catch (e) {
      /* private browsing, etc. — not fatal */
    }
  }

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  }

  function labelText(el) {
    // Prefer the accessible name; fall back to visible text, then image alt.
    const aria = el.getAttribute('aria-label');
    if (aria) return norm(aria);
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ref = document.getElementById(labelledBy);
      if (ref) return norm(ref.textContent);
    }
    const text = norm(el.textContent);
    if (text) return text;
    const img = el.querySelector('img[alt]');
    if (img) return norm(img.getAttribute('alt'));
    const value = el.getAttribute('value');
    return value ? norm(value) : '';
  }

  // Candidate clickables in the classification area, excluding site chrome.
  function candidates() {
    const nodes = document.querySelectorAll(
      'button, [role="button"], [role="radio"], [role="checkbox"], label, a[role="button"]'
    );
    const out = [];
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      if (el.closest('header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"]')) {
        continue;
      }
      out.push(el);
    }
    return out;
  }

  function findByPatterns(patterns, { allowExcluded = false } = {}) {
    const items = candidates().map((el) => ({ el, text: labelText(el) })).filter((i) => i.text);
    for (const pattern of patterns) {
      const hits = items.filter(
        (i) => pattern.test(i.text) && (allowExcluded || !CONFIG.exclude.test(i.text))
      );
      if (hits.length) {
        // Shortest label is the most specific match ("A" beats "A galaxy also…").
        hits.sort((a, b) => a.text.length - b.text.length);
        return hits[0];
      }
    }
    return null;
  }

  function click(el) {
    el.focus({ preventScroll: true });
    el.click();
  }

  function pressDone() {
    const hit = findByPatterns(CONFIG.doneMatch, { allowExcluded: true });
    if (hit) {
      click(hit.el);
      return hit.text;
    }
    return null;
  }

  function choose(binding) {
    const hit = findByPatterns(binding.match);
    if (!hit) {
      flash(`no button matching “${binding.label}”`, true);
      return;
    }
    click(hit.el);

    if (!state.autoAdvance) {
      flash(`${binding.label} → ${hit.text}`);
      return;
    }
    setTimeout(() => {
      const done = pressDone();
      flash(done ? `${binding.label} → ${hit.text} → ${done}` : `${binding.label} → ${hit.text} (no Done found)`, !done);
    }, CONFIG.advanceDelay);
  }

  // --- HUD ------------------------------------------------------------------

  let hud, hudFlash;
  let editing = false; // panel is in rebind mode
  let armed = null;    // id of the binding waiting for its new key

  function buildHud() {
    hud = document.createElement('div');
    hud.id = 'zoo-keys-hud';
    hud.innerHTML = `
      <style>
        #zoo-keys-hud {
          position: fixed; right: 12px; bottom: 12px; z-index: 2147483647;
          font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          background: rgba(18,18,22,.92); color: #f0f0f2; padding: 10px 12px;
          border: 1px solid rgba(255,255,255,.18); border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,.4); max-width: 260px;
          pointer-events: none; user-select: none;
        }
        #zoo-keys-hud b { color: #ffd166; font-weight: 600; }
        #zoo-keys-hud .zk-row { display: flex; gap: 8px; justify-content: space-between; }
        #zoo-keys-hud .zk-sep { border-top: 1px solid rgba(255,255,255,.15); margin: 6px 0; }
        #zoo-keys-hud .zk-dim { color: #9aa0a6; }
        #zoo-keys-hud .zk-flash { color: #8ce99a; min-height: 1.5em; word-break: break-word; }
        #zoo-keys-hud .zk-flash.zk-warn { color: #ff8787; }
        /* Only the controls take clicks; the rest of the panel stays see-through
           so it never swallows a click meant for the page underneath. */
        #zoo-keys-hud button {
          pointer-events: auto; cursor: pointer; font: inherit;
          background: rgba(255,255,255,.08); color: #f0f0f2;
          border: 1px solid rgba(255,255,255,.22); border-radius: 4px;
          padding: 0 6px; min-width: 24px;
        }
        #zoo-keys-hud button:hover { background: rgba(255,255,255,.18); }
        #zoo-keys-hud button.zk-arm { background: #ffd166; color: #16161a; border-color: #ffd166; }
        #zoo-keys-hud .zk-wide { width: 100%; margin-top: 4px; }
      </style>
      <div class="zk-body"></div>
    `;
    document.body.appendChild(hud);

    hud.addEventListener('click', (event) => {
      const el = event.target.closest('button');
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();

      let msg = '';
      if (el.hasAttribute('data-zk-edit')) {
        editing = !editing;
        armed = null;
      } else if (el.hasAttribute('data-zk-reset')) {
        state.keys = {};
        armed = null;
        writeStore();
        msg = 'keys reset to defaults';
      } else if (el.hasAttribute('data-zk-bind')) {
        const id = el.getAttribute('data-zk-bind');
        armed = armed === id ? null : id;
      }
      renderHud(); // rebuilds the flash line, so flash after it
      if (msg) flash(msg);
    });

    renderHud();
  }

  function renderHud() {
    if (!hud) return;
    hud.style.display = state.hudVisible ? 'block' : 'none';

    const rows = bindings()
      .map((b) =>
        editing
          ? `<div class="zk-row"><button data-zk-bind="${escapeHtml(b.id)}"
               class="${armed === b.id ? 'zk-arm' : ''}">${escapeHtml(keyName(b.key))}</button>
             <span>${escapeHtml(b.label)}</span></div>`
          : `<div class="zk-row"><b>${escapeHtml(keyName(b.key))}</b><span>${escapeHtml(b.label)}</span></div>`
      )
      .join('');

    const footer = editing
      ? `<div class="zk-row"><span class="zk-dim">${
           armed ? 'press a key (Esc cancels)' : 'click a key to rebind'
         }</span></div>
         <button class="zk-wide" data-zk-reset>reset to defaults</button>
         <button class="zk-wide" data-zk-edit>done editing</button>`
      : `<div class="zk-row"><span class="zk-dim">auto-advance (\`)</span><span>${
           state.autoAdvance ? 'on' : 'off'
         }</span></div>
         <div class="zk-row"><span class="zk-dim">hide (h)</span><span></span></div>
         <button class="zk-wide" data-zk-edit>edit keys</button>`;

    hud.querySelector('.zk-body').innerHTML = `
      <div class="zk-row"><b>Zoo Keys</b><span class="zk-dim">? = help</span></div>
      <div class="zk-sep"></div>
      ${rows}
      <div class="zk-row"><b>space</b><span>Done / Next</span></div>
      <div class="zk-sep"></div>
      ${footer}
      <div class="zk-sep"></div>
      <div class="zk-flash"></div>
    `;
    hudFlash = hud.querySelector('.zk-flash');
  }

  // Printable keys show as themselves; the odd ones get a name.
  function keyName(key) {
    if (key === ' ') return 'space';
    if (key.length === 1) return key.toUpperCase();
    return key;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  let flashTimer;
  function flash(msg, warn) {
    if (!hudFlash) return;
    hudFlash.textContent = msg;
    hudFlash.classList.toggle('zk-warn', !!warn);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      if (hudFlash) hudFlash.textContent = '';
    }, 2000);
  }

  // --- key handling ---------------------------------------------------------

  function isTyping(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;

      const key = event.key;

      // Rebinding: swallow everything so a stray press can't classify.
      if (armed) {
        event.preventDefault();
        event.stopPropagation();
        if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(key)) return;

        const id = armed;
        armed = null;

        if (key === 'Escape') {
          renderHud();
          flash('rebind cancelled');
          return;
        }
        const next = key.length === 1 ? key.toLowerCase() : key;
        if (RESERVED.has(next) || RESERVED.has(key)) {
          renderHud();
          flash(`${keyName(next)} is reserved`, true);
          return;
        }
        const clash = bindings().find((b) => b.id !== id && b.key === next);
        if (clash) {
          renderHud();
          flash(`${keyName(next)} is already ${clash.label}`, true);
          return;
        }
        const def = CONFIG.bindings.find((b) => b.id === id);
        if (next === def.key) delete state.keys[id];
        else state.keys[id] = next;
        writeStore();
        renderHud();
        flash(`${def.label} → ${keyName(next)}`);
        return;
      }

      if (key === '?' || (key === '/' && event.shiftKey)) {
        state.hudVisible = !state.hudVisible;
        writeStore();
        renderHud();
        event.preventDefault();
        return;
      }

      if (key === 'h' && !bindings().some((b) => b.key === 'h')) {
        state.hudVisible = !state.hudVisible;
        writeStore();
        renderHud();
        event.preventDefault();
        return;
      }

      if (key === '`') {
        state.autoAdvance = !state.autoAdvance;
        writeStore();
        renderHud();
        flash(`auto-advance ${state.autoAdvance ? 'on' : 'off'}`);
        event.preventDefault();
        return;
      }

      if (CONFIG.doneKeys.includes(key)) {
        const done = pressDone();
        if (done) {
          flash(`→ ${done}`);
          event.preventDefault();
        }
        return;
      }

      const binding = bindings().find((b) => b.key === (key.length === 1 ? key.toLowerCase() : key));
      if (binding) {
        event.preventDefault();
        choose(binding);
      }
    },
    true // capture, so the page can't swallow the keypress first
  );

  if (document.body) buildHud();
  else document.addEventListener('DOMContentLoaded', buildHud);
})();
