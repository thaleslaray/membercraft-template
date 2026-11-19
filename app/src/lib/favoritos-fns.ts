import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { pessoaLogadaNaSessao } from '#/lib/autorizacao'
import { situacoesDaPessoa } from '#/lib/liberacao'
import { agora } from '#/lib/relogio'
import { cursosAcessiveis } from '#/regras/acesso-ao-curso'
import { buscar } from '#/regras/busca'
import { FILTROS_DA_BUSCA } from '#/regras/busca-filtros'
import { type SituacaoDoConteudo, textoDoCadeado } from '#/regras/cadeado'
import { listarCursos } from '#/regras/conteudo'
import { desfavoritar, favoritar, listarFavoritos } from '#/regras/favoritos'
import { trechosDeTranscricao } from '#/regras/transcricoes'

const id = z.string().min(1).max(100)

export const alternarFavoritoFn = createServerFn({ method: 'POST' })
  .validator(z.object({ aulaId: id, favorita: z.boolean() }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    if (data.favorita) await favoritar(db, agora, pessoa, data.aulaId)
    else await desfavoritar(db, pessoa.id, data.aulaId)
    return data.favorita
  })

export const favoritosFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    const acessiveis = await cursosAcessiveis(db, agora, pessoa)
    const favoritos = await listarFavoritos(db, pessoa.id, acessiveis)
    // O que as regras de liberação ocultam não aparece (#42).
    const mapa = await situacoesDaPessoa(db, agora, pessoa, [
      ...new Set(favoritos.map((f) => f.cursoId)),
    ])
    return favoritos.filter((f) => mapa.aulas.get(f.aulaId)?.tipo !== 'oculto')
  },
)

export const buscaFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      termo: z.string().max(200),
      filtro: z.enum(FILTROS_DA_BUSCA),
      como: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    const cursosPermitidos = await cursosAcessiveis(db, agora, pessoa)
    // Cadeado com motivo nas aulas bloqueadas e o oculto fora dos resultados (#42).
    const mapa = await situacoesDaPessoa(
      db,
      agora,
      pessoa,
      cursosPermitidos === 'todos'
        ? (await listarCursos(db)).map((c) => c.id)
        : cursosPermitidos,
      data.como,
    )
    const motivo = (s: SituacaoDoConteudo | undefined) =>
      s?.tipo === 'cadeado' ? textoDoCadeado(s, pessoa.fuso) : null
    return buscar(db, {
      userId: pessoa.id,
      cursosPermitidos,
      bloqueioDaAula: (id) => motivo(mapa.aulas.get(id)),
      bloqueioDoModulo: (id) => motivo(mapa.modulos.get(id)),
      aulaOculta: (id) => mapa.aulas.get(id)?.tipo === 'oculto',
      moduloOculto: (id) => mapa.modulos.get(id)?.tipo === 'oculto',
      trechosExtras: trechosDeTranscricao(db, data.termo),
      termo: data.termo,
      filtro: data.filtro,
    })
  })
