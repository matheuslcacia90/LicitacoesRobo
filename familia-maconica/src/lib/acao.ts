import 'server-only'
import { revalidatePath } from 'next/cache'
import { mensagemErro } from './regras'
import type { EstadoAcao } from './tipos'

// Executa uma ação de formulário e devolve um estado para a interface.
export async function executar(
  fn: () => Promise<string | void>,
  revalidar: string | string[] = [],
): Promise<EstadoAcao> {
  try {
    const ok = await fn()
    for (const p of Array.isArray(revalidar) ? revalidar : [revalidar]) revalidatePath(p)
    return { ok: ok || 'Feito.' }
  } catch (e) {
    return { erro: mensagemErro(e) }
  }
}

// Lança o erro do Supabase para que executar() o transforme em mensagem.
export function checar<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error
  return r.data
}

export function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? '').trim()
}

export function opcional(fd: FormData, campo: string): string | null {
  return texto(fd, campo) || null
}
