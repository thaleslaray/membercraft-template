import { describe, expect, it } from 'vitest'
import { botaoDoCurso, modulosAbertos } from '#/lib/curso-tela'

const modulos = [
  {
    id: 'm1',
    aulas: [
      { id: 'a1', titulo: 'Boas-vindas' },
      { id: 'a2', titulo: 'Instalação' },
    ],
  },
  { id: 'm2', aulas: [{ id: 'a3', titulo: 'Primeiro projeto' }] },
  { id: 'm3', aulas: [{ id: 'a4', titulo: 'Publicar' }] },
]

describe('botaoDoCurso', () => {
  it('curso nunca aberto: "Começar: <primeira aula>"', () => {
    expect(
      botaoDoCurso({
        modulos,
        passo: { jaComecou: false, proximaAulaId: 'a1' },
        certificadoPronto: false,
      }),
    ).toEqual({ tipo: 'aula', aulaId: 'a1', rotulo: 'Começar: Boas-vindas' })
  })

  it('curso em andamento: "Continuar: <próxima aula>"', () => {
    expect(
      botaoDoCurso({
        modulos,
        passo: { jaComecou: true, proximaAulaId: 'a3' },
        certificadoPronto: false,
      }),
    ).toEqual({
      tipo: 'aula',
      aulaId: 'a3',
      rotulo: 'Continuar: Primeiro projeto',
    })
  })

  it('curso terminado com certificado para ver: "Ver certificado"', () => {
    expect(
      botaoDoCurso({
        modulos,
        passo: { jaComecou: true, proximaAulaId: null },
        certificadoPronto: true,
      }),
    ).toEqual({ tipo: 'certificado', rotulo: 'Ver certificado' })
  })

  it('curso terminado sem certificado: "Rever o curso" pela primeira aula', () => {
    expect(
      botaoDoCurso({
        modulos,
        passo: { jaComecou: true, proximaAulaId: null },
        certificadoPronto: false,
      }),
    ).toEqual({ tipo: 'aula', aulaId: 'a1', rotulo: 'Rever o curso' })
  })

  it('curso sem aulas: sem botão', () => {
    expect(
      botaoDoCurso({
        modulos: [{ id: 'm', aulas: [] }],
        passo: { jaComecou: false, proximaAulaId: null },
        certificadoPronto: false,
      }),
    ).toBeNull()
  })

  it('sem passo (leitura falhou): começa pela primeira aula', () => {
    expect(
      botaoDoCurso({ modulos, passo: null, certificadoPronto: false }),
    ).toMatchObject({
      tipo: 'aula',
      aulaId: 'a1',
      rotulo: 'Começar: Boas-vindas',
    })
  })
})

describe('modulosAbertos', () => {
  it('fecha os concluídos e abre o da próxima aula e os que faltam', () => {
    expect(modulosAbertos(modulos, ['a1', 'a2'], 'a3')).toEqual(['m2', 'm3'])
  })

  it('o módulo da próxima aula fica aberto mesmo concluído por inteiro', () => {
    expect(modulosAbertos(modulos, ['a1', 'a2'], 'a1')).toContain('m1')
  })

  it('curso todo concluído: tudo recolhido', () => {
    expect(modulosAbertos(modulos, ['a1', 'a2', 'a3', 'a4'], null)).toEqual([])
  })

  it('módulo sem aulas não conta como concluído', () => {
    expect(modulosAbertos([{ id: 'x', aulas: [] }], [], null)).toEqual(['x'])
  })
})
