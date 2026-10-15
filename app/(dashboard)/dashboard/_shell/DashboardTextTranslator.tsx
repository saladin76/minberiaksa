'use client';

import { useEffect } from 'react';
import { dtMaybe } from '@/lib/dashboard/i18n';

const ARABIC = /[؀-ۿ]/;
const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'] as const;
/* Editors and anything marked as content keep their Arabic. */
const SKIP_SELECTOR = '[contenteditable="true"], [data-no-dt], [translate="no"], script, style, textarea, code, pre';

/* React marks the DOM nodes it owns once they are hydrated. Server HTML that a
   later Suspense boundary has not hydrated yet must keep React's text, or React
   reports a mismatch and re-renders the section. */
function hydrated(el: Element): boolean {
  for (const key in el) if (key.startsWith('__reactFiber$')) return true;
  return false;
}

function skipped(el: Element | null): boolean {
  return !el || !hydrated(el) || el.closest(SKIP_SELECTOR) !== null;
}

function translateText(node: Text) {
  const value = node.nodeValue;
  if (!value || !ARABIC.test(value) || skipped(node.parentElement)) return;
  /* An <option> without a value submits its text: changing it would change the data. */
  const parent = node.parentElement;
  if (parent?.tagName === 'OPTION' && !parent.hasAttribute('value')) return;
  const next = dtMaybe(value);
  if (next !== value) node.nodeValue = next;
}

function translateAttributes(el: Element) {
  if (skipped(el)) return;
  for (const name of ATTRIBUTES) {
    const value = el.getAttribute(name);
    if (!value || !ARABIC.test(value)) continue;
    const next = dtMaybe(value);
    if (next !== value) el.setAttribute(name, next);
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateAttributes(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) translateText(node as Text);
    else translateAttributes(node as Element);
  }
}

/**
 * The last line of the dashboard's English and Turkish.
 *
 * Interface text in the dashboard source goes through `dt()`. What doesn't is
 * Arabic that arrives at runtime: an API's error message, a status label from a
 * module the public site shares, a value a page compares against before showing
 * it. When such a string is, in full, a phrase the catalogue knows, this swaps it
 * in the DOM  React keeps its own copy, and a re-render that writes the Arabic
 * back is translated again by the same observer.
 *
 * Only mounted for English and Turkish; in Arabic there is nothing to do.
 */
export function DashboardTextTranslator() {
  useEffect(() => {
    translateTree(document.body);
    /* Hydration changes nothing in the DOM, so sections that hydrate after this
       effect are picked up by a few passes rather than by the observer. */
    const passes = [400, 1200, 3000, 7000].map((ms) => window.setTimeout(() => translateTree(document.body), ms));
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') translateText(record.target as Text);
        else if (record.type === 'attributes') translateAttributes(record.target as Element);
        else record.addedNodes.forEach(translateTree);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRIBUTES],
    });
    return () => {
      observer.disconnect();
      passes.forEach((id) => window.clearTimeout(id));
    };
  }, []);
  return null;
}
