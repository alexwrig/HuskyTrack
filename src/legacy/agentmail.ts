// LEGACY — AgentMail inbound email client. See src/legacy/inboundEmail.ts.
import { AgentMailClient } from 'agentmail'

export function getAgentMailClient(): AgentMailClient {
  const apiKey = process.env.AGENTMAIL_API_KEY
  if (!apiKey) throw new Error('AGENTMAIL_API_KEY environment variable is not set.')
  return new AgentMailClient({ apiKey })
}

export async function fetchAttachmentBase64(
  client: AgentMailClient,
  inboxId: string,
  messageId: string,
  attachmentId: string,
): Promise<{ base64: string; mimeType: string; filename: string | null }> {
  const meta = await client.inboxes.messages.getAttachment(inboxId, messageId, attachmentId)
  const res = await fetch(meta.downloadUrl)
  if (!res.ok) throw new Error(`Failed to download attachment ${attachmentId}: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return {
    base64: buffer.toString('base64'),
    mimeType: meta.contentType ?? 'application/octet-stream',
    filename: meta.filename ?? null,
  }
}
