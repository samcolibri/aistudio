import { getStyleContext, styleContextToString } from '../indexer/query-assets.js'

export async function getStyleContextActivity(opts: {
  channel: string
  topic?: string
}): Promise<string> {
  try {
    const ctx = await getStyleContext(opts)
    return styleContextToString(ctx)
  } catch {
    return ''  // manifest not built yet — workflow proceeds with defaults
  }
}
