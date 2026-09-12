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

  // Pull wallet / action / token / amount / market cap directly out of the toast's DOM.
  // Regexing toastEl.innerText is brittle: wallet names can contain spaces ("kolscan guy #2"),
  // and Axiom sometimes emits adjacent spans with no whitespace between them in the markup
  // (e.g. "bought more"+"OS" -> innerText "bought moreOS"), which breaks word-boundary regexes.
  // Instead we key off the two semantic color classes Axiom uses for buy/sell ("text-increase" /
  // "text-decrease"): the first marks the action word, the second marks the SOL amount. Everything
  // else is read positionally off of those two anchor elements, so exact spacing never matters.
  function parseToast(toastEl) {
    const markers = toastEl.querySelectorAll('.text-increase, .text-decrease');
    if (markers.length < 2) return null;

    const actionEl = markers[0];
    const amountEl = markers[1];

    const action = actionEl.textContent.trim().toLowerCase();
    if (!action) return null;

    // Token is the element right after the action span (e.g. <span class="ml-[2px]">OS</span>).
    const tokenEl = actionEl.nextElementSibling;
    const token = tokenEl ? tokenEl.textContent.trim() : '';
    if (!token) return null;

    // Wallet is whatever text sits between the leading emoji icon and the action span.
    const line1 = actionEl.parentElement;
    let wallet = '';
    if (line1) {
      for (const node of line1.childNodes) {
        if (node === actionEl) break;
        if (node === line1.firstChild) continue; // skip the leading emoji/icon span
        wallet += node.textContent;
      }
    }
    wallet = wallet.trim();
    if (!wallet) return null;

    const amount = amountEl.textContent.trim();
    if (!amount) return null;

    // Market cap lives in a sibling span of the amount, formatted like "$461K".
    let marketCap = '';
    const line2 = amountEl.parentElement;
    if (line2) {
      for (const span of line2.querySelectorAll('span')) {
        const text = span.textContent.trim();
        const mcMatch = text.match(/^\$([\d.,]+[KMBkmb]?)$/);
        if (mcMatch) {
          marketCap = mcMatch[1];
          break;
        }
      }
    }
    if (!marketCap) return null;

    return { wallet, action, token, amount, marketCap };
  }

function handleToast(toastEl) {
    if (seen.has(toastEl)) return;
    seen.add(toastEl);

    const info = parseToast(toastEl);
    if (!info) {
      console.warn('[axiom-toast-notifier] could not parse toast', toastEl);
      Array.from(toastEl.children).forEach((child, i) => {
        console.warn(`[axiom-toast-notifier] child ${i}:\n${child.outerHTML}`);
      });
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
