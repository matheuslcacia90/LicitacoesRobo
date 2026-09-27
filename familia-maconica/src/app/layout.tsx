import type { Metadata, Viewport } from 'next'
import { RegistrarSW } from '@/componentes/RegistrarSW'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Família Maçônica', template: '%s · Família Maçônica' },
  description: 'Agenda do templo, cargos e avisos da Loja, DeMolay, Escudeiros e Filhas de Jó.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icones/icone.svg', apple: '/icones/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Família', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#1f3a5f',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <RegistrarSW />
      </body>
    </html>
  )
}
