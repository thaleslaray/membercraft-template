import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { exigirPermissaoNaSessao } from '#/lib/autorizacao'
import { avisarCursosLiberados } from '#/lib/email-cola'
import { agora } from '#/lib/relogio'
import {
  listarConferencias,
  matricularPendentes,
  obterConferencia,
  registrarConferencia,
} from '#/regras/conferencia-de-vendas'
import { interpretarVendas, lerPlanilha } from '#/regras/planilha-voomp'
import type { Banco } from '#/regras/tipos'

const coluna = z.string().max(100).optional()

function bytesDeBase64(base64: string): Uint8Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

// O histórico e a conferência aberta não dependem um do outro: vão juntos (exportada para o teste de idas).
export async function carregarConferenciaDaTela(
  db: Banco,
  data: { id?: string; pagina?: number },
) {
  const [historico, atual] = await Promise.all([
    listarConferencias(db, data.pagina),
    data.id ? obterConferencia(db, data.id) : null,
  ])
  return { historico, atual }
}

// A Conferência de vendas é da Equipe (`gerir-matriculas`), como a tela Vendas da Voomp.
export const conferenciaDaTelaFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      id: z.string().max(100).optional(),
      pagina: z.number().int().min(1).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirPermissaoNaSessao('gerir-matriculas')
    return carregarConferenciaDaTela(getDb(env.DB), data)
  })

// A planilha vai em base64 (o XLSX é binário); uma exportação semanal cabe folgada no limite.
export const conferirPlanilhaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      nome: z.string().min(1).max(200),
      base64: z.string().min(1).max(8_000_000),
      colunas: z
        .object({
          vendaId: coluna,
          email: coluna,
          nome: coluna,
          produtoId: coluna,
          produtoNome: coluna,
          ofertaHash: coluna,
          status: coluna,
        })
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-matriculas')
    const tabela = await lerPlanilha(bytesDeBase64(data.base64))
    const planilha = interpretarVendas(tabela, data.colunas)
    const r = await registrarConferencia(getDb(env.DB), agora, {
      autorId: sessao.user.id,
      arquivoNome: data.nome,
      planilha,
    })
    return { id: r.id }
  })

export const matricularConferenciaFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      conferenciaId: z.string().min(1).max(100),
      vendaIds: z.array(z.string().max(100)).max(1000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const sessao = await exigirPermissaoNaSessao('gerir-matriculas')
    return matricularPendentes(
      getDb(env.DB),
      agora,
      {
        conferenciaId: data.conferenciaId,
        autorId: sessao.user.id,
        vendaIds: data.vendaIds,
      },
      { aoLiberarCursos: (eventos) => avisarCursosLiberados(env, eventos) },
    )
  })
