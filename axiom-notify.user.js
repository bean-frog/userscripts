// ==UserScript==
// @name         Axiom Toast Desktop Notifier
// @namespace    beanfrog.axiom.toastnotifier
// @version      1.0
// @description  Watches axiom.trade's toast container and fires a desktop notification for each new toast (wallet, action, token, market cap)
// @match        https://axiom.trade/*
// @grant        GM_notification
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const seen = new WeakSet();

  // Fallback permission request in case GM_notification isn't available/granted
  if (typeof GM_notification === 'undefined' && typeof Notification !== 'undefined') {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function notify(title, body) {
    if (typeof GM_notification === 'function') {
      GM_notification({ title, text: body, timeout: 8000 });
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    } else {
      console.log(`[toast] ${title} — ${body}`);
    }
  }

  // Pull wallet / action / token / amount / market cap out of a toast's rendered text.
  // Deliberately avoids brittle Tailwind class selectors (arbitrary-value classes
  // need CSS.escape gymnastics and change often); relies on the two-line text layout instead.
  function parseToast(toastEl) {
    const lines = toastEl.innerText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (lines.length < 2) return null;

    // Line 1 example: "👻 decu sold all anon"
    const line1 = lines[0].replace(/^[^\w]+/, '').trim(); // strip leading emoji
    const actionMatch = line1.match(/^(\S+)\s+(bought more|bought|sold all|sold half|sold some|sold)\s+(.+)$/i);
    if (!actionMatch) return null;
    const [, wallet, action, token] = actionMatch;

    // Line 2 example: "2.186 at $7.68K MC"
    const mcMatch = lines[1].match(/^([\d.,]+[KMBkmb]?)\s+at\s+\$([\d.,]+[KMBkmb]?)\s+MC/i);
    if (!mcMatch) return null;
    const [, amount, marketCap] = mcMatch;

    return { wallet, action: action.toLowerCase(), token, amount, marketCap };
  }

  function handleToast(toastEl) {
    if (seen.has(toastEl)) return;
    seen.add(toastEl);

    const info = parseToast(toastEl);
    if (!info) {
      console.warn('[axiom-toast-notifier] could not parse toast', toastEl);
      return;
    }

    const isBuy = /bought/.test(info.action);
    const icon = isBuy ? '🟢' : '🔴';
    const title = `${icon} ${info.wallet} ${info.action} ${info.token}`;
    const body = `${info.amount} SOL • MC $${info.marketCap}`;

    notify(title, body);
  }

  function scanNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.classList && node.classList.contains('animate-enter')) {
      handleToast(node);
    }
    if (node.querySelectorAll) {
      node.querySelectorAll('.animate-enter').forEach(handleToast);
    }
  }

  function attachToasterObserver(toaster) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(scanNode);
      }
    });
    observer.observe(toaster, { childList: true, subtree: true });
    console.log('[axiom-toast-notifier] watching toaster', toaster);
  }

  function waitForToaster() {
    const existing = document.querySelector('div[data-rht-toaster]');
    if (existing) {
      attachToasterObserver(existing);
      return;
    }
    const bodyObserver = new MutationObserver(() => {
      const el = document.querySelector('div[data-rht-toaster]');
      if (el) {
        bodyObserver.disconnect();
        attachToasterObserver(el);
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  waitForToaster();
})();
