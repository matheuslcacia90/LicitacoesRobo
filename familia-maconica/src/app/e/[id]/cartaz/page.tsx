import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { buscarEventoPublico } from '@/lib/eventoPublico'
import { dataPorExtenso, hora } from '@/lib/regras'
import { BotaoImprimir } from './BotaoImprimir'


export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const e = await buscarEventoPublico((await params).id)
  return e ? { title: `Cartaz — ${e.titulo}` } : {}
}

// Cartaz A4 para imprimir ou mandar em PDF: dados do evento público e um
// QR code que abre a página do evento (com o botão de adicionar à agenda).
export default async function Cartaz({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const e = await buscarEventoPublico(id)
  if (!e) notFound()

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${(await headers()).get('host')}`
  const link = `${site}/e/${id}`
  const qr = await QRCode.toString(link, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm; }
        .cartaz { max-width: 180mm; margin: 24px auto; padding: 24px; text-align: center;
                  background: #fff; color: #14212e; border: 1px solid #d8dee6; border-radius: 12px; }
        .cartaz h1 { font-size: 3.2rem; line-height: 1.15; margin: 12px 0 20px; color: #14212e; }
        .cartaz .orgs { font-size: 1.3rem; letter-spacing: .02em; color: #52606d; margin: 0; }
        .cartaz .quando { font-size: 1.8rem; margin: 4px 0; }
        .cartaz .onde { font-size: 1.5rem; margin: 24px 0; }
        .cartaz .descricao { font-size: 1.35rem; white-space: pre-line; margin: 16px auto; max-width: 150mm; }
        .cartaz .qr { width: 60mm; height: 60mm; margin: 28px auto 8px; }
        .cartaz .qr svg { width: 100%; height: 100%; }
        .cartaz .link { font-size: 1rem; color: #52606d; word-break: break-all; margin: 0; }
        .acoes-cartaz { text-align: center; margin: 16px; }
        @media print {
          body { background: #fff !important; }
          .acoes-cartaz { display: none; }
          .cartaz { border: none; margin: 0 auto; padding: 0; min-height: 265mm;
                    display: flex; flex-direction: column; justify-content: center; }
        }
      `}</style>
      <div className="acoes-cartaz"><BotaoImprimir /></div>
      <article className="cartaz">
        <p className="orgs">{e.organizacoes.join(' · ')}</p>
        <h1>{e.titulo}</h1>
        <p className="quando">{dataPorExtenso(e.inicio)}</p>
        <p className="quando">{hora(e.inicio)} às {hora(e.fim)}</p>
        {e.local && <p className="onde"><strong>{e.local}</strong>{e.endereco && <><br />{e.endereco}</>}</p>}
        {e.descricao && <p className="descricao">{e.descricao}</p>}
        <div className="qr" role="img" aria-label="QR code com o link do evento" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="link">Aponte a câmera do celular para ver o evento e salvar na agenda<br />{link}</p>
      </article>
    </>
  )
}
