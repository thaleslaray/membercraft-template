import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { pessoaLogadaNaSessao } from '#/lib/autorizacao'
import { ganchosDeProgressoComCertificado } from '#/lib/certificados-cola'
import { opcoesDeAcesso } from '#/lib/liberacao'
import { agora } from '#/lib/relogio'
import { situacaoDoConteudo } from '#/regras/acesso'
import { podeAcessarCurso } from '#/regras/acesso-ao-curso'
import {
  concluirAula,
  cursoDaAula,
  desmarcarAula,
  ErroDeProgresso,
  gravarProgresso,
  registrarAbertura,
} from '#/regras/progresso'
import { podeConcluirComQuiz } from '#/regras/quiz'

// Quiz obrigatório (#51) trava a conclusão até a aprovação; os pontos (#54) entram e saem junto e o
// certificado (#55) é conferido depois deles.
const ganchos = {
  podeConcluir: podeConcluirComQuiz,
  ...ganchosDeProgressoComCertificado,
}
const id = z.string().min(1).max(100)

// Autentica e confere o acesso ao curso da aula. Quem não tem acesso vê "aula não encontrada".
async function pessoaComAcessoA(aulaId: string) {
  const pessoa = await pessoaLogadaNaSessao()
  const db = getDb(env.DB)
  // O acesso ao curso e a situação da aula (regras de liberação, #42) só dependem do id da aula:
  // vão juntos, em vez de uma consulta esperar a outra.
  const [acesso, situacao] = await Promise.all([
    cursoDaAula(db, aulaId).then(
      (cursoId) =>
        cursoId !== null && podeAcessarCurso(db, agora, pessoa, cursoId),
    ),
    situacaoDoConteudo(
      db,
      agora,
      pessoa,
      { tipo: 'aula', id: aulaId },
      opcoesDeAcesso(db, pessoa),
    ),
  ])
  if (!acesso) throw new ErroDeProgresso('Aula não encontrada.')
  // Aula oculta ou com cadeado não abre nem grava progresso.
  if (situacao.tipo === 'oculto')
    throw new ErroDeProgresso('Aula não encontrada.')
  if (situacao.tipo === 'cadeado') {
    throw new ErroDeProgresso('Esta aula ainda não está liberada.')
  }
  return { db, userId: pessoa.id }
}

export const registrarAberturaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ aulaId: id }))
  .handler(async ({ data }) => {
    const { db, userId } = await pessoaComAcessoA(data.aulaId)
    await registrarAbertura(db, agora, userId, data.aulaId)
  })

export const gravarProgressoFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      aulaId: id,
      posicao: z.number().min(0).max(1_000_000),
      duracao: z.number().min(0).max(1_000_000),
      tempoTocando: z.number().min(0).max(1_000_000),
      terminou: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { db, userId } = await pessoaComAcessoA(data.aulaId)
    const { aulaId, ...gravacao } = data
    return gravarProgresso(db, agora, userId, aulaId, gravacao, ganchos)
  })

export const concluirAulaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ aulaId: id }))
  .handler(async ({ data }) => {
    const { db, userId } = await pessoaComAcessoA(data.aulaId)
    await concluirAula(db, agora, userId, data.aulaId, ganchos)
  })

export const desmarcarAulaFn = createServerFn({ method: 'POST' })
  .validator(z.object({ aulaId: id }))
  .handler(async ({ data }) => {
    const { db, userId } = await pessoaComAcessoA(data.aulaId)
    await desmarcarAula(db, agora, userId, data.aulaId, ganchos)
  })
