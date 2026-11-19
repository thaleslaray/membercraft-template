import { describe, expect, it } from 'vitest'
import { ligacaoDeVenda, turma } from '#/db/schema'
import { criarCurso } from '#/regras/conteudo'
import {
  carregarLiberacaoDaHotmart,
  desmarcarCursoNaOferta,
  type LinhaDeLigacao,
  marcarCursoNaOferta,
  montarLiberacaoPorProduto,
  ofertasParaMostrar,
  turmaPrincipalDoCurso,
} from '#/regras/liberacao-por-produto'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')
const D = (s: string) => new Date(s)

describe('turmaPrincipalDoCurso', () => {
  it('escolhe a turma mais antiga', () => {
    const turmas = [
      { id: 'b', nome: 'Nova', criadoEm: D('2026-03-01') },
      { id: 'a', nome: 'Velha', criadoEm: D('2026-01-01') },
      { id: 'c', nome: 'Meio', criadoEm: D('2026-02-01') },
    ]
    expect(turmaPrincipalDoCurso(turmas)?.id).toBe('a')
  })

  it('empate de data desempata pelo id; sem turma é nulo', () => {
    const mesma = D('2026-01-01')
    expect(
      turmaPrincipalDoCurso([
        { id: 'z', nome: 'Z', criadoEm: mesma },
        { id: 'k', nome: 'K', criadoEm: mesma },
      ])?.id,
    ).toBe('k')
    expect(turmaPrincipalDoCurso([])).toBeNull()
  })
})

describe('montarLiberacaoPorProduto', () => {
  const l = (
    produtoId: string,
    ofertaHash: string,
    cursoId: string,
    turmaId: string,
    turmaNome = turmaId,
  ): LinhaDeLigacao => ({ produtoId, ofertaHash, cursoId, turmaId, turmaNome })
  const principais = { c1: 't1', c2: 't2', c3: 't3' }

  it('separa "qualquer oferta" das ofertas, por produto', () => {
    const r = montarLiberacaoPorProduto(
      [
        l('p1', '', 'c1', 't1'),
        l('p1', 'bf', 'c2', 't2'),
        l('p1', 'bf', 'c3', 't3'),
        l('p2', '', 'c3', 't3'),
      ],
      principais,
    )
    expect(r).toEqual([
      {
        produtoId: 'p1',
        qualquerOferta: [{ cursoId: 'c1', pelaEdicao: null }],
        ofertas: [
          {
            ofertaHash: 'bf',
            cursos: [
              { cursoId: 'c2', pelaEdicao: null },
              { cursoId: 'c3', pelaEdicao: null },
            ],
          },
        ],
      },
      {
        produtoId: 'p2',
        qualquerOferta: [{ cursoId: 'c3', pelaEdicao: null }],
        ofertas: [],
      },
    ])
  })

  it('curso ligado só a turma que não é a principal mostra a edição; com a principal junto, não', () => {
    const so = montarLiberacaoPorProduto(
      [l('p1', '', 'c1', 'tx', 'Turma de março')],
      principais,
    )
    expect(so[0]?.qualquerOferta).toEqual([
      { cursoId: 'c1', pelaEdicao: 'Turma de março' },
    ])
    const ambas = montarLiberacaoPorProduto(
      [
        l('p1', '', 'c1', 'tx', 'Turma de março'),
        l('p1', '', 'c1', 't1'),
        l('p1', '', 'c1', 'ty', 'Outra'),
      ],
      principais,
    )
    expect(ambas[0]?.qualquerOferta).toEqual([
      { cursoId: 'c1', pelaEdicao: null },
    ])
  })
})

async function cenario() {
  const db = await criarBancoDeTeste()
  const cursoId = await criarCurso(db, { nome: 'Desafio' })
  await db.insert(turma).values([
    { id: 'nova', cursoId, nome: 'Nova', criadoEm: D('2026-03-01') },
    { id: 'velha', cursoId, nome: 'Velha', criadoEm: D('2026-01-01') },
  ])
  const ligacoes = () => db.select().from(ligacaoDeVenda)
  return { db, cursoId, ligacoes }
}

