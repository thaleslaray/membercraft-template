import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '#/db/schema'
import { ErroDeCifra } from '#/regras/cifra'
import {
  armazenamentoDoToken,
  ErroDeCredencial,
  lerCredenciais,
  lerHottok,
  salvarCredenciais,
  situacaoDasCredenciais,
} from '#/regras/credenciais-hotmart'
import { listarAcoes } from '#/regras/registro-de-acoes'
import type { Banco } from '#/regras/tipos'
import { criarBancoDeTeste } from '#/test/banco'

const CHAVE = 'chave-de-teste-com-mais-de-trinta-e-dois-caracteres'
const em = (iso: string) => () => new Date(iso)
const completa = {
  clientId: 'id-secreto-111',
  clientSecret: 'segredo-secreto-222',
  basic: 'basic-secreto-333',
  hottok: 'hottok-secreto-444',
  sandbox: true,
}

let db: Banco
beforeEach(async () => {
  db = await criarBancoDeTeste()
  await db
    .insert(schema.user)
    .values({ id: 'dono', name: 'Helena', email: 'helena@exemplo.test' })
})

describe('credenciais da Hotmart', () => {
  it('sem nada salvo, a situação diz que falta tudo', async () => {
    expect(await situacaoDasCredenciais(db)).toEqual({
      configurada: false,
      campos: {
        clientId: false,
        clientSecret: false,
        basic: false,
        hottok: false,
      },
      sandbox: false,
      atualizadoEm: null,
    })
    expect(await lerCredenciais(db, CHAVE)).toBeNull()
  })

  it('grava cifrado: o banco não tem o valor em claro e a leitura interna devolve o original', async () => {
    await salvarCredenciais(
      db,
      em('2026-11-13T10:00:00Z'),
      CHAVE,
      completa,
      'dono',
    )
    const [linha] = await db.select().from(schema.credencialHotmart)
    const bruto = JSON.stringify(linha)
    for (const v of [
      completa.clientId,
      completa.clientSecret,
      completa.basic,
      completa.hottok,
    ]) {
      expect(bruto).not.toContain(v)
    }
    expect(await lerCredenciais(db, CHAVE)).toEqual(completa)
  })

  it('lerHottok decifra só o hottok: sem credencial dá undefined e chave errada lança ErroDeCifra', async () => {
    expect(await lerHottok(db, CHAVE)).toBeUndefined()
    await salvarCredenciais(
      db,
      em('2026-11-13T10:00:00Z'),
      CHAVE,
      completa,
      'dono',
    )
    expect(await lerHottok(db, CHAVE)).toBe(completa.hottok)
    // Outro campo corrompido não atrapalha: só o hottok é decifrado.
    await db
      .update(schema.credencialHotmart)
      .set({ clientSecretCifrado: 'lixo' })
    expect(await lerHottok(db, CHAVE)).toBe(completa.hottok)
    await expect(lerHottok(db, undefined)).rejects.toBeInstanceOf(ErroDeCifra)
    await expect(
      lerHottok(db, 'outra-chave-com-mais-de-trinta-e-dois-caracteres'),
    ).rejects.toBeInstanceOf(ErroDeCifra)
  })

  it('a situação nunca devolve os valores, só se estão preenchidos', async () => {
    await salvarCredenciais(
      db,
      em('2026-11-13T10:00:00Z'),
      CHAVE,
      completa,
      'dono',
    )
    const situacao = await situacaoDasCredenciais(db)
    expect(situacao.configurada).toBe(true)
    expect(situacao.sandbox).toBe(true)
    expect(JSON.stringify(situacao)).not.toMatch(/secreto/)
  })

  it('exige os quatro valores na primeira vez', async () => {
    await expect(
      salvarCredenciais(
        db,
        em('2026-11-13T10:00:00Z'),
        CHAVE,
        { clientId: 'a', sandbox: false },
        'dono',
      ),
    ).rejects.toThrow(ErroDeCredencial)
  })

  it('trocar um campo mantém os outros e registra a troca sem o valor', async () => {
    await salvarCredenciais(
      db,
      em('2026-11-13T10:00:00Z'),
      CHAVE,
      completa,
      'dono',
    )
    await salvarCredenciais(
      db,
      em('2026-11-13T11:00:00Z'),
      CHAVE,
      { hottok: 'hottok-novo-555', sandbox: true },
      'dono',
    )
    expect(await lerCredenciais(db, CHAVE)).toEqual({
      ...completa,
      hottok: 'hottok-novo-555',
    })
    const trocas = (await listarAcoes(db)).filter(
      (i) => i.acao === 'credenciais-hotmart-trocadas',
    )
    expect(trocas).toHaveLength(2)
    expect(JSON.stringify(trocas)).not.toMatch(/secreto|hottok-novo/)
    expect(JSON.parse(trocas[0].detalhe)).toMatchObject({ campos: 'hottok' })
  })

  it('trocar a credencial descarta o token em cache', async () => {
    await salvarCredenciais(
      db,
      em('2026-11-13T10:00:00Z'),
      CHAVE,
      completa,
      'dono',
    )
    const tokens = armazenamentoDoToken(db, CHAVE)
    await tokens.gravar('token-oauth-666', new Date('2026-11-14T10:00:00Z'))
    expect(await tokens.ler()).toEqual({
      token: 'token-oauth-666',
      expiraEm: new Date('2026-11-14T10:00:00Z'),
    })
    const [linha] = await db.select().from(schema.credencialHotmart)
    expect(JSON.stringify(linha)).not.toContain('token-oauth-666')
    await salvarCredenciais(
      db,
      em('2026-11-13T11:00:00Z'),
      CHAVE,
      { clientSecret: 'outro-segredo', sandbox: true },
      'dono',
    )
    expect(await tokens.ler()).toBeNull()
  })

  it('sem chave de cifra, não salva', async () => {
    await expect(
      salvarCredenciais(
        db,
        em('2026-11-13T10:00:00Z'),
        undefined,
        completa,
        'dono',
      ),
    ).rejects.toThrow()
  })
})
