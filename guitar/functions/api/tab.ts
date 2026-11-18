import { extractStore, fetchUg, isUgUrl, parseTab } from '../_lib/ug'
import { cached, json, type Ctx } from '../_lib/http'

export const onRequestGet = async (ctx: Ctx) => {
  const url = new URL(ctx.request.url).searchParams.get('url')?.trim()
  if (!url || !isUgUrl(url)) return json({ error: 'Give an Ultimate Guitar tab link (tabs.ultimate-guitar.com/tab/...)' }, 400)
  return cached(ctx, 'tab:' + url, async () => {
    try {
      return json(parseTab(extractStore(await fetchUg(url)), url), 200, 86400)
    } catch (e) {
      return json({ error: (e as Error).message }, 502)
    }
  })
}
