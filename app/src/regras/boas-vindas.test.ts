import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '#/db/schema'
import { boasVindasDoAluno } from '#/regras/boas-vindas'
import { salvarConfiguracaoDaArea } from '#/regras/configuracao-da-area'
import { marcarTourVisto } from '#/regras/minha-conta'
import type { Banco } from '#/regras/tipos'
import { criarBancoDeTeste } from '#/test/banco'

let db: Banco
const agora = () => new Date('2026-06-01T09:00:00Z')

beforeEach(async () => {
  db = await criarBancoDeTeste()
  await db.insert(schema.user).values([
    { id: 'dono', name: 'Helena', email: 'helena@exemplo.test' },
    { id: 'ana', name: 'Ana', email: 'ana@exemplo.test' },
  ])
})

const configurar = () =>
  salvarConfiguracaoDaArea(
    db,
    agora,
    { boasVindasVimeo: 'https://vimeo.com/123456789' },
    'dono',
  )

describe('boas-vindas da Helena', () => {
  it('sem vídeo configurado, nada aparece: nem sozinho nem para rever', async () => {
    expect(await boasVindasDoAluno(db, 'ana')).toEqual({
      url: null,
      abrirSozinho: false,
    })
  })

  it('com vídeo, o primeiro acesso abre sozinho', async () => {
    await configurar()
    expect(await boasVindasDoAluno(db, 'ana')).toEqual({
      url: 'https://player.vimeo.com/video/123456789',
      abrirSozinho: true,
    })
  })

  it('depois de assistir ou pular, não abre mais sozinho, mas dá para rever', async () => {
    await configurar()
    await marcarTourVisto(db, agora, 'ana')
    expect(await boasVindasDoAluno(db, 'ana')).toEqual({
      url: 'https://player.vimeo.com/video/123456789',
      abrirSozinho: false,
    })
    // O marcador é por aluno: quem ainda não viu continua vendo.
    expect((await boasVindasDoAluno(db, 'dono')).abrirSozinho).toBe(true)
  })
})
