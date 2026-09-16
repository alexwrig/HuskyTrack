'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Guest {
  id: string
  email: string
  email_verified_at: string | null
  created_at: string
}

export default function AdminPage() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const fetchGuests = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/guests')
      if (!res.ok) throw new Error('Failed to load guests')
      setGuests(await res.json() as Guest[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load guests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchGuests() }, [fetchGuests])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/guests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json() as Guest & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to add guest')
      setEmail('')
      await fetchGuests()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add guest')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (guest: Guest) => {
    if (!confirm(`Remove ${guest.email}? This immediately signs them out and revokes access.`)) return
    setRemovingId(guest.id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/guests/${guest.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'Failed to remove guest')
      }
      setGuests((prev) => prev.filter((g) => g.id !== guest.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove guest')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8 animate-fade-in-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-stone-900 dark:text-stone-100">
          Admin
        </h1>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
          Manage who can sign in to HuskyTrack. Guests see the same shared data as you.
        </p>
      </div>

      <form
        onSubmit={handleAdd}
        className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm p-6 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
            Add a guest
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="someone@example.com"
              className="flex-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:border-[#4B2E83] focus:ring-1 focus:ring-[#4B2E83] outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={adding || !email.trim()}
              className="rounded-lg bg-[#4B2E83] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d2569] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-800">
          <h2 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
            Guests
          </h2>
        </div>
        {loading ? (
          <p className="px-6 py-8 text-center text-sm text-stone-400 dark:text-stone-600">Loading...</p>
        ) : guests.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-stone-400 dark:text-stone-600">No guests yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {guests.map((g) => (
              <li key={g.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{g.email}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    {g.email_verified_at ? 'Signed in' : 'Invited, not yet signed in'}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(g)}
                  disabled={removingId === g.id}
                  className="shrink-0 rounded-lg border border-stone-300 dark:border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-800 hover:text-red-700 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                >
                  {removingId === g.id ? 'Removing...' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/" className="text-sm text-[#4B2E83] dark:text-purple-400 hover:underline w-fit">
        ← Back to HuskyTrack
      </Link>
    </div>
  )
}
