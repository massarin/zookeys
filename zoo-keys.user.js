// ==UserScript==
// @name         Zoo Keys — keyboard shortcuts for Zooniverse classification
// @namespace    https://www.zooniverse.org/
// @version      1.0.0
// @description  Classify with single keypresses instead of clicking. Press ? for help.
// @author       Natalie Hogg
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
  //   key      the keyboard key to press (lowercase, single character)
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
      { key: 'a', label: 'A',          match: [/^a$/i, /^a[\s.:)\-–—]/i, /\ba\b/i] },
      { key: 'b', label: 'B',          match: [/^b$/i, /^b[\s.:)\-–—]/i, /\bb\b/i] },
      { key: 'c', label: 'C',          match: [/^c$/i, /^c[\s.:)\-–—]/i, /\bc\b/i] },
      { key: 'x', label: 'X',          match: [/^x$/i, /^x[\s.:)\-–—]/i, /\bx\b/i] },
      { key: 'o', label: 'Off-centre', match: [/off[\s-]?cent/i, /^o$/i, /^o[\s.:)\-–—]/i] },
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
    { autoAdvance: CONFIG.autoAdvance, hudVisible: CONFIG.showHudOnLoad },
    readStore()
  );

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
        JSON.stringify({ autoAdvance: state.autoAdvance, hudVisible: state.hudVisible })
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
      </style>
      <div class="zk-body"></div>
    `;
    document.body.appendChild(hud);
    renderHud();
  }

  function renderHud() {
    if (!hud) return;
    hud.style.display = state.hudVisible ? 'block' : 'none';
    const rows = CONFIG.bindings
      .map((b) => `<div class="zk-row"><b>${b.key.toUpperCase()}</b><span>${escapeHtml(b.label)}</span></div>`)
      .join('');
    hud.querySelector('.zk-body').innerHTML = `
      <div class="zk-row"><b>Zoo Keys</b><span class="zk-dim">? = help</span></div>
      <div class="zk-sep"></div>
      ${rows}
      <div class="zk-row"><b>space</b><span>Done / Next</span></div>
      <div class="zk-sep"></div>
      <div class="zk-row"><span class="zk-dim">auto-advance (\`)</span><span>${state.autoAdvance ? 'on' : 'off'}</span></div>
      <div class="zk-row"><span class="zk-dim">hide (h)</span><span></span></div>
      <div class="zk-sep"></div>
      <div class="zk-flash"></div>
    `;
    hudFlash = hud.querySelector('.zk-flash');
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

      if (key === '?' || (key === '/' && event.shiftKey)) {
        state.hudVisible = !state.hudVisible;
        writeStore();
        renderHud();
        event.preventDefault();
        return;
      }

      if (key === 'h' && !CONFIG.bindings.some((b) => b.key === 'h')) {
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

      const binding = CONFIG.bindings.find((b) => b.key === key.toLowerCase());
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
