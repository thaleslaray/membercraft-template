import { describe, expect, it, vi } from 'vitest'
import { alertarTecnico, montarAlerta } from '#/regras/alerta-tecnico'

const agora = () => new Date('2026-06-01T12:00:00Z')

describe('montarAlerta', () => {
  it('o assunto diz a origem da falha', () => {
    expect(
      montarAlerta({ origem: 'webhook', detalhe: 'x' }, agora).subject,
    ).toBe('[Minha Escola] Falha no webhook da Voomp')
    expect(
      montarAlerta({ origem: 'email', detalhe: 'x' }, agora).subject,
    ).toContain('envio de e-mail')
    expect(
      montarAlerta({ origem: 'tarefa', detalhe: 'x' }, agora).subject,
    ).toContain('tarefa agendada')
    expect(
      montarAlerta({ origem: 'pdf', detalhe: 'x' }, agora).subject,
    ).toContain('PDF de um certificado')
  })

  it('o corpo traz detalhe e horário, com HTML escapado', () => {
    const { html, text } = montarAlerta(
      { origem: 'tarefa', detalhe: '<b>boom</b>' },
      agora,
    )
    expect(text).toContain('<b>boom</b>')
    expect(text).toContain('2026-06-01T12:00:00.000Z')
    expect(html).toContain('&lt;b&gt;boom&lt;/b&gt;')
    expect(html).not.toContain('<b>boom</b>')
  })
})

describe('alertarTecnico', () => {
  it('envia ao técnico', async () => {
    const enviar = vi.fn(async () => {})
    await alertarTecnico(
      { origem: 'email', detalhe: 'fila mortos' },
      agora,
      enviar,
    )
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(enviar).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'suporte@minhaescola.example' }),
    )
  })

  it('nunca lança, mesmo que o envio falhe', async () => {
    const enviar = vi.fn(async () => {
      throw new Error('sem provedor')
    })
    await expect(
      alertarTecnico({ origem: 'webhook', detalhe: 'x' }, agora, enviar),
    ).resolves.toBeUndefined()
  })
})
