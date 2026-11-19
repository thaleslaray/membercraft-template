import { describe, expect, it, vi } from 'vitest'
import { avaliacaoDaAula, avisoDeVenda, user } from '#/db/schema'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { contarFilas, contarVendasSemTurma, FILAS } from '#/regras/filas'
import { criarBancoDeTeste } from '#/test/banco'

const agora = new Date('2026-06-01T12:00:00Z')

describe('filas do painel', () => {
  it('as filas que já existem estão no registro, com tela e contagem', () => {
    // As 6 filas da história 104, uma só lista para o menu, o resumo diário e o sininho da equipe.
    expect(FILAS.map((f) => f.id)).toEqual([
      'atendimentos-abertos',
      'aguardando-correcao',
      'aguardando-resposta',
      'avaliacoes-para-ler',
      'certificado-do-mec',
      'vendas-sem-turma',
    ])
    for (const f of FILAS) {
      expect(f.para).toMatch(/^\/painel\//)
      expect(f.aviso).not.toBe('')
    }
  })

  it('conta vendas sem turma e avaliações para ler no banco', async () => {
    const db = await criarBancoDeTeste()
    await db.insert(user).values({ id: 'ana', name: 'Ana', email: 'a@x.test' })
    const cursoId = await criarCurso(db, { nome: 'C' })
    const moduloId = await criarModulo(db, cursoId, { nome: 'M' })
    const aulaId = await criarAula(db, moduloId, { titulo: 'A' })
    await db.insert(avaliacaoDaAula).values({
      id: 'av1',
      userId: 'ana',
      aulaId,
      nota: 1,
      oQueFaltou: 'tudo',
      atualizadaEm: agora,
    })
    await db.insert(avisoDeVenda).values(
      ['sem_turma', 'sem_turma', 'aplicada'].map((situacao, i) => ({
        id: `v${i}`,
        chave: `c${i}`,
        tipo: 'sale',
        gatilho: 'salePaid',
        corpo: '{}',
        situacao: situacao as 'sem_turma' | 'aplicada',
        recebidoEm: agora,
      })),
    )
    expect(await contarVendasSemTurma(db)).toBe(2)
    const contadores = await contarFilas(db, FILAS, () => agora)
    expect(contadores.map((c) => [c.id, c.total])).toEqual([
      ['atendimentos-abertos', 0],
      ['aguardando-correcao', 0],
      ['aguardando-resposta', 0],
      ['avaliacoes-para-ler', 1],
      ['certificado-do-mec', 0],
      ['vendas-sem-turma', 2],
    ])
  })

  it('uma fila plugada por outra fatia entra na contagem; uma que falha vale 0', async () => {
    const db = await criarBancoDeTeste()
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const contadores = await contarFilas(
      db,
      [
        {
          id: 'a',
          rotulo: 'A',
          aviso: 'a',
          para: '/painel/a',
          contar: async () => 4,
        },
        {
          id: 'b',
          rotulo: 'B',
          aviso: 'b',
          para: '/painel/b',
          contar: async () => {
            throw new Error('quebrou')
          },
        },
      ],
      () => agora,
    )
    expect(contadores.map((c) => c.total)).toEqual([4, 0])
    erro.mockRestore()
  })
})
