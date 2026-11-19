import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { avisoDeVenda, estadoDeAviso, user } from '#/db/schema'
import { avisarFilasDaEquipe } from '#/regras/contadores-de-fila'
import { FILAS, type FilaDoPainel } from '#/regras/filas'
import { avisosDaPessoa } from '#/regras/notificacoes'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')
let fila = 0
let filas: FilaDoPainel[] = []

beforeEach(() => {
  fila = 4
  filas = [
    {
      id: 'atendimento',
      rotulo: 'Atendimentos',
      aviso: 'conversas esperando resposta',
      para: '/painel/atendimento',
      contar: async () => fila,
    },
  ]
})

async function cenario() {
  const db = await criarBancoDeTeste()
  for (const [id, perfil] of [
    ['ana', 'aluno'],
    ['eq', 'equipe'],
  ] as const) {
    await db
      .insert(user)
      .values({ id, name: id, email: `${id}@x.test`, perfil })
  }
  return db
}

describe('aviso das filas no sininho da equipe', () => {
  it('a primeira execução só aprende a contagem (o que já estava na fila não avisa)', async () => {
    const db = await cenario()
    expect(await avisarFilasDaEquipe(db, agora, filas)).toEqual({})
    expect((await avisosDaPessoa(db, 'eq')).naoLidas).toBe(0)
  })

  it('item novo avisa a equipe, com o link da fila, e não repete na execução seguinte', async () => {
    const db = await cenario()
    await avisarFilasDaEquipe(db, agora, filas)
    fila = 7
    expect(await avisarFilasDaEquipe(db, agora, filas)).toEqual({
      atendimento: 3,
    })
    const { avisos } = await avisosDaPessoa(db, 'eq')
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({
      tipo: 'fila-da-equipe',
      texto: '3 novos itens: conversas esperando resposta',
      link: '/painel/atendimento',
    })
    expect(await avisarFilasDaEquipe(db, agora, filas)).toEqual({})
    expect((await avisosDaPessoa(db, 'ana')).naoLidas).toBe(0)
  })

  it('fila que esvazia não avisa e o próximo item volta a avisar', async () => {
    const db = await cenario()
    await avisarFilasDaEquipe(db, agora, filas)
    fila = 0
    expect(await avisarFilasDaEquipe(db, agora, filas)).toEqual({})
    fila = 1
    expect(await avisarFilasDaEquipe(db, agora, filas)).toEqual({
      atendimento: 1,
    })
    expect((await avisosDaPessoa(db, 'eq')).avisos[0]?.texto).toBe(
      '1 novo item: conversas esperando resposta',
    )
  })

  it('as 6 filas da equipe entram no sininho: cada uma guarda o seu marco e avisa quando cresce', async () => {
    const db = await cenario()
    await avisarFilasDaEquipe(db, agora, FILAS)
    const marcos = await db.select().from(estadoDeAviso)
    expect(marcos.map((m) => m.chave).sort()).toEqual(
      FILAS.map((f) => `fila:${f.id}`).sort(),
    )
    expect(FILAS).toHaveLength(6)

    // Uma venda da Voomp que cai sem turma é item novo da fila "Vendas sem turma".
    await db.insert(avisoDeVenda).values({
      id: 'v1',
      chave: 'c1',
      tipo: 'sale',
      gatilho: 'salePaid',
      corpo: '{}',
      situacao: 'sem_turma',
      recebidoEm: agora(),
    })
    expect(await avisarFilasDaEquipe(db, agora, FILAS)).toEqual({
      'vendas-sem-turma': 1,
    })
    expect((await avisosDaPessoa(db, 'eq')).avisos[0]).toMatchObject({
      link: '/painel/vendas',
    })
    const [marco] = await db
      .select()
      .from(estadoDeAviso)
      .where(eq(estadoDeAviso.chave, 'fila:vendas-sem-turma'))
    expect(marco.numero).toBe(1)
  })

  it('uma fila que falha ao contar não derruba as outras', async () => {
    const db = await cenario()
    filas = [
      {
        id: 'quebrada',
        rotulo: 'Quebrada',
        aviso: 'x',
        para: '/painel/x',
        contar: async () => {
          throw new Error('quebrou')
        },
      },
      ...filas,
    ]
    await avisarFilasDaEquipe(db, agora, filas)
    fila = 6
    expect(await avisarFilasDaEquipe(db, agora, filas)).toEqual({
      atendimento: 2,
    })
  })
})