describe('marcar e desmarcar curso na oferta', () => {
  it('marcar liga o produto à turma principal e repetir não duplica', async () => {
    const { db, cursoId, ligacoes } = await cenario()
    const entrada = { produtoId: '416608', ofertaHash: 'bf', cursoId }
    await marcarCursoNaOferta(db, agora, entrada)
    await marcarCursoNaOferta(db, agora, entrada)
    expect(await ligacoes()).toMatchObject([
      { produtoId: '416608', ofertaHash: 'bf', turmaId: 'velha' },
    ])
    const tela = await carregarLiberacaoDaHotmart(db)
    expect(tela.cursos).toEqual([
      { id: cursoId, nome: 'Desafio', turmaPrincipalId: 'velha' },
    ])
    expect(tela.liberacoes[0]?.ofertas[0]?.cursos).toEqual([
      { cursoId, pelaEdicao: null },
    ])
  })

  it('curso sem turma ganha a "Turma principal"', async () => {
    const db = await criarBancoDeTeste()
    const cursoId = await criarCurso(db, { nome: 'Sem turma' })
    await marcarCursoNaOferta(db, agora, { produtoId: '1', cursoId })
    const turmas = await db.select().from(turma)
    expect(turmas).toMatchObject([{ cursoId, nome: 'Turma principal' }])
    expect(await db.select().from(ligacaoDeVenda)).toMatchObject([
      { turmaId: turmas[0]?.id, ofertaHash: '' },
    ])
  })

  it('já ligado a outra turma do curso conta como marcado', async () => {
    const { db, cursoId, ligacoes } = await cenario()
    await db
      .insert(ligacaoDeVenda)
      .values({ id: 'x', gateway: 'hotmart', produtoId: '1', turmaId: 'nova' })
    await marcarCursoNaOferta(db, agora, { produtoId: '1', cursoId })
    expect(await ligacoes()).toHaveLength(1)
    const tela = await carregarLiberacaoDaHotmart(db)
    expect(tela.liberacoes[0]?.qualquerOferta).toEqual([
      { cursoId, pelaEdicao: 'Nova' },
    ])
  })

  it('desmarcar remove todas as ligações do produto+oferta com turmas do curso, e só elas', async () => {
    const { db, cursoId, ligacoes } = await cenario()
    await db.insert(ligacaoDeVenda).values([
      {
        id: 'a',
        gateway: 'hotmart',
        produtoId: '1',
        ofertaHash: 'bf',
        turmaId: 'nova',
      },
      {
        id: 'b',
        gateway: 'hotmart',
        produtoId: '1',
        ofertaHash: 'bf',
        turmaId: 'velha',
      },
      {
        id: 'c',
        gateway: 'hotmart',
        produtoId: '1',
        ofertaHash: '',
        turmaId: 'velha',
      },
      {
        id: 'd',
        gateway: 'hotmart',
        produtoId: '2',
        ofertaHash: 'bf',
        turmaId: 'velha',
      },
    ])
    await desmarcarCursoNaOferta(db, {
      produtoId: '1',
      ofertaHash: 'bf',
      cursoId,
    })
    expect((await ligacoes()).map((x) => x.id).sort()).toEqual(['c', 'd'])
  })
})

describe('ofertasParaMostrar', () => {
  const comLigacao = [
    { ofertaHash: 'bf', cursos: [{ cursoId: 'c1', pelaEdicao: null }] },
  ]

  it('sem resposta da Hotmart, a oferta ligada fica só com o código', () => {
    expect(ofertasParaMostrar(comLigacao, null)).toEqual([
      { ofertaHash: 'bf', nome: null, marcados: comLigacao[0]?.cursos },
    ])
  })

  it('com as ofertas carregadas, põe o nome e acrescenta as outras sem curso marcado', () => {
    const r = ofertasParaMostrar(comLigacao, [
      { codigo: 'org', nome: 'Orgânico' },
      { codigo: 'bf', nome: 'Black Friday' },
    ])
    expect(r.map((o) => [o.ofertaHash, o.nome, o.marcados.length])).toEqual([
      ['bf', 'Black Friday', 1],
      ['org', 'Orgânico', 0],
    ])
  })
})
