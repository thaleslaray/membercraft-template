import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { pessoaLogadaNaSessao } from '#/lib/autorizacao'
import { situacoesDaPessoa } from '#/lib/liberacao'
import { agora } from '#/lib/relogio'
import { cursosAcessiveis } from '#/regras/acesso-ao-curso'
import { buscaRapida, ultimasAulasAbertas } from '#/regras/busca-rapida'
import { type SituacaoDoConteudo, textoDoCadeado } from '#/regras/cadeado'
import { listarCursos } from '#/regras/conteudo'
import { trechosDeTranscricao } from '#/regras/transcricoes'

// O que a pessoa pode ver (cursos de matrícula ativa) e as regras de liberação (#42): oculto fora,
// cadeado com motivo. Igual ao da página de busca. `como` (turma) é o "ver como aluno" da Equipe.
async function contextoDaPessoa(como?: string) {
  const pessoa = await pessoaLogadaNaSessao()
  const db = getDb(env.DB)
  const cursosPermitidos = await cursosAcessiveis(db, agora, pessoa)
  const mapa = await situacoesDaPessoa(
    db,
    agora,
    pessoa,
    cursosPermitidos === 'todos'
      ? (await listarCursos(db)).map((c) => c.id)
      : cursosPermitidos,
    como,
  )
  const motivo = (s: SituacaoDoConteudo | undefined) =>
    s?.tipo === 'cadeado' ? textoDoCadeado(s, pessoa.fuso) : null
  return {
    db,
    userId: pessoa.id,
    cursosPermitidos,
    bloqueioDaAula: (id: string) => motivo(mapa.aulas.get(id)),
    bloqueioDoModulo: (id: string) => motivo(mapa.modulos.get(id)),
    aulaOculta: (id: string) => mapa.aulas.get(id)?.tipo === 'oculto',
    moduloOculto: (id: string) => mapa.modulos.get(id)?.tipo === 'oculto',
  }
}

export const buscaRapidaFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({ termo: z.string().max(200), como: z.string().optional() }),
  )
  .handler(async ({ data }) => {
    const { db, ...contexto } = await contextoDaPessoa(data.como)
    return buscaRapida(db, {
      ...contexto,
      termo: data.termo,
      trechosExtras: trechosDeTranscricao(db, data.termo),
    })
  })

export const ultimasAulasAbertasFn = createServerFn({ method: 'GET' })
  .validator(z.object({ como: z.string().optional() }))
  .handler(async ({ data }) => {
    const { db, ...contexto } = await contextoDaPessoa(data.como)
    return ultimasAulasAbertas(db, contexto)
  })
