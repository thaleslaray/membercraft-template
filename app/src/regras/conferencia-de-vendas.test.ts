import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  conferenciaDeVendas,
  matricula,
  origemDaMatricula,
  registroDeAcoes,
  user,
} from '#/db/schema'
import {
  compararComMatriculas,
  ErroDeConferencia,
  listarConferencias,
  matricularPendentes,
  obterConferencia,
  registrarConferencia,
} from '#/regras/conferencia-de-vendas'
import { criarCurso } from '#/regras/conteudo'
import { criarTurma } from '#/regras/matricula'
import { interpretarVendas, lerCsv } from '#/regras/planilha-voomp'
import { gravarAviso, ligarProduto, processarAviso } from '#/regras/vendas'
import { criarBancoDeTeste } from '#/test/banco'
import { corpoDaFixture } from '#/test/fixtures/voomp'

const T0 = new Date('2026-06-01T12:00:00Z')
const agora = () => T0

const csv = (nome: string) =>
  interpretarVendas(
    lerCsv(readFileSync(`src/test/fixtures/planilha/${nome}`, 'utf8')),
  )

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values({
    id: 'eq',
    name: 'Marina',
    email: 'marina@x.test',
    perfil: 'equipe',
  })
  const cursoId = await criarCurso(db, { nome: 'Acessórios' })
  const turmaId = await criarTurma(db, { cursoId, nome: 'Turma 1' })
  // Produto 500 ligado à turma; o 999 fica sem ligação.
  await ligarProduto(db, agora, { produtoId: '500', turmaId })
  // O webhook já tratou a venda 1001 da Ana (a planilha também a traz).
  const chegou = async (
    vendaId: number,
    email: string,
    produtoId = 500,
    gatilho: 'sale-paid-real' | 'sale-refunded' = 'sale-paid-real',
  ) => {
    const corpo = corpoDaFixture(gatilho, (a) => {
      a.sale.id = vendaId
      a.client.email = email
      a.product.id = produtoId
      a.product.name = 'Curso Acessórios'
    })
    const g = await gravarAviso(db, agora, corpo)
    await processarAviso(db, agora, g.id)
  }
  const matriculasDe = async (email: string) => {
    const [conta] = await db.select().from(user).where(eq(user.email, email))
    return conta
      ? db.select().from(matricula).where(eq(matricula.userId, conta.id))
      : []
  }
  return { db, cursoId, turmaId, chegou, matriculasDe }
}

describe('compararComMatriculas', () => {
  it('separa as pagas já matriculadas, as pendentes, as sem turma e as não pagas', async () => {
    const { db, chegou } = await cenario()
    await chegou(1001, 'ana@exemplo.test')
    const r = await compararComMatriculas(
      db,
      agora,
      csv('vendas-voomp-exemplo.csv'),
    )
    expect(r.totais).toEqual({
      linhas: 7,
      descartadas: 3,
      pagas: 3,
      naoPagas: 1,
      matriculadas: 1,
      estornadas: 0,
      semMatricula: 1,
      semTurma: 1,
    })
    expect(r.pendentes.map((p) => [p.vendaId, p.situacao])).toEqual([
      ['1002', 'pendente'],
      ['1004', 'sem_turma'],
    ])
    expect(r.pendentes[0]).toMatchObject({
      email: 'bia@exemplo.test',
      produtoId: '500',
      ofertaHash: 'OF1',
    })
  })

  it('não grava nada: só compara', async () => {
    const { db } = await cenario()
    await compararComMatriculas(db, agora, csv('vendas-voomp-exemplo.csv'))
    expect(await db.select().from(matricula)).toHaveLength(0)
    expect(await db.select().from(conferenciaDeVendas)).toHaveLength(0)
  })

  it('matrícula ativa por outra origem cobre a venda; expirada ou inativa não', async () => {
    const { db, turmaId, matriculasDe } = await cenario()
    await db
      .insert(user)
      .values({ id: 'bia', name: 'Bia', email: 'bia@exemplo.test' })
    const planilha = csv('vendas-voomp-exemplo.csv')
    // matrícula manual da Bia, ativa, sem origem de venda
    await db.insert(matricula).values({
      id: 'm1',
      userId: 'bia',
      turmaId,
      situacao: 'ativa',
      iniciaEm: T0,
    })
    const ativa = await compararComMatriculas(db, agora, planilha)
    expect(ativa.pendentes.map((p) => p.vendaId)).not.toContain('1002')
    await db
      .update(matricula)
      .set({ situacao: 'inativa' })
      .where(eq(matricula.id, 'm1'))
    const inativa = await compararComMatriculas(db, agora, planilha)
    expect(inativa.pendentes.map((p) => p.vendaId)).toContain('1002')
    expect(await matriculasDe('bia@exemplo.test')).toHaveLength(1)
  })

  it('venda estornada pelo webhook não é pendente', async () => {
    const { db, chegou } = await cenario()
    await chegou(1002, 'bia@exemplo.test')
    await chegou(1002, 'bia@exemplo.test', 500, 'sale-refunded')
    const r = await compararComMatriculas(
      db,
      agora,
      csv('vendas-voomp-exemplo.csv'),
    )
    expect(r.totais.estornadas).toBe(1)
    expect(r.pendentes.map((p) => p.vendaId)).not.toContain('1002')
  })

  it('reconhece o produto só pelo nome, usando o id visto nos avisos', async () => {
    const { db, chegou } = await cenario()
    await chegou(1, 'qualquer@exemplo.test') // aviso traz produto 500 "Curso Acessórios"
    const r = await compararComMatriculas(
      db,
      agora,
      csv('vendas-so-com-nome-do-produto.csv'),
    )
    expect(
      r.pendentes.map((p) => [p.vendaId, p.produtoId, p.situacao]),
    ).toEqual([
      ['2001', '500', 'pendente'],
      ['2002', null, 'sem_turma'],
    ])
  })
})

