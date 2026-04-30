import type { ContentBrief, ProductionResult, Channel } from './brief.js'

export interface ContentCreationInput {
  brief: ContentBrief
}

export interface ContentCreationOutput extends ProductionResult {}

export interface GenerateImageInput {
  briefId: string
  prompt: string
  aspectRatio: '3:4' | '16:9' | '9:16' | '1:1' | '2:3'
  personaId: string
}

export interface GenerateImageOutput {
  url: string
  localPath: string
  costUsd: number
}

export interface GenerateVoiceInput {
  briefId: string
  text: string
  voiceId: string
  channel: Channel
  speed?: number
}

export interface GenerateVoiceOutput {
  url: string
  localPath: string
  durationSec: number
  costUsd: number
}

export interface GenerateLipSyncInput {
  briefId: string
  imageUrl: string
  audioUrl: string
  sceneId: string
  durationSec?: number
}

export interface GenerateLipSyncOutput {
  url: string
  localPath: string
  costUsd: number
}

export interface GenerateMusicInput {
  briefId: string
  prompt: string
  durationSec?: number
}

export interface GenerateMusicOutput {
  url: string
  localPath: string
  costUsd: number
}

export interface ComposeVideoInput {
  briefId: string
  channel: Channel
  clipPaths: string[]
  musicPath?: string
  aspectRatio: '16:9' | '9:16'
}

export interface ComposeVideoOutput {
  localPath: string
  durationSec: number
}

export interface UploadOutputInput {
  briefId: string
  channel: Channel
  localPath: string
  contentType: 'video/mp4' | 'image/jpeg' | 'image/png'
}

export interface UploadOutputOutput {
  url: string
  key: string
}

export interface SyncAirtableInput {
  briefId: string
  airtableRecordId: string
  outputUrl: string
  thumbnailUrl?: string
  costUsd: number
  status: 'produced' | 'failed'
}
