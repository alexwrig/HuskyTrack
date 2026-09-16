import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy - HuskyTrack',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
        {title}
      </h2>
      <div className="text-sm leading-relaxed text-stone-600 dark:text-stone-400 flex flex-col gap-2">
        {children}
      </div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-stone-900 dark:text-stone-100">
          Privacy Policy
        </h1>
        <p className="text-xs text-stone-500 dark:text-stone-500 mt-2">
          Last updated September 15, 2026
        </p>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm p-6 flex flex-col gap-6">
        <Section title="What HuskyTrack is">
          <p>
            HuskyTrack is a personal 529 education-expense tracking application. It is built,
            operated, and used by a single individual to track their own family&apos;s spending
            against their 529 education savings plan. It is not offered as a service to the
            public, and it does not have other end users, customers, or accounts beyond its
            owner.
          </p>
        </Section>

        <Section title="Data we collect">
          <p>When connected via Plaid, HuskyTrack receives:</p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Bank and credit card transaction data: date, amount, merchant, category, and location (city/state)</li>
            <li>Basic account details: account name, account type, and the last few digits of the account number</li>
            <li>The name of the connected financial institution</li>
          </ul>
          <p>HuskyTrack also processes, when used:</p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Receipts forwarded by email or uploaded as photos/PDFs</li>
            <li>Uploaded credit card or bank statements (PDF) and spreadsheets</li>
            <li>The owner&apos;s email address, used solely to sign in</li>
          </ul>
        </Section>

        <Section title="How data is used">
          <p>
            Collected data is used only to categorize spending against 529-qualified education
            expense categories and to generate spending summaries and exportable spreadsheets for
            the owner&apos;s own recordkeeping and tax-qualification purposes. It is not used for
            advertising, profiling, or any purpose unrelated to this tracking function.
          </p>
        </Section>

        <Section title="Third-party service providers">
          <p>HuskyTrack relies on the following providers to operate. Data is shared with each only as needed to provide its function, and none of them are permitted to use it for their own purposes:</p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li><strong>Plaid</strong> - securely connects bank/credit accounts and provides transaction data</li>
            <li><strong>Anthropic (Claude API)</strong> - reads receipt images/PDFs and statement text to extract and categorize expense data</li>
            <li><strong>AgentMail</strong> - receives forwarded receipt emails and sends sign-in codes</li>
            <li><strong>Vercel</strong> - hosts the application</li>
            <li><strong>Neon</strong> - hosts the Postgres database that stores the data described above</li>
          </ul>
          <p>Data is never sold, rented, or shared with any party for marketing or advertising purposes.</p>
        </Section>

        <Section title="How data is protected">
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>All traffic between your browser and HuskyTrack, and between HuskyTrack and its database, is encrypted in transit (TLS 1.2+)</li>
            <li>Sensitive financial fields (merchant, amount, date, location, category, account name/mask, institution name) are encrypted at rest using AES-256-GCM, in addition to any encryption-at-rest provided by the database host</li>
            <li>Plaid access tokens are encrypted at rest and are never exposed to the browser</li>
            <li>Sign-in uses one-time email codes rather than a stored password; codes are hashed, rate-limited, and expire after 10 minutes</li>
            <li>Sessions are stored server-side and can be revoked immediately (e.g., on sign-out)</li>
          </ul>
        </Section>

        <Section title="Data retention">
          <p>
            Data is retained until manually deleted by the owner within the application. There is
            no automatic expiration. Disconnecting a bank connection stops new data from being
            synced but does not automatically delete previously synced transactions; those can be
            deleted manually.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            HuskyTrack sets a single session cookie used only to keep the owner signed in. It is
            not used for tracking or advertising, and no third-party analytics or advertising
            cookies are set.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            This policy may be updated as the application changes. The date at the top of this
            page reflects the most recent update.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy can be sent to the application owner at{' '}
            <a href="mailto:alex@familywright.net" className="text-[#4B2E83] dark:text-purple-400 hover:underline">
              alex@familywright.net
            </a>.
          </p>
        </Section>
      </div>
    </div>
  )
}
