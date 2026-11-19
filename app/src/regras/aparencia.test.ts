import { beforeEach, describe, expect, it } from 'vitest'
import {
  aparenciaPadrao,
  ErroDeAparencia,
  lerAparencia,
  restaurarPadrao,
  salvarAparencia,
} from '#/regras/aparencia'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-03-01T12:00:00Z')

describe('aparência persistida', () => {
  let db: Awaited<ReturnType<typeof criarBancoDeTeste>>
  beforeEach(async () => {
    db = await criarBancoDeTeste()
  })

  it('sem configuração, devolve o padrão: Estúdio e nenhuma imagem', async () => {
    const aparencia = await lerAparencia(db)
    expect(aparencia).toEqual(aparenciaPadrao)
    expect(aparencia.tema).toBe('estudio')
    expect(aparencia.corDaMarca).toBeNull()
  })

  it('salva o tema e a cor da marca e lê de volta com a data do relógio', async () => {
    await salvarAparencia(db, agora, {
      tema: 'editorial',
      corDaMarca: '#AB1234',
    })
    const aparencia = await lerAparencia(db)
    expect(aparencia.tema).toBe('editorial')
    expect(aparencia.corDaMarca).toBe('#ab1234')
    expect(aparencia.atualizadoEm).toEqual(agora())
  })

  it('Comunidade no menu vem ligada, desliga, religa e sobrevive a outro salvar', async () => {
    expect((await lerAparencia(db)).mostrarComunidade).toBe(true)
    await salvarAparencia(db, agora, { mostrarComunidade: false })
    expect((await lerAparencia(db)).mostrarComunidade).toBe(false)
    await salvarAparencia(db, agora, { tema: 'neutro' })
    expect((await lerAparencia(db)).mostrarComunidade).toBe(false)
    await salvarAparencia(db, agora, { mostrarComunidade: true })
    expect((await lerAparencia(db)).mostrarComunidade).toBe(true)
  })

  it('salvar de novo mantém o que não foi enviado', async () => {
    await salvarAparencia(db, agora, {
      tema: 'neutro',
      logoUrl: '/api/aparencia/arquivo/logo-1.png',
    })
    await salvarAparencia(db, agora, { corDaMarca: '#123456' })
    const aparencia = await lerAparencia(db)
    expect(aparencia.tema).toBe('neutro')
    expect(aparencia.logoUrl).toBe('/api/aparencia/arquivo/logo-1.png')
    expect(aparencia.corDaMarca).toBe('#123456')
  })

  it('recusa tema desconhecido, cor fora do hex e imagem fora da área', async () => {
    await expect(
      salvarAparencia(db, agora, { tema: 'dracula' as never }),
    ).rejects.toBeInstanceOf(ErroDeAparencia)
    await expect(
      salvarAparencia(db, agora, { corDaMarca: 'verde' }),
    ).rejects.toBeInstanceOf(ErroDeAparencia)
    await expect(
      salvarAparencia(db, agora, { logoUrl: 'https://fora.com/x.png' }),
    ).rejects.toBeInstanceOf(ErroDeAparencia)
    await expect(
      salvarAparencia(db, agora, { faviconUrl: 'javascript:alert(1)' }),
    ).rejects.toBeInstanceOf(ErroDeAparencia)
    expect(await lerAparencia(db)).toEqual(aparenciaPadrao)
  })

  it('a casca da área do aluno começa clássica, salva Lume e mantém ao salvar o resto', async () => {
    expect((await lerAparencia(db)).casca).toBe('classica')
    await salvarAparencia(db, agora, { casca: 'lume' })
    expect((await lerAparencia(db)).casca).toBe('lume')
    await salvarAparencia(db, agora, { corDaMarca: '#123456' })
    const aparencia = await lerAparencia(db)
    expect(aparencia.casca).toBe('lume')
    expect(aparencia.corDaMarca).toBe('#123456')
    await salvarAparencia(db, agora, { casca: 'classica' })
    expect((await lerAparencia(db)).casca).toBe('classica')
  })

  it('recusa casca desconhecida e não grava nada', async () => {
    await expect(
      salvarAparencia(db, agora, { casca: 'neon' as never }),
    ).rejects.toBeInstanceOf(ErroDeAparencia)
    expect(await lerAparencia(db)).toEqual(aparenciaPadrao)
  })

  it('restaurar padrão apaga tudo o que foi configurado', async () => {
    await salvarAparencia(db, agora, {
      tema: 'brutal',
      casca: 'lume',
      corDaMarca: '#000000',
      faviconUrl: '/api/aparencia/arquivo/favicon-1.png',
    })
    await restaurarPadrao(db, agora)
    expect(await lerAparencia(db)).toEqual(aparenciaPadrao)
  })
})
