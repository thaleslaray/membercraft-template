import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import { avaliarAula } from '#/regras/avaliacoes'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { exportarCsv } from '#/regras/exportacao-csv'
import { listarAcoes } from '#/regras/registro-de-acoes'
import { ErroDeRelatorio } from '#/regras/relatorios'
import { criarBancoDeTeste } from '#/test/banco'

const D = (texto: string) => new Date(texto)
const agora = () => D('2026-06-15T15:00:00Z')

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'dono', name: 'Dona', email: 'dona@x.test', perfil: 'proprietario' },
    { id: 'ana', name: 'Ana', email: 'ana@x.test' },
  ])
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Base' })
  const aulaId = await criarAula(db, moduloId, { titulo: 'Raiz' })
  await avaliarAula(db, () => D('2026-06-10T12:00:00Z'), 'ana', aulaId, {
    nota: 1,
    oQueFaltou: '=cmd; faltou áudio',
  })
  return { db, cursoId }
}

describe('exportarCsv', () => {
  it('gera o CSV da satisfação com os textos protegidos e registra a ação', async () => {
    const { db } = await cenario()
    const arquivo = await exportarCsv(db, agora, 'dono', {
      tipo: 'satisfacao',
      de: '2026-06-01',
      ate: '2026-06-15',
    })
    expect(arquivo.nome).toBe('relatorio-satisfacao-2026-06-15.csv')
    expect(arquivo.conteudo).toContain('Curso;Aula;Notas;Média')
    expect(arquivo.conteudo).toContain(
      'Coloração;Raiz;1;1;100;0;0;1;-100;"\'=cmd; faltou áudio"',
    )

    const [registro] = await listarAcoes(db)
    expect(registro).toMatchObject({ autorId: 'dono', acao: 'exportacao-csv' })
    expect(JSON.parse(registro?.detalhe ?? '{}')).toMatchObject({
      tipo: 'satisfacao',
      linhas: 1,
      filtros: { de: '2026-06-01', ate: '2026-06-15' },
    })
  })

  it('exporta panorama, quizzes e respostas dos quizzes (cabeçalho mesmo sem linhas)', async () => {
    const { db } = await cenario()
    const panorama = await exportarCsv(db, agora, 'dono', { tipo: 'panorama' })
    expect(panorama.conteudo).toContain('Todos os cursos;')
    for (const tipo of ['quizzes', 'respostas-de-quiz']) {
      const a = await exportarCsv(db, agora, 'dono', { tipo })
      expect(a.conteudo.split('\r\n')).toHaveLength(2)
    }
  })

  it('o progresso exige o curso, e o ranking só sai com o gancho dos pontos', async () => {
    const { db, cursoId } = await cenario()
    await expect(
      exportarCsv(db, agora, 'dono', { tipo: 'progresso' }),
    ).rejects.toBeInstanceOf(ErroDeRelatorio)
    const progresso = await exportarCsv(db, agora, 'dono', {
      tipo: 'progresso',
      cursoId,
    })
    expect(progresso.conteudo).toContain('Aluno;E-mail')
    await expect(
      exportarCsv(db, agora, 'dono', { tipo: 'ranking' }),
    ).rejects.toBeInstanceOf(ErroDeRelatorio)
    const ranking = await exportarCsv(
      db,
      agora,
      'dono',
      { tipo: 'ranking' },
      {
        ranking: async () => [
          { posicao: 1, nome: 'Ana', email: 'ana@x.test', pontos: 125 },
        ],
      },
    )
    expect(ranking.conteudo).toContain('1;Ana;ana@x.test;125')
  })

  it('relatório desconhecido não grava nada no registro', async () => {
    const { db } = await cenario()
    await expect(
      exportarCsv(db, agora, 'dono', { tipo: 'segredos' }),
    ).rejects.toBeInstanceOf(ErroDeRelatorio)
    expect(await listarAcoes(db)).toHaveLength(0)
  })
})
