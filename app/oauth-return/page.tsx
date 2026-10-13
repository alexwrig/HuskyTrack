'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { OAUTH_STATE_KEY, usePlaidLinkFlow, type OAuthState } from '@/src/components/usePlaidLinkFlow'

// Plaid's OAuth redirect target (PLAID_REDIRECT_URI). Banks like Chase send
// the user here after they approve access; Link must be reopened with the
// same link token plus this page's full URL to finish the connection.
function ResumeLink({ state, redirectUri }: { state: OAuthState; redirectUri: string }) {
  const router = useRouter()
  const onComplete = useCallback(() => router.replace('/'), [router])
  const { status, error } = usePlaidLinkFlow({
    itemId: state.item_id,
    onComplete,
    resume: { token: state.link_token, receivedRedirectUri: redirectUri },
  })

  return (
    <p role={error ? 'alert' : 'status'} className={error ? 'text-red-600 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'}>
      {error ?? status ?? 'Finishing your bank connection...'}
    </p>
  )
}

export default function OAuthReturnPage() {
  const [resume, setResume] = useState<{ state: OAuthState; redirectUri: string } | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OAUTH_STATE_KEY)
      if (raw) {
        setResume({ state: JSON.parse(raw) as OAuthState, redirectUri: window.location.href })
        return
      }
    } catch {
      // fall through to the "missing" message
    }
    setMissing(true)
  }, [])

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-sm">
      {resume && <ResumeLink state={resume.state} redirectUri={resume.redirectUri} />}
      {missing && (
        <>
          <p role="alert" className="text-red-600 dark:text-red-400">
            This bank connection session expired or was started in another browser.
          </p>
          <Link href="/" className="font-medium text-[#4B2E83] dark:text-purple-400 hover:underline">
            Back to HuskyTrack and try connecting again
          </Link>
        </>
      )}
    </div>
  )
}
