import { importarMembros } from '../acoes'
import { Importador } from './Importador'

export const metadata = { title: 'Importar membros' }
// Até 300 linhas, cada uma com cadastro e convite por e-mail.
export const maxDuration = 300

export default async function ImportarMembros({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  return (
    <>
      <h2>Importar membros de uma planilha</h2>
      <p>
        Salve a planilha como <strong>CSV</strong> (no Excel: Arquivo → Salvar como → CSV) e escolha o arquivo, ou
        copie as células e cole abaixo. A primeira linha precisa ter os nomes das colunas.
      </p>
      <p>
        Obrigatórias: <strong>nome</strong> e <strong>nascimento</strong> (dd/mm/aaaa). Opcionais: e-mail, celular, id
        oficial, papel (membro ou adulto) e, para menores de 18, responsável, e-mail do responsável, celular do
        responsável e parentesco. <a href="/modelo-membros.csv" download>Baixar modelo</a>
      </p>
      <Importador importar={importarMembros.bind(null, org)} />
    </>
  )
}
