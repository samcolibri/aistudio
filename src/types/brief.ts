export type Channel = 'youtube' | 'tiktok' | 'instagram' | 'pinterest'
export type ContentType = 'short_video' | 'long_video' | 'carousel' | 'pin'
export type PersonaId = 'nurse-mike' | 'nurse-alison' | 'jordan' | 'priya' | 'aaliyah' | 'dana'
export type AspectRatio = '16:9' | '9:16' | '1:1' | '2:3' | '4:5'

export interface ContentBrief {
  id: string                  // Airtable record ID
  title: string
  hook: string                // Opening hook line
  script: string              // Full approved script
  keyword: string
  channel: Channel
  contentType: ContentType
  personaId: PersonaId
  mayaSegment: string         // "17-18" | "19-22" | "23-28"
  rank: number
  score: number
  businessCase: string
  notes: string
  status: string              // "Creative Approved" = ready to produce
}

export interface ProductionJob {
  briefId: string
  brief: ContentBrief
  workflowId: string
  startedAt: string
}

export interface ProductionResult {
  briefId: string
  channel: Channel
  outputUrl: string           // Final video/image URL on R2
  thumbnailUrl?: string
  durationSec?: number
  totalCostUsd: number
  completedAt: string
}
