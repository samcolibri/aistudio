// Text splitting utilities matching nova-gtm scene chunking logic

// Split script for Veo3 clips — ~8s each at 130wpm ≈ 17 words per clip (8s)
// Veo3 is prompted with the dialogue — shorter chunks = better acting
export function splitIntoVeoScenes(text: string, maxWords = 30): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  const scenes: string[] = []
  let current: string[] = []
  let wordCount = 0

  for (const s of sentences) {
    const words = s.trim().split(/\s+/).length
    if (wordCount + words > maxWords && current.length > 0) {
      scenes.push(current.join(' ').trim())
      current = []
      wordCount = 0
    }
    current.push(s.trim())
    wordCount += words
  }
  if (current.length > 0) scenes.push(current.join(' ').trim())
  return scenes.filter(s => s.length > 0)
}

// Split for Fish Audio chunks (align with Veo3 scenes)
export function splitIntoVoiceChunks(text: string, maxWords = 30): string[] {
  return splitIntoVeoScenes(text, maxWords)
}

export function estimateDurationSec(text: string, wpm = 130): number {
  return Math.ceil(text.split(/\s+/).length / wpm * 60)
}
