'use client'
import { useState, useTransition } from 'react'
import { responderEvento } from '@/app/(app)/acoes'
import { NOME_RESPOSTA, respostasPossiveis } from '@/lib/regras'
import type { RespostaAgenda, TipoEvento } from '@/lib/tipos'

export function BotoesResposta({ eventoId, tipo, respostas }: {
  eventoId: string
  tipo: TipoEvento
  respostas: RespostaAgenda[]
}) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const opcoes = respostasPossiveis(tipo)

  return (
    <div className="formulario" style={{ gap: 6 }}>
      {respostas.map((r) => (
        <div key={r.pessoa_id} className="linha">
          {respostas.length > 1 && <span className="suave">{r.eu ? 'Eu' : r.nome.split(' ')[0]}:</span>}
          {opcoes.map((op) => (
            <button
              key={op}
              type="button"
              className={r.resposta === op ? 'pequeno' : 'pequeno secundario'}
              aria-pressed={r.resposta === op}
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  const res = await responderEvento(eventoId, r.pessoa_id, op)
                  setErro(res.erro ?? null)
                })
              }
            >
              {NOME_RESPOSTA[op]}
            </button>
          ))}
        </div>
      ))}
      {erro && <p className="aviso erro">{erro}</p>}
    </div>
  )
}
