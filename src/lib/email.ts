import { AgentMailClient } from 'agentmail'

// Reuses the inbox already provisioned for receipt ingestion -- it's a real
// mailbox capable of sending too, so no separate email service is needed.
const SENDER_INBOX = 'huskytrack-receipts@agentmail.to'

export async function sendLoginCode(toEmail: string, code: string): Promise<void> {
  const apiKey = process.env.AGENTMAIL_API_KEY
  if (!apiKey) throw new Error('AGENTMAIL_API_KEY environment variable is not set.')

  const client = new AgentMailClient({ apiKey })
  await client.inboxes.messages.send(SENDER_INBOX, {
    to: [toEmail],
    subject: 'Your HuskyTrack sign-in code',
    text: `Your HuskyTrack sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't request this, you can safely ignore this email.`,
  })
}
