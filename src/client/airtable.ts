import Airtable from 'airtable'
import type { ContentBrief, PersonaId, Channel, ContentType } from '../types/brief.js'

const CHAD_BASE_ID = process.env.CHAD_BASE_ID ?? 'appLFh438nLooz6u7'
const BRIEFS_TABLE_ID = process.env.BRIEFS_TABLE_ID ?? 'tbl5P3J8agdY4gNtT'

function getBase() {
  const key = process.env.AIRTABLE_API_KEY
  if (!key) throw new Error('AIRTABLE_API_KEY not set')
  return new Airtable({ apiKey: key }).base(CHAD_BASE_ID)
}

function mapRecord(rec: Airtable.Record<Airtable.FieldSet>): ContentBrief {
  const f = rec.fields as Record<string, any>
  return {
    id: rec.id,
    title: f['Title'] ?? '',
    hook: f['Hook'] ?? '',
    script: f['Content Preview'] ?? f['Script'] ?? '',
    keyword: f['Keyword'] ?? '',
    channel: (f['Channel'] ?? 'youtube').toLowerCase() as Channel,
    contentType: (f['Type'] ?? 'long_video') as ContentType,
    personaId: (f['Persona'] ?? 'nurse-mike') as PersonaId,
    mayaSegment: f['Maya Segment'] ?? '19-22',
    rank: Number(f['Rank'] ?? 0),
    score: Number(f['Score'] ?? 0),
    businessCase: f['Business Case'] ?? '',
    notes: f['Notes'] ?? '',
    status: f['Creative Approved'] ?? f['Status'] ?? '',
  }
}

export async function fetchApprovedBriefs(): Promise<ContentBrief[]> {
  const base = getBase()
  const records: ContentBrief[] = []

  await base(BRIEFS_TABLE_ID)
    .select({
      filterByFormula: `{Creative Approved} = "Approved"`,
      sort: [{ field: 'Rank', direction: 'asc' }],
      maxRecords: 50,
    })
    .eachPage((page, next) => {
      page.forEach(rec => records.push(mapRecord(rec)))
      next()
    })

  return records
}

export async function fetchBriefById(recordId: string): Promise<ContentBrief> {
  const base = getBase()
  const rec = await base(BRIEFS_TABLE_ID).find(recordId)
  return mapRecord(rec)
}

export async function markAsProducing(recordId: string, workflowId: string): Promise<void> {
  const base = getBase()
  await base(BRIEFS_TABLE_ID).update(recordId, {
    'Production Status': 'Producing',
    'Workflow ID': workflowId,
    'Production Started': new Date().toISOString(),
  })
}

export async function markAsComplete(
  recordId: string,
  outputUrl: string,
  thumbnailUrl: string | undefined,
  costUsd: number
): Promise<void> {
  const base = getBase()
  await base(BRIEFS_TABLE_ID).update(recordId, {
    'Production Status': 'Complete',
    'Output URL': outputUrl,
    'Thumbnail URL': thumbnailUrl ?? '',
    'Production Cost USD': costUsd,
    'Production Completed': new Date().toISOString(),
  })
}

export async function markAsFailed(recordId: string, error: string): Promise<void> {
  const base = getBase()
  await base(BRIEFS_TABLE_ID).update(recordId, {
    'Production Status': 'Failed',
    'Production Error': error.slice(0, 1000),
  })
}
