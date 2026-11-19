import { beforeEach, describe, expect, it } from 'vitest'

import * as schema from '#/db/schema'
import {
  configuracaoPadrao,
  ErroDeConfiguracao,
  lerConfiguracaoDaArea,
  salvarConfiguracaoDaArea,
} from '#/regras/configuracao-da-area'
import { pendenciasDoPrimeiroAcesso } from '#/regras/primeiro-acesso'
import { listarAcoes, rotuloDaAcao } from '#/regras/registro-de-acoes'
import type { Banco } from '#/regras/tipos'
import { criarBancoDeTeste } from '#/test/banco'

let db: Banco
beforeEach(async () => {
  db = await criarBancoDeTeste()
  await db
    .insert(schema.user)
    .values({ id: 'dono', name: 'Helena', email: 'helena@exemplo.test' })
})

const em = (iso: string) => () => new Date(iso)

describe('configuração da área', () => {
  it('sem linha vale o padrão (versão do appConfig, textos provisórios)', async () => {
    expect(await lerConfiguracaoDaArea(db)).toEqual(configuracaoPadrao)
  })

  it('salva os textos e o contato sem mexer na versão dos Termos', async () => {
    const antes = await lerConfiguracaoDaArea(db)
    const salva = await salvarConfiguracaoDaArea(
      db,
      em('2026-05-01T10:00:00Z'),
      {
        termosTexto: '  Termos novos  ',
        privacidadeTexto: 'Privacidade nova',
        suporteEmail: 'ajuda@escola.test',
      },
      'dono',
    )
    expect(salva).toMatchObject({
      termosVersao: antes.termosVersao,
      termosTexto: 'Termos novos',
      privacidadeTexto: 'Privacidade nova',
      suporteEmail: 'ajuda@escola.test',
    })
    expect(await lerConfiguracaoDaArea(db)).toEqual(salva)
  })

  it('só os campos enviados mudam', async () => {
    await salvarConfiguracaoDaArea(db, em('2026-05-01T10:00:00Z'), {
      termosTexto: 'T1',
      suporteEmail: 'a@b.test',
    })
    const depois = await salvarConfiguracaoDaArea(
      db,
      em('2026-05-02T10:00:00Z'),
      { privacidadeTexto: 'P2' },
    )
    expect(depois).toMatchObject({
      termosTexto: 'T1',
      privacidadeTexto: 'P2',
      suporteEmail: 'a@b.test',
    })
  })

  it('mudar a versão pede novo aceite de quem já tinha aceitado', async () => {
    const antes = await lerConfiguracaoDaArea(db)
    const aluno = {
      perfil: 'aluno' as const,
      name: 'Ana',
      termosVersao: antes.termosVersao,
    }
    expect(pendenciasDoPrimeiroAcesso(aluno, antes.termosVersao)).toEqual({
      precisaNome: false,
      precisaTermos: false,
    })

    const nova = await salvarConfiguracaoDaArea(
      db,
      em('2026-06-01T09:00:00Z'),
      {
        termosTexto: 'Termos revisados',
        exigirNovoAceite: true,
      },
    )
    expect(nova.termosVersao).not.toBe(antes.termosVersao)
    const vigente = (await lerConfiguracaoDaArea(db)).termosVersao
    expect(pendenciasDoPrimeiroAcesso(aluno, vigente).precisaTermos).toBe(true)
  })

  it('editar sem marcar o novo aceite não derruba ninguém', async () => {
    const antes = await lerConfiguracaoDaArea(db)
    await salvarConfiguracaoDaArea(db, em('2026-06-01T09:00:00Z'), {
      termosTexto: 'Só uma vírgula',
    })
    expect((await lerConfiguracaoDaArea(db)).termosVersao).toBe(
      antes.termosVersao,
    )
  })

  it('recusa texto vazio e e-mail inválido', async () => {
    await expect(
      salvarConfiguracaoDaArea(db, em('2026-06-01T09:00:00Z'), {
        termosTexto: '   ',
      }),
    ).rejects.toBeInstanceOf(ErroDeConfiguracao)
    await expect(
      salvarConfiguracaoDaArea(db, em('2026-06-01T09:00:00Z'), {
        suporteEmail: 'sem-arroba',
      }),
    ).rejects.toThrow('e-mail de suporte')
    expect(await lerConfiguracaoDaArea(db)).toEqual(configuracaoPadrao)
  })

  describe('vídeo de boas-vindas', () => {
    it('sem configurar, não há vídeo', async () => {
      expect((await lerConfiguracaoDaArea(db)).boasVindasVimeo).toBeNull()
    })

    it('guarda o link do Vimeo no endereço do player e registra a ação', async () => {
      const salva = await salvarConfiguracaoDaArea(
        db,
        em('2026-06-01T09:00:00Z'),
        { boasVindasVimeo: 'https://vimeo.com/123456789/abcdef1234' },
        'dono',
      )
      expect(salva.boasVindasVimeo).toBe(
        'https://player.vimeo.com/video/123456789?h=abcdef1234',
      )
      expect((await lerConfiguracaoDaArea(db)).boasVindasVimeo).toBe(
        salva.boasVindasVimeo,
      )
      const acoes = await listarAcoes(db)
      expect(acoes).toHaveLength(1)
      expect(acoes[0]).toMatchObject({
        autorId: 'dono',
        acao: 'boas-vindas-alterada',
      })
      expect(rotuloDaAcao('boas-vindas-alterada')).toBe(
        'Vídeo de boas-vindas alterado',
      )
    })

    it('aceita o iframe colado inteiro e o link do player', async () => {
      const salva = await salvarConfiguracaoDaArea(
        db,
        em('2026-06-01T09:00:00Z'),
        {
          boasVindasVimeo:
            '<iframe src="https://player.vimeo.com/video/987654321?h=abc123"></iframe>',
        },
        'dono',
      )
      expect(salva.boasVindasVimeo).toBe(
        'https://player.vimeo.com/video/987654321?h=abc123',
      )
    })

    it('recusa o que não é link do Vimeo, sem registrar nada', async () => {
      for (const ruim of [
        'https://youtube.com/watch?v=12345678',
        '123456789',
        'qualquer coisa',
        'https://exemplo.com/vimeo.com/123456789',
      ]) {
        await expect(
          salvarConfiguracaoDaArea(
            db,
            em('2026-06-01T09:00:00Z'),
            { boasVindasVimeo: ruim },
            'dono',
          ),
        ).rejects.toThrow('Vimeo')
      }
      expect((await lerConfiguracaoDaArea(db)).boasVindasVimeo).toBeNull()
      expect(await listarAcoes(db)).toHaveLength(0)
    })

    it('campo vazio tira o vídeo; salvar o mesmo vídeo de novo não registra de novo', async () => {
      const link = 'https://vimeo.com/123456789'
      await salvarConfiguracaoDaArea(
        db,
        em('2026-06-01T09:00:00Z'),
        { boasVindasVimeo: link },
        'dono',
      )
      await salvarConfiguracaoDaArea(
        db,
        em('2026-06-01T09:01:00Z'),
        { boasVindasVimeo: link, suporteEmail: 'a@b.test' },
        'dono',
      )
      expect(await listarAcoes(db)).toHaveLength(1)
      const tirou = await salvarConfiguracaoDaArea(
        db,
        em('2026-06-01T09:02:00Z'),
        { boasVindasVimeo: '  ' },
        'dono',
      )
      expect(tirou.boasVindasVimeo).toBeNull()
      expect(await listarAcoes(db)).toHaveLength(2)
    })

    it('outros campos não mexem no vídeo', async () => {
      await salvarConfiguracaoDaArea(
        db,
        em('2026-06-01T09:00:00Z'),
        { boasVindasVimeo: 'https://vimeo.com/123456789' },
        'dono',
      )
      const depois = await salvarConfiguracaoDaArea(
        db,
        em('2026-06-01T09:01:00Z'),
        { termosTexto: 'Novo' },
        'dono',
      )
      expect(depois.boasVindasVimeo).toBe(
        'https://player.vimeo.com/video/123456789',
      )
    })
  })
})
