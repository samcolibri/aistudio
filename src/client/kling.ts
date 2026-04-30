/**
 * Kling AI — video generation
 * API: https://api.klingai.com/v1
 * Best for: realistic talking-head and lifestyle video clips
 */
export async function generateKlingVideo(opts: {
  prompt: string
  aspectRatio?: '9:16' | '16:9' | '1:1'
  duration?: 5 | 10
  mode?: 'std' | 'pro'
}): Promise<Buffer> {
  const key = process.env.KLING_API_KEY
  if (!key) throw new Error('KLING_API_KEY not set')

  const res = await fetch('https://api.klingai.com/v1/videos/text2video', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_name: opts.mode === 'pro' ? 'kling-v1-pro' : 'kling-v1',
      prompt: opts.prompt,
      aspect_ratio: opts.aspectRatio ?? '9:16',
      duration: String(opts.duration ?? 5),
    }),
  })
  if (!res.ok) throw new Error(`Kling ${res.status}: ${await res.text()}`)
  const data = await res.json() as any
  const taskId = data.data?.task_id
  if (!taskId) throw new Error('Kling: no task_id')

  // Poll for completion (Kling videos take 2-5 min)
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const poll = await fetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` }
    })
    const result = await poll.json() as any
    const status = result.data?.task_status
    if (status === 'succeed') {
      const videoUrl = result.data?.task_result?.videos?.[0]?.url
      if (!videoUrl) throw new Error('Kling: no video URL in result')
      const vid = await fetch(videoUrl)
      return Buffer.from(await vid.arrayBuffer())
    }
    if (status === 'failed') throw new Error(`Kling task failed: ${result.data?.task_status_msg}`)
  }
  throw new Error('Kling: timed out (7.5 min)')
}
