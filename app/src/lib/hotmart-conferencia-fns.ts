import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { rodarConferenciaHotmart } from '#/lib/conferencia-hotmart-cola'
import { listarConferenciasHotmart } from '#/regras/conferencia-hotmart'
import { ErroDaHotmart } from '#/regras/hotmart-api'

// Só o Proprietário (`gerir-credenciais-da-hotmart`): o registro do que a conferência recuperou.
export const conferenciasDaHotmartFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  await exigirPermissaoNaSessao('gerir-credenciais-da-hotmart')
  return listarConferenciasHotmart(getDb(env.DB))
})

// "Conferir agora": a mesma conferência do cron, disparada à mão. Nunca lança: o resultado vai em texto.
export const conferirAgoraDaHotmartFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  await exigirPermissaoNaSessao('gerir-credenciais-da-hotmart')
  try {
    const r = await rodarConferenciaHotmart(env, 'manual')
    if (!r) {
      return { ok: false, mensagem: 'Salve as credenciais antes de conferir.' }
    }
    return {
      ok: true,
      mensagem: `Conferência feita: ${r.recuperadas} recuperada(s), ${r.jaProcessadas} já processada(s).`,
    }
  } catch (e) {
    return {
      ok: false,
      mensagem:
        e instanceof ErroDaHotmart
          ? e.message
          : 'A conferência falhou. Veja o registro abaixo.',
    }
  }
})
