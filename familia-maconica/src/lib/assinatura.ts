import 'server-only'
import { createHash, randomBytes } from 'node:crypto'

// O link leva 32 bytes aleatórios; o banco guarda só o SHA-256 deles.
export function novoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const TOKEN_VALIDO = /^[A-Za-z0-9_-]{43}$/

export function urlsDaAssinatura(token: string, site = process.env.NEXT_PUBLIC_SITE_URL ?? '') {
  const https = `${site.replace(/\/$/, '')}/calendario/${token}.ics`
  const webcal = https.replace(/^https?:\/\//, 'webcal://')
  return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` }
}
