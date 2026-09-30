'use client'
import { useEffect, useState } from 'react'
import { clienteNavegador } from '@/lib/supabase/navegador'

// Links de e-mail no modelo padrão do Supabase (sem SMTP próprio) e convites
// feitos pelo painel devolvem a sessão no fragmento da URL
// (#access_token=…&refresh_token=…), que o servidor não enxerga. Este
// componente grava a sessão pelo navegador e segue para criar a senha.
export function CapturarSessao({ obrigatorio = false }: { obrigatorio?: boolean }) {
  const [erro, setErro] = useState(false)

  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1))
    const access = p.get('access_token')
    const refresh = p.get('refresh_token')
    if (p.get('error') || p.get('error_code')) {
      window.location.replace('/entrar?link=expirado')
      return
    }
    if (!access || !refresh) {
      if (obrigatorio) window.location.replace('/entrar?link=expirado')
      return
    }
    clienteNavegador().auth.setSession({ access_token: access, refresh_token: refresh }).then(({ error }) => {
      if (error) setErro(true)
      else window.location.replace('/primeiro-acesso')
    })
  }, [obrigatorio])

  if (erro) return <p className="aviso erro" role="alert">Não foi possível validar o link. Peça um novo convite ou use “Esqueci a senha”.</p>
  return obrigatorio ? <p className="suave">Validando o link…</p> : null
}
