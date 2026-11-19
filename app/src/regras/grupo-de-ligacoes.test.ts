import { describe, expect, it } from 'vitest'
import { criarCurso } from '#/regras/conteudo'
import { ligacoesDaTurma, ligarNaTurma } from '#/regras/grupo-de-ligacoes'
import { criarTurma } from '#/regras/matricula'
import { ErroDeVenda, listarLigacoes } from '#/regras/vendas'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-11-14T12:00:00Z')

async function cenario() {
  const db = await criarBancoDeTeste()
  const formacao = await criarCurso(db, { nome: 'Formação' })
  const acessorios = await criarCurso(db, { nome: 'Acessórios' })
  const t1 = await criarTurma(db, { cursoId: formacao, nome: 'Turma 2026' })
  const t2 = await criarTurma(db, { cursoId: acessorios, nome: 'Turma única' })
  return { db, t1, t2 }
}

describe('ligações pela turma', () => {
  it('liga produto a uma turma com prazo nulo (herda o da turma)', async () => {
    const { db, t1 } = await cenario()
    await ligarNaTurma(db, agora, { turmaId: t1, produtoId: '698441' })
    const [l] = await listarLigacoes(db, 'hotmart')
    expect(l?.turmaId).toBe(t1)
    expect(l?.ofertaHash).toBe('')
    expect(l?.prazoEmDias).toBeNull()
  })

  it('liga oferta específica e convive com todas as ofertas', async () => {
    const { db, t1 } = await cenario()
    await ligarNaTurma(db, agora, { turmaId: t1, produtoId: '698441' })
    await ligarNaTurma(db, agora, {
      turmaId: t1,
      produtoId: '698441',
      ofertaHash: ' bf2026x ',
    })
    const ls = await listarLigacoes(db, 'hotmart')
    expect(ls.map((l) => l.ofertaHash).sort()).toEqual(['', 'bf2026x'])
  })

  it('recusa repetir produto/oferta na mesma turma', async () => {
    const { db, t1 } = await cenario()
    await ligarNaTurma(db, agora, { turmaId: t1, produtoId: '698441' })
    await expect(
      ligarNaTurma(db, agora, { turmaId: t1, produtoId: '698441' }),
    ).rejects.toThrow('Este produto já libera esta turma.')
    await expect(
      ligarNaTurma(db, agora, { turmaId: t1, produtoId: '1', ofertaHash: 'a' }),
    ).resolves.toBeDefined()
    await expect(
      ligarNaTurma(db, agora, { turmaId: t1, produtoId: '1', ofertaHash: 'a' }),
    ).rejects.toThrow('Esta oferta já libera esta turma.')
  })

  it('recusa turma inexistente e produto que não é número', async () => {
    const { db, t1 } = await cenario()
    await expect(
      ligarNaTurma(db, agora, { turmaId: 'nada', produtoId: '698441' }),
    ).rejects.toThrow(ErroDeVenda)
    await expect(
      ligarNaTurma(db, agora, { turmaId: t1, produtoId: 'abc' }),
    ).rejects.toThrow('número')
  })

  it('o mesmo produto em duas turmas é combo: cada turma mostra a outra em "também libera"', async () => {
    const { db, t1, t2 } = await cenario()
    await ligarNaTurma(db, agora, { turmaId: t1, produtoId: '698441' })
    await ligarNaTurma(db, agora, { turmaId: t2, produtoId: '698441' })
    await ligarNaTurma(db, agora, {
      turmaId: t2,
      produtoId: '698441',
      ofertaHash: 'bf',
    })
    const ls = await listarLigacoes(db, 'hotmart')
    expect(ligacoesDaTurma(ls, t1)).toEqual([
      expect.objectContaining({
        produtoId: '698441',
        tambem: ['Acessórios – Turma única'],
      }),
    ])
    const daT2 = ligacoesDaTurma(ls, t2)
    expect(daT2).toHaveLength(2)
    // A oferta soma com "todas as ofertas": comprar 'bf' também libera a turma ligada ao produto inteiro.
    expect(daT2.find((l) => l.ofertaHash === 'bf')?.tambem).toEqual([
      'Formação – Turma 2026',
    ])
    expect(daT2.find((l) => l.ofertaHash === '')?.tambem).toEqual([
      'Formação – Turma 2026',
    ])
  })
})
