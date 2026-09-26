import Link from 'next/link'
import { BotoesResposta } from './BotoesResposta'
import { NOME_TIPO_EVENTO, dataCurta, hora } from '@/lib/regras'
import type { EventoAgenda } from '@/lib/tipos'

export function CartaoEvento({ e }: { e: EventoAgenda }) {
  return (
    <article className={e.cancelado ? 'cartao cancelado' : 'cartao'} id={`evento-${e.id}`}>
      <div className="linha entre">
        <strong className="titulo">{e.titulo}</strong>
        <span className="linha">
          <span className="etiqueta">{NOME_TIPO_EVENTO[e.tipo]}</span>
          {e.publico && <span className="etiqueta ouro">Público</span>}
          {e.cancelado && <span className="etiqueta erro">Cancelado</span>}
        </span>
      </div>
      <p className="suave" style={{ margin: '4px 0' }}>
        {dataCurta(e.inicio)} · {hora(e.inicio)}–{hora(e.fim)}
        {e.local && <> · {e.local}</>}
      </p>
      <p className="suave" style={{ margin: '4px 0' }}>
        {e.organizacoes.length > 1 ? e.organizacoes.join(' · ') : e.organizacao}
      </p>
      {e.descricao && <p style={{ margin: '6px 0' }}>{e.descricao}</p>}
      {!e.cancelado && e.respostas.length > 0 && (
        <BotoesResposta eventoId={e.id} tipo={e.tipo} respostas={e.respostas} />
      )}
      <div className="linha" style={{ marginTop: 6 }}>
        {e.publico && !e.cancelado && <Link className="suave" href={`/e/${e.id}`}>Link público</Link>}
        {e.eh_secretaria && (
          <Link className="suave" href={`/secretaria/${e.organizacao_id}/agenda/${e.id}`}>Gerenciar</Link>
        )}
      </div>
    </article>
  )
}
