export interface Ctx {
  request: Request
  waitUntil(p: Promise<unknown>): void
}

export function json(data: unknown, status = 200, maxAge = 0): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    },
  })
}

/** Serve from the edge cache for a day, filling it on a miss. */
export async function cached(ctx: Ctx, key: string, make: () => Promise<Response>): Promise<Response> {
  // caches.default exists on Workers; not in local dev builds of some tools
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default
  const req = new Request('https://cache.fretboard/' + encodeURIComponent(key))
  if (cache) {
    const hit = await cache.match(req)
    if (hit) return hit
  }
  const res = await make()
  if (cache && res.ok) ctx.waitUntil(cache.put(req, res.clone()))
  return res
}
