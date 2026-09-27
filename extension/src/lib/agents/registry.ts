// PURE: the agent sources. Add new ones here. Web agents aren't a source: they're read from browser tabs (web.ts).

import type { AgentSource } from "./model";
import { claude } from "./sources/claude";
import { cli } from "./sources/cli";
import { codex } from "./sources/codex";
import { cursor } from "./sources/cursor";
import { herdr } from "./sources/herdr";

export const AGENT_SOURCES: readonly AgentSource[] = [claude, codex, cursor, herdr, cli];
