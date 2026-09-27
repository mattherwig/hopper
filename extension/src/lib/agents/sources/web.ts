// Web agents open in browser tabs, recognized by URL: a Claude Code web session, a Codex cloud task, a Jules or
// Devin session... Their pages don't expose status (titles don't change when a turn ends), so it's "unknown";
// they're listed so all agents are in one place, and jump to their tab. Not an AgentSource: it reads tabs
// already listed, so it runs only where browser tabs are loaded (the Agents list, not Next Agent).

import type { Agent } from "../model";
import type { Tab } from "../../tabs/model";

interface WebAgent {
  product: string;
  pattern: RegExp;
}

/** Group 1 of each pattern is the session id. */
export const WEB_AGENTS: WebAgent[] = [
  { product: "Claude Code", pattern: /^https:\/\/claude\.ai\/code\/((?:session_|cse_)[\w-]+)/ },
  { product: "Codex", pattern: /^https:\/\/chatgpt\.com\/codex\/(?:cloud\/)?tasks\/(task_[\w-]+)/ },
  { product: "Jules", pattern: /^https:\/\/jules\.google\.com\/session\/([\w-]+)/ },
  { product: "Devin", pattern: /^https:\/\/app\.devin\.ai\/sessions\/([\w-]+)/ },
  { product: "Cursor", pattern: /^https:\/\/cursor\.com\/agents\/(bc-[\w-]+)/ },
];

export function webAgents(tabs: Tab[]): Agent[] {
  const seen = new Set<string>();
  return tabs.flatMap((tab): Agent[] => {
    if (!tab.url) return [];
    for (const { product, pattern } of WEB_AGENTS) {
      const id = pattern.exec(tab.url)?.[1];
      if (!id) continue;
      const key = `web:${id}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          key,
          source: "web",
          product,
          id,
          title: tab.title,
          status: "unknown",
          host: { kind: "tab", tab },
        },
      ];
    }
    return [];
  });
}
