'use client'

import { useRouter } from 'next/navigation'

export function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs text-[#B7A57A] hover:text-white transition-colors font-medium tracking-wide uppercase"
    >
      Sign out
    </button>
  )
}
