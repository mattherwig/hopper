// PURE: filtering and ranking tabs for the search bar (Raycast's own filter is turned off; ADR-015).
//
// Every word of the query must match some field of a tab: its app's name, title, detail/URL, or kind. A word
// matches exactly, as a prefix, inside a word, or with a typo ("caude" finds "Claude"). App-name matches rank
// above title matches, so typing an app's name brings that app's own tabs first, ahead of browser tabs
// that merely mention it.

import type { Tab } from "./model";

// Match quality of one query word against one field, best first.
const EXACT = 100;
const PREFIX = 90;
const WORD_PREFIX = 80;
const SUBSTRING = 70;
const TYPO = 60; // minus 10 per edit
const SUBSEQUENCE = 40;

/** Added to app-name matches so an app's own tabs outrank tabs that mention it. */
const APP_BONUS = 15;
/** Detail and URL matter less than the title; the kind ("tab", "session"...) least. */
const DETAIL_WEIGHT = 0.8;
const KIND_WEIGHT = 0.5;

/**
 * Tabs matching every word of `query`, best match first; ties keep the input order (recency). Blank query:
 * `tabs` unchanged.
 */
export function searchTabs(tabs: Tab[], query: string): Tab[] {
  const words = splitWords(query);
  if (words.length === 0) return tabs;
  return tabs
    .map((tab, i) => ({ tab, i, score: scoreTab(tab, words) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.tab);
}

/** Sum of each word's best field score, or 0 if any word matches nothing. */
export function scoreTab(tab: Tab, words: string[]): number {
  const fields: [string, (score: number) => number][] = [
    [tab.app.name, (s) => s + APP_BONUS],
    [tab.title, (s) => s],
    [tab.detail ?? "", (s) => s * DETAIL_WEIGHT],
    [tab.url ?? "", (s) => s * DETAIL_WEIGHT],
    [tab.kind, (s) => s * KIND_WEIGHT],
  ];
  let total = 0;
  for (const word of words) {
    let best = 0;
    for (const [text, weigh] of fields) {
      const score = matchWord(word, text.toLowerCase());
      if (score > 0) best = Math.max(best, weigh(score));
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/** How well the lowercase query word `word` matches lowercase `text`; 0 if not at all. */
export function matchWord(word: string, text: string): number {
  if (!text) return 0;
  if (text === word) return EXACT;
  if (text.startsWith(word)) return PREFIX;
  const textWords = splitWords(text);
  if (textWords.some((w) => w.startsWith(word))) return WORD_PREFIX;
  if (text.includes(word)) return SUBSTRING;

  const allowed = word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0;
  if (allowed > 0) {
    let best = Infinity;
    for (const w of textWords) {
      // Whole word ("caude" vs "claude"), or its start while still typing ("cluad" vs "claud[e]").
      best = Math.min(best, editDistance(word, w), editDistance(word, w.slice(0, word.length)));
    }
    if (best <= allowed) return TYPO - 10 * best;
  }
  // Letters in order inside one word, starting with its first letter: "gh" finds "github", "gthb" too.
  if (word.length >= 2 && textWords.some((w) => w[0] === word[0] && isSubsequence(word, w))) return SUBSEQUENCE;
  return 0;
}

function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Optimal string alignment distance: insertions, deletions, substitutions, and adjacent swaps each cost 1. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function isSubsequence(word: string, text: string): boolean {
  let i = 0;
  for (const c of text) if (c === word[i]) i++;
  return i === word.length;
}
