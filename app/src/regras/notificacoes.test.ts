import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import {
  avisosDaPessoa,
  ErroDeNotificacao,
  idsDaEquipe,
  marcarComoLida,
  marcarTodasComoLidas,
  notificar,
  notificarVarios,
} from '#/regras/notificacoes'
import { criarBancoDeTeste } from '#/test/banco'

let t = new Date('2026-06-01T12:00:00Z')
const agora = () => t

async function cenario() {
  t = new Date('2026-06-01T12:00:00Z')
  const db = await criarBancoDeTeste()
  for (const [id, perfil] of [
    ['ana', 'aluno'],
    ['bia', 'aluno'],
    ['eq', 'equipe'],
    ['dono', 'proprietario'],
  ] as const) {
    await db
      .insert(user)
      .values({ id, name: id, email: `${id}@x.test`, perfil })
  }
  return db
}

describe('notificar e listar', () => {
  it('cria o aviso não lido e conta só os da pessoa', async () => {
    const db = await cenario()
    await notificar(db, agora, {
      userId: 'ana',
      tipo: 'pontos',
      texto: 'Você ganhou 10 pontos.',
    })
    t = new Date(t.getTime() + 60_000)
    await notificar(db, agora, {
      userId: 'ana',
      tipo: 'certificado',
      texto: 'Seu certificado saiu.',
      link: '/certificados',
    })
    await notificar(db, agora, {
      userId: 'bia',
      tipo: 'pontos',
      texto: 'Outra pessoa.',
    })
    const { naoLidas, avisos } = await avisosDaPessoa(db, 'ana')
    expect(naoLidas).toBe(2)
    // Mais novo primeiro.
    expect(avisos.map((a) => a.texto)).toEqual([
      'Seu certificado saiu.',
      'Você ganhou 10 pontos.',
    ])
    expect(avisos[0]).toMatchObject({ link: '/certificados', lida: false })
    expect(avisos[1]?.link).toBeNull()
  })

  it('recusa texto vazio e link que sai da área', async () => {
    const db = await cenario()
    await expect(
      notificar(db, agora, { userId: 'ana', tipo: 'pontos', texto: '  ' }),
    ).rejects.toBeInstanceOf(ErroDeNotificacao)
    for (const link of ['https://x.test', '//x.test']) {
      await expect(
        notificar(db, agora, {
          userId: 'ana',
          tipo: 'pontos',
          texto: 'a',
          link,
        }),
      ).rejects.toBeInstanceOf(ErroDeNotificacao)
    }
  })

  it('a lista traz no máximo o limite, mas o contador conta todas', async () => {
    const db = await cenario()
    for (let i = 0; i < 5; i++) {
      t = new Date(t.getTime() + 1000)
      await notificar(db, agora, {
        userId: 'ana',
        tipo: 'pontos',
        texto: `aviso ${i}`,
      })
    }
    const r = await avisosDaPessoa(db, 'ana', 3)
    expect(r.avisos).toHaveLength(3)
    expect(r.naoLidas).toBe(5)
    expect(r.avisos[0]?.texto).toBe('aviso 4')
  })
})

describe('marcar como lidas', () => {
  it('marcar uma baixa o contador e só o dono consegue', async () => {
    const db = await cenario()
    const id = await notificar(db, agora, {
      userId: 'ana',
      tipo: 'pontos',
      texto: 'a',
    })
    expect(await marcarComoLida(db, agora, 'bia', id)).toBe(false)
    expect((await avisosDaPessoa(db, 'ana')).naoLidas).toBe(1)
    expect(await marcarComoLida(db, agora, 'ana', id)).toBe(true)
    expect(await marcarComoLida(db, agora, 'ana', id)).toBe(false)
    const r = await avisosDaPessoa(db, 'ana')
    expect(r.naoLidas).toBe(0)
    expect(r.avisos[0]?.lida).toBe(true)
  })

  it('"marcar todas como lidas" zera só as da pessoa', async () => {
    const db = await cenario()
    await notificar(db, agora, { userId: 'ana', tipo: 'pontos', texto: 'a' })
    await notificar(db, agora, { userId: 'ana', tipo: 'pontos', texto: 'b' })
    await notificar(db, agora, { userId: 'bia', tipo: 'pontos', texto: 'c' })
    expect(await marcarTodasComoLidas(db, agora, 'ana')).toBe(2)
    expect((await avisosDaPessoa(db, 'ana')).naoLidas).toBe(0)
    expect((await avisosDaPessoa(db, 'bia')).naoLidas).toBe(1)
    expect(await marcarTodasComoLidas(db, agora, 'ana')).toBe(0)
  })
})

describe('equipe', () => {
  it('idsDaEquipe traz Equipe e Proprietário e notificarVarios avisa todos uma vez', async () => {
    const db = await cenario()
    const ids = await idsDaEquipe(db)
    expect(ids.sort()).toEqual(['dono', 'eq'])
    expect(
      await notificarVarios(db, agora, [...ids, 'eq'], {
        tipo: 'fila-da-equipe',
        texto: '2 novos itens',
      }),
    ).toBe(2)
    expect((await avisosDaPessoa(db, 'eq')).naoLidas).toBe(1)
    expect((await avisosDaPessoa(db, 'ana')).naoLidas).toBe(0)
    expect(
      await notificarVarios(db, agora, [], {
        tipo: 'fila-da-equipe',
        texto: 'x',
      }),
    ).toBe(0)
  })
})
