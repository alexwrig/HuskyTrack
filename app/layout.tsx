import type { Metadata } from 'next'
import { Spectral, Inter } from 'next/font/google'
import { ThemeToggle } from '@/src/components/ThemeToggle'
import './globals.css'

const spectral = Spectral({
  subsets: ['latin'],
  variable: '--font-spectral',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HuskyTrack',
  description: '529 education expense tracker, upload PDFs and generate your spreadsheet',
}

const darkScript = `try{const t=localStorage.getItem('theme');if(t==='dark'||(t===null&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch{}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${spectral.variable} ${inter.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: darkScript }} />
      </head>
      <body className="font-sans bg-stone-50 dark:bg-stone-950 min-h-screen antialiased transition-colors duration-200">
        <header className="bg-[#4B2E83] border-b-2 border-[#B7A57A]/60 text-white">
          <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight leading-none">HuskyTrack</h1>
              <p className="text-[10px] text-[#B7A57A] tracking-[0.2em] uppercase mt-1.5 font-sans font-medium">
                529 Education Expense Tracker
              </p>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-10">
          {children}
        </main>
      </body>
    </html>
  )
}
