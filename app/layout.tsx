import type { Metadata } from 'next'
import { ThemeToggle } from '@/src/components/ThemeToggle'
import './globals.css'

export const metadata: Metadata = {
  title: 'HuskyTrack',
  description: '529 education expense tracker, upload PDFs and generate your spreadsheet',
}

// Applied before hydration to prevent dark mode flash
const darkScript = `try{const t=localStorage.getItem('theme');if(t==='dark'||(t===null&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch{}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: darkScript }} />
      </head>
      <body className="bg-stone-50 dark:bg-stone-950 min-h-screen antialiased transition-colors duration-200">
        <header className="bg-[#4B2E83] text-white shadow-lg">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="h-7 w-7 text-[#B7A57A]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" strokeWidth="2"/>
                <line x1="16" y1="13" x2="8" y2="13" stroke="white" strokeWidth="1.5"/>
                <line x1="16" y1="17" x2="8" y2="17" stroke="white" strokeWidth="1.5"/>
                <line x1="10" y1="9" x2="8" y2="9" stroke="white" strokeWidth="1.5"/>
              </svg>
              <div>
                <h1 className="text-xl font-bold tracking-tight">HuskyTrack</h1>
                <p className="text-xs text-purple-200">529 Education Expense Tracker</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
