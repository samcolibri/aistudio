export type Channel = 'youtube' | 'tiktok' | 'instagram' | 'pinterest'
export type ContentType = 'short_video' | 'long_video' | 'carousel' | 'pin'
export type PersonaId = 'nurse-mike' | 'nurse-alison' | 'jordan' | 'priya' | 'aaliyah' | 'dana'

export interface ContentBrief {
  airtableId: string
  rank: number
  title: string
  hook: string
  keyword: string
  channel: Channel
  contentType: ContentType
  personaId: PersonaId
  mayaSegment: '17-18' | '19-22' | '23-28'
  score: number
  businessCase: string
  contentPreview: string   // V8-approved script
  notes: string
  briefApproved: boolean
  contentApproved: boolean
  creativeApproved: boolean
}

export interface ProductionManifest {
  briefId: string
  workflowId: string
  channel: Channel
  outputs: {
    rawVideo?: string      // Veo3 stitched raw
    remotionVideo?: string // Remotion-rendered with branding
    voiceAudio?: string    // Fish Audio narration
    images?: string[]      // Imagen4 slides
  }
  r2Urls: string[]
  totalCostUsd: number
  completedAt: string
}
