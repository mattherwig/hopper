// Muse (Meta): "Main chat" and the side chats in its "Side chats" navigation. Muse 4.1 hides that list behind a
// "<open chat> Open chat and side chats" button, pressed through Accessibility to reveal it (ADR-016); the same
// button names the open chat. Older versions add "<date> More thread actions" to a hovered row's title. Rows
// ignore AXPress, so they're opened by keyboard.

import { sidebarSource } from "./sidebar";

const DATE = String.raw`\d{1,2}:\d{2}\s?[AP]M|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Yesterday|Today|Now|[A-Z][a-z]{2} \d{1,2}(?:, \d{4})?|\d{1,2}/\d{1,2}(?:/\d{2,4})?|\d+[mhdw]`;

export const muse = sidebarSource({
  id: "muse",
  bundleId: "com.meta.endo",
  kind: "session",
  container: "Side chats",
  rowRole: "AXButton",
  format: "plain",
  namePattern: String.raw`^(.+?)(?:\s+(?:${DATE}))?\s+More thread actions$`,
  keyboard: true,
  reveal: "Open chat and side chats",
  activeSuffix: " Open chat and side chats",
  skip: ["Side chats", "New side chat"],
});
