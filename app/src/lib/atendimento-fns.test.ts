import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import { enviarRespostaDaEquipe } from '#/lib/atendimento-fns'
import { abrirConversa } from '#/regras/atendimento'
import { criarBancoDeTeste } from '#/test/banco'

describe('enviarRespostaDaEquipe', () => {
  it('devolve um valor ao enviar (a tela só esvazia a caixa quando recebe algo)', async () => {
    const db = await criarBancoDeTeste()
    await db.insert(user).values([
      { id: 'ana', name: 'Ana', email: 'ana@x.test' },
      { id: 'eq', name: 'Carla', email: 'eq@x.test', perfil: 'equipe' },
    ])
    const conversaId = await abrirConversa(db, () => new Date(), {
      userId: 'ana',
      assunto: 'Ajuda',
      texto: 'Oi',
    })
    const resultado = await enviarRespostaDaEquipe(db, {
      conversaId,
      equipeId: 'eq',
      texto: 'Já resolvi.',
      chaveDeEnvio: 'chave-de-teste-1',
    })
    expect(resultado).toEqual({ enviada: true, conversaId })
    // O mesmo envio repetido (clique duplo) também devolve valor.
    expect(
      await enviarRespostaDaEquipe(db, {
        conversaId,
        equipeId: 'eq',
        texto: 'Já resolvi.',
        chaveDeEnvio: 'chave-de-teste-1',
      }),
    ).toEqual({ enviada: true, conversaId })
  })
})
