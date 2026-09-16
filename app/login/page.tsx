'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Step = 'email' | 'code'

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }
      setStep('code')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Invalid code')
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[65vh]">
      <div className="w-full max-w-sm flex flex-col gap-8 animate-fade-in-up">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold text-stone-900 dark:text-stone-100">
            HuskyTrack
          </h1>
          <p className="text-[10px] text-[#B7A57A] tracking-[0.2em] uppercase mt-2 font-medium">
            529 Education Expense Tracker
          </p>
        </div>

        {step === 'email' ? (
          <form
            onSubmit={handleRequestCode}
            className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm p-6 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                placeholder="you@example.com"
                className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:border-[#4B2E83] focus:ring-1 focus:ring-[#4B2E83] outline-none transition-colors"
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email}
              className="rounded-lg bg-[#4B2E83] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3d2569] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Sending code...' : 'Send sign-in code'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleVerifyCode}
            className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm p-6 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                6-digit code
              </label>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Sent to {email}, if that address is registered.
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
                placeholder="123456"
                className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-center text-lg tracking-[0.3em] text-stone-900 dark:text-stone-100 placeholder:text-stone-400 placeholder:tracking-[0.3em] focus:border-[#4B2E83] focus:ring-1 focus:ring-[#4B2E83] outline-none transition-colors"
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="rounded-lg bg-[#4B2E83] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3d2569] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Verifying...' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('email'); setCode(''); setError('') }}
              className="text-xs text-stone-500 dark:text-stone-400 hover:text-[#4B2E83] dark:hover:text-purple-400 transition-colors"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
