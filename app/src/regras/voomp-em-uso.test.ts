import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '#/db/schema'
import { definirVoompLigada } from '#/regras/configuracao-da-area'
import { criarCurso } from '#/regras/conteudo'
import { criarTurma } from '#/regras/matricula'
import type { Banco } from '#/regras/tipos'
import { gravarAviso, ligarProduto } from '#/regras/vendas'
import { situacaoDaVoomp, voompEmUso } from '#/regras/voomp-em-uso'
import { criarBancoDeTeste } from '#/test/banco'
import { corpoDaFixture } from '#/test/fixtures/voomp'

describe('voompEmUso (regra pura)', () => {
  it('fora de uso: interruptor desligado, sem aviso e sem ligação', () => {
    expect(
      voompEmUso({ interruptor: false, temAviso: false, temLigacao: false }),
    ).toBe(false)
  })
  it.each([
    [{ interruptor: true, temAviso: false, temLigacao: false }],
    [{ interruptor: false, temAviso: true, temLigacao: false }],
    [{ interruptor: false, temAviso: false, temLigacao: true }],
  ])('basta um dos três: %o', (entrada) => {
    expect(voompEmUso(entrada)).toBe(true)
  })
})

describe('situacaoDaVoomp (banco)', () => {
  let db: Banco
  const agora = () => new Date('2026-06-01T12:00:00Z')
  beforeEach(async () => {
    db = await criarBancoDeTeste()
  })

  it('sem nada, não está em uso e o interruptor está desligado', async () => {
    expect(await situacaoDaVoomp(db)).toEqual({
      interruptor: false,
      emUso: false,
    })
  })

  it('ligar o interruptor põe em uso; desligar tira', async () => {
    await definirVoompLigada(db, agora, true)
    expect(await situacaoDaVoomp(db)).toEqual({
      interruptor: true,
      emUso: true,
    })
    await definirVoompLigada(db, agora, false)
    expect((await situacaoDaVoomp(db)).emUso).toBe(false)
  })

  it('um aviso da Voomp põe em uso mesmo com o interruptor desligado', async () => {
    await gravarAviso(db, agora, corpoDaFixture('sale-paid-real'))
    expect(await situacaoDaVoomp(db)).toEqual({
      interruptor: false,
      emUso: true,
    })
  })

  it('ligação da Voomp põe em uso; ligação da Hotmart não', async () => {
    const cursoId = await criarCurso(db, { nome: 'C' })
    const turmaId = await criarTurma(db, { cursoId, nome: 'T' })
    await ligarProduto(db, agora, {
      gateway: 'hotmart',
      produtoId: '1',
      turmaId,
    })
    expect((await situacaoDaVoomp(db)).emUso).toBe(false)
    await ligarProduto(db, agora, { produtoId: '2', turmaId })
    expect((await situacaoDaVoomp(db)).emUso).toBe(true)
  })

  it('definirVoompLigada mantém o resto da configuração', async () => {
    await db
      .insert(schema.user)
      .values({ id: 'dono', name: 'D', email: 'd@x.test' })
    await definirVoompLigada(db, agora, true, 'dono')
    const [linha] = await db.select().from(schema.configuracaoDaArea)
    expect(linha?.voompLigada).toBe(true)
    expect(linha?.atualizadoPor).toBe('dono')
  })
})
