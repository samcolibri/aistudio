/**
 * DALL-E 3 via OpenAI
 * Best for: text-heavy educational content, clean layouts
 */
export async function generateDalle(opts: {
  prompt: string
  size?: '1024x1024' | '1792x1024' | '1024x1792'
}): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not set')

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: opts.prompt,
      n: 1,
      size: opts.size ?? '1024x1792',
      quality: 'hd',
      response_format: 'b64_json',
    }),
  })
  if (!res.ok) throw new Error(`DALL-E ${res.status}: ${await res.text()}`)
  const data = await res.json() as any
  return Buffer.from(data.data[0].b64_json, 'base64')
}
