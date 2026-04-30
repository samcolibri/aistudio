import { Context } from '@temporalio/activity'
import { pushCreativeLinks, markFailed, setProductionStatus } from '../client/airtable.js'

export async function pushToAirtableActivity(input: {
  airtableId: string
  outputUrls: string[]
  qaPass: boolean
  workflowId: string
}): Promise<void> {
  const logger = Context.current().log
  logger.info(`[Airtable] Pushing ${input.outputUrls.length} creative links`, { id: input.airtableId })
  await pushCreativeLinks(input.airtableId, input.outputUrls, input.qaPass)
}

export async function markFailedActivity(input: { airtableId: string; error: string }): Promise<void> {
  await markFailed(input.airtableId, input.error)
}

export async function setStatusActivity(input: { airtableId: string; status: string }): Promise<void> {
  await setProductionStatus(input.airtableId, input.status)
}
