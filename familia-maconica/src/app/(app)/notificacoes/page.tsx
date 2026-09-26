import Link from 'next/link'
import { clienteServidor } from '@/lib/supabase/servidor'
import { dataCurta, hora } from '@/lib/regras'
import { marcarLidas } from '../acoes'

export const metadata = { title: 'Avisos' }

type Aviso = { id: string; titulo: string; corpo: string; evento_id: string | null; enviada_em: string; lida: boolean }

export default async function Notificacoes() {
  const sb = await clienteServidor()
  const { data } = await sb.rpc('minhas_notificacoes', { p_limite: 100 })
  const avisos = (data ?? []) as Aviso[]

  return (
    <>
      <div className="linha entre">
        <h1 style={{ margin: 0 }}>Avisos</h1>
        {avisos.some((a) => !a.lida) && (
          <form action={marcarLidas}><button className="secundario pequeno">Marcar como lidos</button></form>
        )}
      </div>
      <div style={{ marginTop: 16 }}>
        {avisos.length === 0 && <p className="suave">Nenhum aviso ainda.</p>}
        {avisos.map((a) => (
          <div key={a.id} className="cartao" style={a.lida ? undefined : { borderLeft: '4px solid var(--ouro)' }}>
            <strong>{a.titulo}</strong>
            <p style={{ margin: '4px 0' }}>{a.corpo}</p>
            <p className="suave" style={{ margin: 0 }}>
              {dataCurta(a.enviada_em)} {hora(a.enviada_em)}
              {a.evento_id && <> · <Link href={`/agenda#evento-${a.evento_id}`}>ver na agenda</Link></>}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}
