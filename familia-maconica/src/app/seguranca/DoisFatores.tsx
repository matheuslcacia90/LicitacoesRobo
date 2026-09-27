'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clienteNavegador } from '@/lib/supabase/navegador'

type Fase =
  | { tipo: 'carregando' }
  | { tipo: 'cadastrar'; fatorId: string; qr: string; segredo: string }
  | { tipo: 'verificar'; fatorId: string }
  | { tipo: 'pronto' }

export function DoisFatores({ obrigatoria }: { obrigatoria: boolean }) {
  const sb = clienteNavegador()
  const router = useRouter()
  const [fase, setFase] = useState<Fase>({ tipo: 'carregando' })
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: nivel } = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
      const { data: fatores } = await sb.auth.mfa.listFactors()
      const verificado = fatores?.totp.find((f) => f.status === 'verified')
      if (verificado) {
        setFase(nivel?.currentLevel === 'aal2' ? { tipo: 'pronto' } : { tipo: 'verificar', fatorId: verificado.id })
        return
      }
      // Remove cadastros antigos não concluídos antes de criar outro.
      for (const f of fatores?.all ?? []) {
        if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Autenticador' })
      if (error || !data) { setErro('Não foi possível iniciar o cadastro. Recarregue a página.'); return }
      setFase({ tipo: 'cadastrar', fatorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    if (fase.tipo !== 'cadastrar' && fase.tipo !== 'verificar') return
    setErro(null)
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: fase.fatorId, code: codigo.trim() })
    if (error) { setErro('Código inválido. Confira o horário do celular e tente de novo.'); return }
    setFase({ tipo: 'pronto' })
    router.push('/')
    router.refresh()
  }

  if (fase.tipo === 'carregando') return <p className="suave">{erro ?? 'Carregando…'}</p>
  if (fase.tipo === 'pronto') {
    return (
      <>
        <p className="aviso ok">Verificação em duas etapas ativa.</p>
        <p><a href="/">Continuar</a></p>
      </>
    )
  }
  return (
    <>
    <form className="formulario" onSubmit={confirmar}>
      {fase.tipo === 'cadastrar' && (
        <>
          <p>1. Abra um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…) e leia o código:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qr" src={fase.qr} alt="QR code para o aplicativo autenticador" />
          <p className="suave">Ou digite a chave: <code style={{ wordBreak: 'break-all' }}>{fase.segredo}</code></p>
          <p>2. Digite o código de 6 dígitos que aparece no aplicativo:</p>
        </>
      )}
      {fase.tipo === 'verificar' && <p>Digite o código de 6 dígitos do seu aplicativo autenticador:</p>}
      <input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
             value={codigo} onChange={(e) => setCodigo(e.target.value)} required aria-label="Código" />
      <button type="submit">Confirmar</button>
      {erro && <p className="aviso erro">{erro}</p>}
    </form>
    {obrigatoria && (
      <form action="/sair" method="post" style={{ marginTop: 12 }}><button className="secundario">Sair</button></form>
    )}
    </>
  )
}
