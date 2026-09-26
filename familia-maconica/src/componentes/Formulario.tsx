'use client'
import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import type { EstadoAcao } from '@/lib/tipos'

type Acao = (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>

function Enviar({ rotulo, perigo }: { rotulo: string; perigo?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={perigo ? 'botao perigo' : 'botao'} disabled={pending}>
      {pending ? 'Enviando…' : rotulo}
    </button>
  )
}

export function Formulario({
  acao, rotulo, children, confirmar, perigo, limparAoConcluir, className,
}: {
  acao: Acao
  rotulo: string
  children?: React.ReactNode
  confirmar?: string
  perigo?: boolean
  limparAoConcluir?: boolean
  className?: string
}) {
  const [estado, despachar] = useActionState(acao, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado.ok && limparAoConcluir) ref.current?.reset()
  }, [estado, limparAoConcluir])

  return (
    <form
      ref={ref}
      action={despachar}
      className={className ?? 'formulario'}
      onSubmit={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault()
      }}
    >
      {children}
      <Enviar rotulo={rotulo} perigo={perigo} />
      {estado.erro && <p className="aviso erro" role="alert">{estado.erro}</p>}
      {estado.ok && <p className="aviso ok" role="status">{estado.ok}</p>}
    </form>
  )
}
