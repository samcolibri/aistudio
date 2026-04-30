// Split a script into scene chunks safe for lip-sync (≤130 words each, ≤12s at 130wpm)
export function splitIntoSceneChunks(text: string, maxWords = 130): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  const chunks: string[] = []
  let current: string[] = []
  let wordCount = 0

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).length
    if (wordCount + words > maxWords && current.length > 0) {
      chunks.push(current.join(' ').trim())
      current = []
      wordCount = 0
    }
    current.push(sentence.trim())
    wordCount += words
  }
  if (current.length > 0) chunks.push(current.join(' ').trim())
  return chunks.filter(c => c.length > 0)
}

export function estimateDuration(text: string, wpm = 130): number {
  return Math.ceil(text.split(/\s+/).length / wpm * 60)
}
