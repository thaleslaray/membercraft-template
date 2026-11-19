// Uma server function por página do aluno (aula, curso, Início): o loader faz UM pedido ao servidor e
// o servidor reúne tudo com Promise.all, perto do D1. Cada pedido do navegador custa a viagem inteira
// (no teste, ~0,3 s), então o que pesa é o número de rodadas em fila, não o de consultas.
//
// Aqui só se junta o que já existe: as regras de acesso e de leitura são as mesmas das funções
// avulsas (`conteudo-fns`, `progresso-fns`...), que continuam valendo para quem as chama sozinhas.
import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '#/db/index'
import { pessoaLogadaNaSessao } from '#/lib/autorizacao'
import {
  carregarAula,
  carregarCurso,
  carregarVitrine,
} from '#/lib/conteudo-fns'
import { situacoesDaPessoa } from '#/lib/liberacao'
import { agora } from '#/lib/relogio'
import { aulasLiberadas } from '#/regras/acesso'
import { cursosAcessiveis } from '#/regras/acesso-ao-curso'
import { lerAvaliacao } from '#/regras/avaliacoes'
import { bannersParaOAluno } from '#/regras/banners'
import { certificadoDoCurso, certificadosDoAluno } from '#/regras/certificados'
import { colegasDaSemana } from '#/regras/colegas'
import { listarComentarios } from '#/regras/comentarios'
import { favoritasEntre, listarFavoritos } from '#/regras/favoritos'
import { montarMeusCursos, proximaAulaParaEstudar } from '#/regras/meus-cursos'
import { podeFazer } from '#/regras/permissoes'
import {
  dadosDeProgressoDosCursos,
  lerProgressoDaAula,
  progressoDoCurso,
} from '#/regras/progresso'
import { obterQuizDoAluno } from '#/regras/quiz'

const id = z.string().min(1).max(100)

// Aula: a aula com o cadeado, o progresso, o passo do curso, os favoritos, o quiz e, para os
// componentes que antes buscavam depois de montar, a nota dada e a primeira página de comentários.
// O acesso (curso, oculto, cadeado) é conferido UMA vez, ao carregar a aula; o resto só lê.
export const paginaDaAulaFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id, como: id.optional() }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    const carregada = await carregarAula(db, pessoa, data)
    if (!carregada) return null
    const { aula, mapa } = carregada
    // Aula com cadeado: só o motivo; não há progresso, vídeo, quiz nem comentários a buscar.
    if (aula.situacao.tipo === 'cadeado') {
      return {
        ...aula,
        progresso: null,
        concluidas: [] as string[],
        favoritas: [] as string[],
        quiz: null,
        avaliacao: null,
        comentarios: null,
        colegas: null,
      }
    }
    const [progresso, passo, favoritas, quiz, avaliacao, comentarios, colegas] =
      await Promise.all([
        lerProgressoDaAula(db, pessoa.id, data.id),
        progressoDoCurso(db, pessoa.id, aula.curso.id, aulasLiberadas(mapa)),
        favoritasEntre(
          db,
          pessoa.id,
          aula.sequencia.map((a) => a.id),
        ),
        obterQuizDoAluno(db, pessoa.id, data.id),
        lerAvaliacao(db, pessoa.id, data.id),
        listarComentarios(db, pessoa, data.id, 1),
        // Uma contagem agregada, em paralelo com o resto: nenhuma rodada a mais.
        colegasDaSemana(db, agora, data.id, pessoa.id),
      ])
    return {
      ...aula,
      colegas,
      progresso,
      concluidas: passo.concluidas,
      favoritas,
      quiz,
      avaliacao,
      comentarios: {
        ...comentarios,
        ehEquipe: podeFazer(pessoa.perfil, 'usar-estudio'),
      },
    }
  })

// Curso: o curso com o cadeado, o passo (botão Começar/Continuar), os favoritos e o certificado.
export const paginaDoCursoFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id, como: id.optional() }))
  .handler(async ({ data }) => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    const carregado = await carregarCurso(db, pessoa, data)
    if (!carregado) return null
    const { curso, mapa } = carregado
    const [passo, favoritas, certificado] = await Promise.all([
      progressoDoCurso(db, pessoa.id, data.id, aulasLiberadas(mapa)),
      favoritasEntre(
        db,
        pessoa.id,
        curso.modulos.flatMap((m) => m.aulas.map((a) => a.id)),
      ),
      // Quem vê o curso "como aluno" (Equipe) não tem certificado a mostrar.
      data.como
        ? Promise.resolve({ tipo: 'sem-certificado' as const })
        : certificadoDoCurso(db, pessoa.id, data.id),
    ])
    return { ...curso, passo, favoritas, certificado }
  })

// Meus cursos (o Início): os cursos por situação, o destaque "Continuar", até 6 aulas salvas, os
// certificados com a prévia e o primeiro banner que vale para a aluna.
export const paginaDoInicioFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    const [vitrine, banners, acessiveis] = await Promise.all([
      carregarVitrine(db, pessoa),
      bannersParaOAluno(db, agora, pessoa.id),
      cursosAcessiveis(db, agora, pessoa),
    ])
    const cursos = vitrine.flatMap((g) => g.cursos)
    const meus = cursos.filter((c) => !c.bloqueado).map((c) => c.id)
    const [dados, mapa, favoritos, certificados] = await Promise.all([
      dadosDeProgressoDosCursos(db, pessoa.id, meus),
      situacoesDaPessoa(db, agora, pessoa, meus),
      listarFavoritos(db, pessoa.id, acessiveis),
      certificadosDoAluno(db, pessoa.id),
    ])
    const liberadas = aulasLiberadas(mapa)
    const { grupos, destaque } = montarMeusCursos(cursos, dados, liberadas)
    const emitidos = certificados.filter((c) => c.situacao !== 'revogado')
    const previas = emitidos.map((c) => ({
      id: c.id,
      cursoNome: c.cursoNome,
      nome: c.nome,
      codigo: c.codigo,
      concluidoEm: c.concluidoEm,
      modelo: c.modelo,
    }))
    return {
      grupos,
      destaque,
      temCurso: meus.length > 0,
      // As que as regras de liberação ocultam não aparecem (#42), como na página de favoritos.
      favoritas: favoritos
        .filter((f) => mapa.aulas.get(f.aulaId)?.tipo !== 'oculto')
        .slice(0, 6),
      certificados: previas.filter((c) => c.modelo !== null),
      banner: banners[0] ?? null,
      // Quem não tem curso vê todos como vitrine da escola (Início sem curso, casca Lume).
      banners,
    }
  },
)

// "Continuar estudando" das telas vazias (certificados, pontos, ranking): a aula para onde o botão leva,
// ou nulo quando não há o que estudar (o botão vai a Meus cursos). Mesma regra do destaque do Início.
export const continuarEstudandoFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const pessoa = await pessoaLogadaNaSessao()
    const db = getDb(env.DB)
    const vitrine = await carregarVitrine(db, pessoa)
    const cursos = vitrine.flatMap((g) => g.cursos)
    const meus = cursos.filter((c) => !c.bloqueado).map((c) => c.id)
    const [dados, mapa] = await Promise.all([
      dadosDeProgressoDosCursos(db, pessoa.id, meus),
      situacoesDaPessoa(db, agora, pessoa, meus),
    ])
    const { grupos, destaque } = montarMeusCursos(
      cursos,
      dados,
      aulasLiberadas(mapa),
    )
    return { aulaId: proximaAulaParaEstudar({ destaque, grupos }) }
  },
)
