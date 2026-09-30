'use client'
import { useMemo, useState, useTransition } from 'react'
import { lerPlanilha } from '@/lib/importacao'
import type { ResultadoImportacao } from '../acoes'

// Excel no Brasil costuma salvar CSV em Windows-1252; tenta UTF-8 primeiro.
async function lerArquivo(f: File): Promise<string> {
  const bytes = await f.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

const dataBr = (iso: string) => iso.split('-').reverse().join('/')

export function Importador({ importar }: { importar: (texto: string) => Promise<ResultadoImportacao> }) {
  const [texto, setTexto] = useState('')
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [enviando, iniciar] = useTransition()
  const leitura = useMemo(() => (texto.trim() ? lerPlanilha(texto) : null), [texto])

  function trocar(t: string) {
    setTexto(t)
    setResultado(null)
  }

  if (resultado?.linhas) {
    const ok = resultado.linhas.filter((l) => l.ok).length
    return (
      <section className="cartao">
        <h2 style={{ marginTop: 0 }}>Resultado</h2>
        <p className={ok === resultado.linhas.length ? 'aviso ok' : 'aviso info'} role="status">
          {ok} de {resultado.linhas.length} linhas cadastradas. Os convites de primeiro acesso foram enviados.
        </p>
        {!!resultado.convitesComFalha?.length && (
          <p className="aviso erro">
            Falha ao enviar convite para {resultado.convitesComFalha.join(', ')}. Use &quot;Reenviar convite&quot; na lista de membros.
          </p>
        )}
        <div className="tabela">
          <table>
            <thead><tr><th>Linha</th><th>Nome</th><th>Resultado</th></tr></thead>
            <tbody>
              {resultado.linhas.map((l) => (
                <tr key={l.linha}>
                  <td>{l.linha}</td>
                  <td>{l.nome}</td>
                  <td><span className={l.ok ? 'etiqueta ok' : 'etiqueta erro'}>{l.ok ? 'ok' : 'erro'}</span> {l.mensagem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p><button type="button" className="secundario" onClick={() => trocar('')}>Importar outra planilha</button></p>
      </section>
    )
  }

  return (
    <section className="cartao formulario">
      <label>Arquivo CSV
        <input type="file" accept=".csv,.txt,text/csv" onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) trocar(await lerArquivo(f))
        }} />
      </label>
      <label>Ou cole aqui as linhas da planilha (com o cabeçalho)
        <textarea rows={6} value={texto} onChange={(e) => trocar(e.target.value)} spellCheck={false} />
      </label>

      {leitura?.erroGeral && <p className="aviso erro" role="alert">{leitura.erroGeral}</p>}
      {resultado?.erro && <p className="aviso erro" role="alert">{resultado.erro}</p>}

      {leitura && !leitura.erroGeral && (
        <>
          <h2>Conferência</h2>
          <p className="suave">Nada foi gravado ainda. Confira antes de importar.</p>
          {leitura.erros.length > 0 && (
            <div className="aviso erro">
              <strong>{leitura.erros.length} linha(s) com erro não serão importadas:</strong>
              <ul style={{ margin: '4px 0 0' }}>
                {leitura.erros.map((e) => <li key={e.linha}>Linha {e.linha}: {e.mensagem}</li>)}
              </ul>
            </div>
          )}
          {leitura.linhas.length > 0 && (
            <div className="tabela">
              <table>
                <thead><tr><th>Linha</th><th>Nome</th><th>Nascimento</th><th>E-mail</th><th>Responsável</th></tr></thead>
                <tbody>
                  {leitura.linhas.map((l) => (
                    <tr key={l.linha}>
                      <td>{l.linha}</td>
                      <td>{l.nome}{l.papel === 'adulto' && <span className="suave"> · adulto</span>}</td>
                      <td>{dataBr(l.nascimento)}</td>
                      <td>{l.email ?? <span className="suave">sem e-mail</span>}</td>
                      <td>{l.resp_nome ? `${l.resp_nome} (${l.resp_email ?? 'sem e-mail'})` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="suave">
            O banco ainda confere cada linha: menores sem responsável, pessoas já ativas nesta organização e
            papéis inválidos aparecem como erro no resultado, sem impedir as demais.
          </p>
          <button type="button" disabled={enviando || leitura.linhas.length === 0}
                  onClick={() => iniciar(async () => setResultado(await importar(texto)))}>
            {enviando ? 'Importando…' : `Importar ${leitura.linhas.length} membro(s) e enviar convites`}
          </button>
        </>
      )}
    </section>
  )
}
