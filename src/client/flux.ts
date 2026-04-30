/**
 * Flux Pro — Black Forest Labs
 * API: https://api.bfl.ai/v1
 * Model: flux-pro-1.1-ultra — best quality for Pinterest educational content
 */
export async function generateFlux(opts: {
  prompt: string
  aspectRatio?: '1:1' | '4:5' | '2:3' | '16:9' | '9:16'
}): Promise<Buffer> {
  const key = process.env.FLUX_API_KEY ?? process.env.BFL_API_KEY
  if (!key) throw new Error('FLUX_API_KEY not set')

  // Map aspect ratio to width/height for Flux
  const dimensions: Record<string, { width: number; height: number }> = {
    '1:1':  { width: 1024, height: 1024 },
    '4:5':  { width: 1024, height: 1280 },
    '2:3':  { width: 1008, height: 1512 },
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
  }
  const dim = dimensions[opts.aspectRatio ?? '2:3']

  const res = await fetch('https://api.bfl.ai/v1/flux-pro-1.1-ultra', {
    method: 'POST',
    headers: { 'x-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: opts.prompt,
      width: dim.width,
      height: dim.height,
      output_format: 'png',
      safety_tolerance: 2,
    }),
  })
  if (!res.ok) throw new Error(`Flux API ${res.status}: ${await res.text()}`)
  const data = await res.json() as any

  // Flux returns a polling ID — poll until done
  const taskId = data.id
  if (!taskId) throw new Error(`Flux: no task id in response`)

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const poll = await fetch(`https://api.bfl.ai/v1/get_result?id=${taskId}`, {
      headers: { 'x-key': key }
    })
    const result = await poll.json() as any
    if (result.status === 'Ready') {
      const imgRes = await fetch(result.result.sample)
      return Buffer.from(await imgRes.arrayBuffer())
    }
    if (result.status === 'Error') throw new Error(`Flux error: ${result.error}`)
  }
  throw new Error('Flux: timed out waiting for result')
}
