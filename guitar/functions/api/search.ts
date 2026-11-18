import { extractStore, fetchUg, parseSearch } from '../_lib/ug'
import { cached, json, type Ctx } from '../_lib/http'

export const onRequestGet = async (ctx: Ctx) => {
  const q = new URL(ctx.request.url).searchParams.get('q')?.trim()
  if (!q) return json({ error: 'Missing q' }, 400)
  return cached(ctx, 'search:' + q.toLowerCase(), async () => {
    try {
      const html = await fetchUg('https://www.ultimate-guitar.com/search.php?search_type=title&value=' + encodeURIComponent(q))
      return json({ results: parseSearch(extractStore(html)).slice(0, 25) }, 200, 86400)
    } catch (e) {
      return json({ error: (e as Error).message }, 502)
    }
  })
}
