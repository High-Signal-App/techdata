import type { APIRoute } from "astro";
import { agentIndex } from "../lib/agent-surfaces";

export const GET: APIRoute = () =>
  new Response(agentIndex(true), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
