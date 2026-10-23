// /openapi.json: the API's OpenAPI document, published beside the API reference page exactly as the
// API states it (apps/api/openapi.json, made by `pnpm openapi` from the shared contracts).
import type { APIRoute } from 'astro';

import openapi from '../../../api/openapi.json?raw';

export const GET: APIRoute = () =>
  new Response(openapi, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
