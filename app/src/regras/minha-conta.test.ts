import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '#/db/schema'
import {
  definirFoto,
  deveMostrarOTour,
  ErroDeMinhaConta,
  fotoValida,
  lerMinhaConta,
  marcarTourVisto,
  nomeDaFoto,
  normalizarTelefone,
  PREFIXO_DA_FOTO,
  salvarMinhaConta,
  validarFoto,
} from '#/regras/minha-conta'
import type { Banco } from '#/regras/tipos'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-03-01T10:00:00Z')

let db: Banco
beforeEach(async () => {
  db = await criarBancoDeTeste()
  await db
    .insert(schema.user)
    .values({ id: 'u1', name: 'Ana Souza', email: 'ana@exemplo.test' })
})

describe('Minha conta', () => {
  it('começa só com o nome e sem tour visto', async () => {
    expect(await lerMinhaConta(db, 'u1')).toEqual({
      nome: 'Ana Souza',
      telefone: null,
      fusoHorario: null,
      bio: null,
      foto: null,
      tourVistoEm: null,
      proximaAulaSozinha: true,
    })
  })

  it('a próxima aula começa sozinha por padrão, e a aluna desliga e religa na conta', async () => {
    const desligada = await salvarMinhaConta(db, agora, 'u1', {
      proximaAulaSozinha: false,
    })
    expect(desligada.proximaAulaSozinha).toBe(false)
    expect((await lerMinhaConta(db, 'u1')).proximaAulaSozinha).toBe(false)
    // Salvar outro campo não religa.
    const nome = await salvarMinhaConta(db, agora, 'u1', { nome: 'Ana S.' })
    expect(nome.proximaAulaSozinha).toBe(false)
    const ligada = await salvarMinhaConta(db, agora, 'u1', {
      proximaAulaSozinha: true,
    })
    expect(ligada.proximaAulaSozinha).toBe(true)
  })

  it('salva telefone, fuso e bio e mantém o resto', async () => {
    const conta = await salvarMinhaConta(db, agora, 'u1', {
      telefone: '(11) 91234-5678',
      fusoHorario: 'Europe/Lisbon',
      bio: '  Estudo estilo há dois anos.  ',
    })
    expect(conta).toMatchObject({
      nome: 'Ana Souza',
      telefone: '11912345678',
      fusoHorario: 'Europe/Lisbon',
      bio: 'Estudo estilo há dois anos.',
    })
    const depois = await salvarMinhaConta(db, agora, 'u1', { nome: 'Ana S.' })
    expect(depois.nome).toBe('Ana S.')
    expect(depois.fusoHorario).toBe('Europe/Lisbon')
  })

  it('campo vazio limpa; Brasília volta a ser o padrão (nulo)', async () => {
    await salvarMinhaConta(db, agora, 'u1', {
      telefone: '+55 11 91234-5678',
      fusoHorario: 'Asia/Tokyo',
      bio: 'oi',
    })
    const conta = await salvarMinhaConta(db, agora, 'u1', {
      telefone: '',
      fusoHorario: 'America/Sao_Paulo',
      bio: '',
    })
    expect(conta).toMatchObject({
      telefone: null,
      fusoHorario: null,
      bio: null,
    })
  })

  it('recusa nome vazio, fuso inventado, bio longa e telefone torto', async () => {
    await expect(
      salvarMinhaConta(db, agora, 'u1', { nome: '  ' }),
    ).rejects.toBeInstanceOf(ErroDeMinhaConta)
    await expect(
      salvarMinhaConta(db, agora, 'u1', { fusoHorario: 'Marte/Olympus' }),
    ).rejects.toThrow('Fuso horário desconhecido')
    await expect(
      salvarMinhaConta(db, agora, 'u1', { bio: 'x'.repeat(501) }),
    ).rejects.toThrow('no máximo 500')
    await expect(
      salvarMinhaConta(db, agora, 'u1', { telefone: 'abc' }),
    ).rejects.toBeInstanceOf(ErroDeMinhaConta)
    await expect(
      salvarMinhaConta(db, agora, 'u1', { telefone: '123' }),
    ).rejects.toThrow('Confira o telefone')
    // Nada foi gravado pelas tentativas recusadas.
    expect((await lerMinhaConta(db, 'u1')).nome).toBe('Ana Souza')
  })

  it('normaliza telefone mantendo o + do início', () => {
    expect(normalizarTelefone('+351 912 345 678')).toBe('+351912345678')
    expect(normalizarTelefone('(11) 3333-4444')).toBe('1133334444')
    expect(normalizarTelefone(null)).toBeNull()
  })

  it('a foto só vale se for da própria área e do tipo e tamanho certos', async () => {
    expect(validarFoto({ tipo: 'image/png', tamanho: 1000 })).toBeNull()
    expect(validarFoto({ tipo: 'image/svg+xml', tamanho: 1000 })).toMatch(
      /PNG, JPEG/,
    )
    expect(
      validarFoto({ tipo: 'image/png', tamanho: 3 * 1024 * 1024 }),
    ).toMatch(/2 MB/)
    const nome = nomeDaFoto('u1', 'image/jpeg', agora)
    expect(nome).toBe(`u1-${agora().getTime()}.jpg`)
    expect(fotoValida(`${PREFIXO_DA_FOTO}${nome}`)).toBe(true)
    expect(fotoValida('https://externo.test/foto.png')).toBe(false)
    expect(fotoValida(`${PREFIXO_DA_FOTO}../x.png`)).toBe(false)

    await definirFoto(db, agora, 'u1', `${PREFIXO_DA_FOTO}${nome}`)
    expect((await lerMinhaConta(db, 'u1')).foto).toBe(
      `${PREFIXO_DA_FOTO}${nome}`,
    )
    await expect(
      definirFoto(db, agora, 'u1', 'https://externo.test/foto.png'),
    ).rejects.toBeInstanceOf(ErroDeMinhaConta)
    await definirFoto(db, agora, 'u1', null)
    expect((await lerMinhaConta(db, 'u1')).foto).toBeNull()
  })
})

describe('tour de primeiro acesso', () => {
  it('abre sozinho até o aluno ver ou pular, e daí não abre mais', async () => {
    expect(deveMostrarOTour(await lerMinhaConta(db, 'u1'))).toBe(true)
    await marcarTourVisto(db, agora, 'u1')
    const conta = await lerMinhaConta(db, 'u1')
    expect(conta.tourVistoEm).toEqual(agora())
    expect(deveMostrarOTour(conta)).toBe(false)
  })

  it('o estado é de cada aluno', async () => {
    await db
      .insert(schema.user)
      .values({ id: 'u2', name: 'Bia', email: 'bia@exemplo.test' })
    await marcarTourVisto(db, agora, 'u1')
    expect(deveMostrarOTour(await lerMinhaConta(db, 'u2'))).toBe(true)
  })
})
