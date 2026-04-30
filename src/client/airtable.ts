// Airtable client — uses EXACT field names from Chad's dashboard (appLFh438nLooz6u7)
// Verified field names from nova-gtm/generate_final.py + organic/airtable_sync.py
import Airtable from 'airtable'
import type { ContentBrief, Channel, ContentType, PersonaId } from '../types/brief.js'

const BASE_ID   = process.env.CHAD_BASE_ID    ?? 'appLFh438nLooz6u7'
const TABLE_ID  = process.env.BRIEFS_TABLE_ID ?? 'tbl5P3J8agdY4gNtT'

function base() {
  const key = process.env.CHAD_AIRTABLE_API_KEY ?? process.env.AIRTABLE_API_KEY
  if (!key) throw new Error('CHAD_AIRTABLE_API_KEY not set')
  return new Airtable({ apiKey: key }).base(BASE_ID)
}

function mapRecord(rec: Airtable.Record<Airtable.FieldSet>): ContentBrief {
  const f = rec.fields as Record<string, any>
  return {
    airtableId:      rec.id,
    rank:            Number(f['Rank'] ?? 0),
    title:           String(f['Title'] ?? ''),
    hook:            String(f['Hook'] ?? ''),
    keyword:         String(f['Keyword'] ?? ''),
    channel:         String(f['Channel'] ?? 'youtube').toLowerCase() as Channel,
    contentType:     String(f['Type'] ?? 'long_video') as ContentType,
    personaId:       String(f['Persona'] ?? 'nurse-mike') as PersonaId,
    mayaSegment:     String(f['Maya Segment'] ?? '19-22') as ContentBrief['mayaSegment'],
    score:           Number(f['Score'] ?? 0),
    businessCase:    String(f['Business Case'] ?? ''),
    contentPreview:  String(f['Content Preview'] ?? ''),
    notes:           String(f['Notes'] ?? ''),
    briefApproved:   f['Brief Approved?'] === 'Approved' || f['Brief Approved?'] === true,
    contentApproved: f['Content Approved?'] === 'Approved',
    creativeApproved: f['Creative Approved'] === 'Approved',
  }
}

export async function fetchCreativeApprovedBriefs(): Promise<ContentBrief[]> {
  const records: ContentBrief[] = []
  await base()(TABLE_ID)
    .select({
      filterByFormula: `{Creative Approved} = "Approved"`,
      sort: [{ field: 'Rank', direction: 'asc' }],
    })
    .eachPage((page, next) => {
      page.forEach(r => records.push(mapRecord(r)))
      next()
    })
  return records
}

export async function fetchContentApprovedBriefs(): Promise<ContentBrief[]> {
  const records: ContentBrief[] = []
  await base()(TABLE_ID)
    .select({
      filterByFormula: `AND({Content Approved?} = "Approved", {Creative Approved} != "Approved")`,
      sort: [{ field: 'Rank', direction: 'asc' }],
    })
    .eachPage((page, next) => {
      page.forEach(r => records.push(mapRecord(r)))
      next()
    })
  return records
}

export async function fetchBriefByRank(rank: number): Promise<ContentBrief | null> {
  const records: ContentBrief[] = []
  await base()(TABLE_ID)
    .select({ filterByFormula: `{Rank} = ${rank}` })
    .eachPage((page, next) => {
      page.forEach(r => records.push(mapRecord(r)))
      next()
    })
  return records[0] ?? null
}

export async function fetchBriefById(recordId: string): Promise<ContentBrief> {
  const rec = await base()(TABLE_ID).find(recordId)
  return mapRecord(rec)
}

// ── Status updates ─────────────────────────────────────────────────────────────

export async function setProductionStatus(id: string, status: string, workflowId?: string) {
  const fields: Record<string, string> = { 'Production Status': status }
  if (workflowId) fields['Workflow ID'] = workflowId
  await base()(TABLE_ID).update(id, fields)
}

export async function pushCreativeLinks(id: string, urls: string[], qaPass: boolean) {
  await base()(TABLE_ID).update(id, {
    'Creative Link': urls.join('\n'),
    'QA Passed': qaPass ? 'Yes' : 'No',
    'Production Status': 'Review Ready',
    'Produced At': new Date().toISOString(),
  })
}

export async function markPublished(id: string, publishedUrls: Record<string, string>) {
  await base()(TABLE_ID).update(id, {
    'Published URLs': JSON.stringify(publishedUrls),
    'Production Status': 'Published',
    'Published At': new Date().toISOString(),
  })
}

export async function markFailed(id: string, error: string) {
  await base()(TABLE_ID).update(id, {
    'Production Status': 'Failed',
    'Production Error': error.slice(0, 1000),
  })
}
