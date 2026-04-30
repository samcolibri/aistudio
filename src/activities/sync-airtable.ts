import { Context } from '@temporalio/activity'
import { markAsComplete, markAsFailed } from '../client/airtable.js'
import type { SyncAirtableInput } from '../types/workflow.js'

export async function syncAirtableActivity(input: SyncAirtableInput): Promise<void> {
  const { airtableRecordId, outputUrl, thumbnailUrl, costUsd, status } = input
  const logger = Context.current().log

  logger.info(`[Airtable] Syncing ${airtableRecordId} → ${status}`)

  if (status === 'produced') {
    await markAsComplete(airtableRecordId, outputUrl, thumbnailUrl, costUsd)
  } else {
    await markAsFailed(airtableRecordId, 'Production failed — check workflow logs')
  }
}

export async function syncAirtableFailureActivity(opts: {
  airtableRecordId: string
  error: string
}): Promise<void> {
  await markAsFailed(opts.airtableRecordId, opts.error)
}