describe('registrarConferencia', () => {
  it('guarda autor, data, arquivo, totais e pendentes, e registra a ação', async () => {
    const { db } = await cenario()
    const r = await registrarConferencia(db, agora, {
      autorId: 'eq',
      arquivoNome: 'vendas-semana.csv',
      planilha: csv('vendas-voomp-exemplo.csv'),
    })
    const [lista] = (await listarConferencias(db)).itens
    expect(lista).toMatchObject({
      id: r.id,
      arquivoNome: 'vendas-semana.csv',
      autorNome: 'Marina',
      criadoEm: T0,
      totalLinhas: 7,
      totalPagas: 3,
      totalMatriculadas: 0,
      totalSemMatricula: 2,
      totalSemTurma: 1,
      totalAplicadas: 0,
    })
    const detalhe = await obterConferencia(db, r.id)
    expect(detalhe.pendentes).toHaveLength(3)
    expect(detalhe.colunas.email).toBe('E-mail')
    const registro = await db.select().from(registroDeAcoes)
    expect(registro.map((x) => x.acao)).toEqual(['conferencia-de-vendas'])
  })
})

describe('matricularPendentes', () => {
  async function comConferencia() {
    const c = await cenario()
    const r = await registrarConferencia(c.db, agora, {
      autorId: 'eq',
      arquivoNome: 'a.csv',
      planilha: csv('vendas-voomp-exemplo.csv'),
    })
    return { ...c, conferenciaId: r.id }
  }

  it('matricula a venda pelo caminho do webhook: conta nova, origem de venda, prazo da turma', async () => {
    const { db, conferenciaId, matriculasDe } = await comConferencia()
    const r = await matricularPendentes(db, agora, {
      conferenciaId,
      autorId: 'eq',
      vendaIds: ['1002'],
    })
    expect(r).toEqual({ matriculadas: 1, falhas: [] })
    const [m] = await matriculasDe('bia@exemplo.test')
    expect(m.situacao).toBe('ativa')
    const origens = await db
      .select()
      .from(origemDaMatricula)
      .where(eq(origemDaMatricula.matriculaId, m.id))
    expect(origens.map((o) => [o.tipo, o.vendaId])).toEqual([
      ['venda', 'voomp:1002'],
    ])
    const [conta] = await db
      .select()
      .from(user)
      .where(eq(user.email, 'bia@exemplo.test'))
    expect(conta.name).toBe('Bia Lima')
  })

  it('conferir de novo depois do clique mostra a venda como matriculada', async () => {
    const { db, conferenciaId } = await comConferencia()
    await matricularPendentes(db, agora, { conferenciaId, autorId: 'eq' })
    const r = await compararComMatriculas(
      db,
      agora,
      csv('vendas-voomp-exemplo.csv'),
    )
    expect(r.totais.semMatricula).toBe(0)
    expect(r.totais.matriculadas).toBe(2)
  })

  it('sem vendaIds matricula todas as pendentes com turma e deixa a sem turma; clicar de novo não duplica', async () => {
    const { db, conferenciaId } = await comConferencia()
    const primeira = await matricularPendentes(db, agora, {
      conferenciaId,
      autorId: 'eq',
    })
    expect(primeira.matriculadas).toBe(2)
    const segunda = await matricularPendentes(db, agora, {
      conferenciaId,
      autorId: 'eq',
    })
    expect(segunda).toEqual({ matriculadas: 0, falhas: [] })
    expect(await db.select().from(origemDaMatricula)).toHaveLength(2)
    const { resumo, pendentes } = await obterConferencia(db, conferenciaId)
    expect(resumo.totalAplicadas).toBe(2)
    expect(pendentes.map((p) => p.situacao)).toEqual([
      'aplicada',
      'aplicada',
      'sem_turma',
    ])
  })

  it('a venda sem turma falha com motivo, e passa depois que o produto é ligado', async () => {
    const { db, conferenciaId, turmaId, matriculasDe } = await comConferencia()
    const falha = await matricularPendentes(db, agora, {
      conferenciaId,
      autorId: 'eq',
      vendaIds: ['1004'],
    })
    expect(falha.matriculadas).toBe(0)
    expect(falha.falhas[0].motivo).toMatch(/não está ligado/)
    await ligarProduto(db, agora, { produtoId: '999', turmaId })
    const ok = await matricularPendentes(db, agora, {
      conferenciaId,
      autorId: 'eq',
      vendaIds: ['1004'],
    })
    expect(ok.matriculadas).toBe(1)
    expect(await matriculasDe('dani@exemplo.test')).toHaveLength(1)
  })

  it('recusa a venda estornada depois da conferência', async () => {
    const { db, conferenciaId, chegou, matriculasDe } = await comConferencia()
    await chegou(1002, 'bia@exemplo.test', 500, 'sale-refunded')
    const r = await matricularPendentes(db, agora, {
      conferenciaId,
      autorId: 'eq',
      vendaIds: ['1002'],
    })
    expect(r.falhas).toEqual([
      { vendaId: '1002', motivo: 'A venda foi estornada.' },
    ])
    expect(await matriculasDe('bia@exemplo.test')).toHaveLength(0)
  })

  it('chama aoLiberarCursos uma vez por matrícula nova e registra o clique', async () => {
    const { db, conferenciaId } = await comConferencia()
    const eventos: string[] = []
    await matricularPendentes(
      db,
      agora,
      { conferenciaId, autorId: 'eq', vendaIds: ['1002'] },
      {
        aoLiberarCursos: async (es) =>
          void eventos.push(...es.map((e) => e.email)),
      },
    )
    expect(eventos).toEqual(['bia@exemplo.test'])
    const acoes = await db.select().from(registroDeAcoes)
    expect(acoes).toHaveLength(2)
    expect(JSON.parse(acoes[1].detalhe)).toMatchObject({ matriculadas: 1 })
  })

  it('erros claros: conferência inexistente e lista vazia', async () => {
    const { db, conferenciaId } = await comConferencia()
    await expect(
      matricularPendentes(db, agora, { conferenciaId: 'nada', autorId: null }),
    ).rejects.toThrow(ErroDeConferencia)
    await expect(
      matricularPendentes(db, agora, {
        conferenciaId,
        autorId: null,
        vendaIds: [],
      }),
    ).rejects.toThrow(/ao menos uma venda/)
  })
})

describe('histórico de conferências paginado', () => {
  it('traz 20 por página, da mais nova à mais antiga, com o total', async () => {
    const { db } = await cenario()
    for (let i = 0; i < 25; i++) {
      await registrarConferencia(
        db,
        () => new Date(T0.getTime() + i * 60_000),
        {
          autorId: 'eq',
          arquivoNome: `semana-${i}.csv`,
          planilha: csv('vendas-voomp-exemplo.csv'),
        },
      )
    }
    const primeira = await listarConferencias(db)
    expect(primeira.itens).toHaveLength(20)
    expect(primeira).toMatchObject({ total: 25, totalDePaginas: 2 })
    expect(primeira.itens[0].arquivoNome).toBe('semana-24.csv')
    const segunda = await listarConferencias(db, 2)
    expect(segunda.itens.map((c) => c.arquivoNome)).toEqual([
      'semana-4.csv',
      'semana-3.csv',
      'semana-2.csv',
      'semana-1.csv',
      'semana-0.csv',
    ])
  })
})
