'use client'
import { useState, useTransition } from 'react'
import { desligarLinkAgenda, gerarLinkAgenda } from '@/app/(app)/acoes'

type Urls = { https: string; webcal: string; google: string }
type Atual = { criado_em: string; usado_em: string | null } | null

const data = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export function AgendaNoCelular({ atual }: { atual: Atual }) {
  const [urls, setUrls] = useState<Urls | null>(null)
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [pendente, iniciar] = useTransition()

  function gerar() {
    if (atual && !confirm('Gerar um novo link desliga o anterior. Os calendários que usam o link antigo param de atualizar. Continuar?')) return
    setMsg(null)
    iniciar(async () => {
      const r = await gerarLinkAgenda()
      if (r.erro) setMsg({ erro: r.erro })
      else setUrls(r.urls!)
    })
  }

  function desligar() {
    if (!confirm('Desligar o link? O calendário do celular deixa de receber a agenda.')) return
    iniciar(async () => {
      setUrls(null)
      setMsg(await desligarLinkAgenda())
    })
  }

  async function copiar() {
    if (!urls) return
    try {
      await navigator.clipboard.writeText(urls.https)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div className="formulario">
      <p className="suave" style={{ margin: 0 }}>
        Os eventos da sua agenda (e dos seus dependentes) aparecem sozinhos no Google Agenda ou no calendário do
        iPhone, com título, horário e local. As mudanças chegam em algumas horas; o app continua sendo o aviso oficial.
      </p>
      <p className="aviso info">
        Quem tiver o link vê sua agenda: não compartilhe. Os títulos ficam guardados no Google ou na Apple.
      </p>

      {urls ? (
        <>
          <p className="aviso ok">Link criado. Ele só aparece agora: adicione ao calendário antes de sair desta página.</p>
          <div className="linha">
            <a className="botao" href={urls.google} target="_blank" rel="noopener noreferrer">Adicionar ao Google Agenda</a>
            <a className="botao secundario" href={urls.webcal}>Adicionar ao iPhone ou Mac</a>
          </div>
          <label>Ou copie o link para outro calendário
            <input readOnly value={urls.https} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <div className="linha">
            <button type="button" className="secundario pequeno" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar link'}</button>
          </div>
        </>
      ) : atual ? (
        <p style={{ margin: 0 }}>
          Link ligado desde {data(atual.criado_em)}.{' '}
          <span className="suave">{atual.usado_em ? `Último acesso de um calendário: ${data(atual.usado_em)}.` : 'Nenhum calendário usou o link ainda.'}</span>
        </p>
      ) : null}

      <div className="linha">
        <button type="button" onClick={gerar} disabled={pendente} className={urls || atual ? 'secundario' : undefined}>
          {pendente ? 'Aguarde…' : atual || urls ? 'Gerar novo link' : 'Ligar agenda no celular'}
        </button>
        {(atual || urls) && (
          <button type="button" className="perigo" onClick={desligar} disabled={pendente}>Desligar</button>
        )}
      </div>
      {msg?.erro && <p className="aviso erro">{msg.erro}</p>}
      {msg?.ok && <p className="aviso ok">{msg.ok}</p>}
    </div>
  )
}
