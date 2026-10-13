import type { APIRoute } from "astro";
import { agentIndex } from "../lib/agent-surfaces";

export const GET: APIRoute = () =>
  new Response(agentIndex(true), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
