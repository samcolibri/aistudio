import { executeChild, log } from '@temporalio/workflow'
import { YouTubeVideoWorkflow } from './youtube-video.workflow.js'
import { TikTokVideoWorkflow } from './tiktok-video.workflow.js'
import { InstagramCarouselWorkflow } from './instagram-carousel.workflow.js'
import { PinterestPinWorkflow } from './pinterest-pin.workflow.js'
import type { ContentCreationInput, ContentCreationOutput } from '../types/workflow.js'
import type { ContentBrief } from '../types/brief.js'
import { timedelta } from './shared.js'

// Master dispatcher — routes to the right child workflow by channel
export async function ContentCreationWorkflow(
  input: ContentCreationInput
): Promise<ContentCreationOutput> {
  const { brief } = input
  log.info(`[ContentCreation] Routing ${brief.id}`, { channel: brief.channel, type: brief.contentType })

  return executeChild(channelWorkflow(brief), {
    args: [brief],
    workflowId: `${brief.id}-${brief.channel}`,
    startToCloseTimeout: timedelta({ hours: 4 }),
  })
}

function channelWorkflow(brief: ContentBrief) {
  switch (brief.channel) {
    case 'youtube':  return YouTubeVideoWorkflow
    case 'tiktok':   return TikTokVideoWorkflow
    case 'instagram': return InstagramCarouselWorkflow
    case 'pinterest': return PinterestPinWorkflow
    default:
      throw new Error(`Unknown channel: ${brief.channel}`)
  }
}
