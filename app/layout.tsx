import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pythia — Prediction Market Options',
  description: 'Trade options on prediction market probabilities. The first options layer built on Polymarket YES%.',
  keywords: ['prediction markets', 'options', 'polymarket', 'probability', 'trading'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..700;1,14..32,300..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-bg text-zinc-100 min-h-screen">
        {children}
      </body>
    </html>
  )
}
