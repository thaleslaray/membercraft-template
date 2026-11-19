import { describe, expect, it } from 'vitest'

import {
  montarRegistroPerf,
  nomeDaServerFn,
  resumirIdas,
  telaDoReferer,
} from '#/db/d1-trace'

describe('resumirIdas', () => {
  it('conta idas em fila uma atrás da outra', () => {
    expect(
      resumirIdas([
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 20, end: 30 },
      ]),
    ).toEqual({ idas: 3, emFila: 3 })
  })

  it('idas que se sobrepõem não aumentam a fila', () => {
    expect(
      resumirIdas([
        { start: 0, end: 10 },
        { start: 2, end: 12 },
        { start: 12, end: 20 },
      ]),
    ).toEqual({ idas: 3, emFila: 2 })
  })

  it('sem idas', () => {
    expect(resumirIdas([])).toEqual({ idas: 0, emFila: 0 })
  })
})

const idDe = (texto: string) => Buffer.from(texto).toString('base64url')

describe('nomeDaServerFn', () => {
  it('lê o nome do export no id em base64url', () => {
    const id = idDe(
      '{"file":"/@id/src/lib/equipe-fns.ts","export":"resumoDiarioFn_createServerFn_handler"}',
    )
    expect(nomeDaServerFn(`/_serverFn/${id}`)).toBe('resumoDiarioFn')
    expect(nomeDaServerFn(`/_serverFn/${id}?payload=%7B%7D`)).toBe(
      'resumoDiarioFn',
    )
  })

  it('devolve o id cru quando não dá para decodificar', () => {
    expect(nomeDaServerFn('/_serverFn/a1b2c3d4')).toBe('a1b2c3d4')
    expect(nomeDaServerFn(`/_serverFn/${idDe('texto sem export')}`)).toBe(
      idDe('texto sem export'),
    )
  })

  it('fora de /_serverFn/ é null', () => {
    expect(nomeDaServerFn('/painel/turmas')).toBeNull()
  })
})

describe('telaDoReferer', () => {
  it('pega só o pathname', () => {
    expect(telaDoReferer('http://localhost:3040/painel/turmas?x=1')).toBe(
      '/painel/turmas',
    )
    expect(telaDoReferer(null)).toBeNull()
    expect(telaDoReferer('lixo')).toBeNull()
  })
})

describe('montarRegistroPerf', () => {
  it('monta o registro com idas, fila e consultas em ordem', () => {
    const id = idDe(
      '{"file":"x","export":"painelDeTurmasFn_createServerFn_handler"}',
    )
    const registro = montarRegistroPerf({
      metodo: 'GET',
      url: `http://localhost:3040/_serverFn/${id}?payload=1`,
      referer: 'http://localhost:3040/painel/conteudo',
      status: 200,
      ms: 42.349,
      idas: [
        { sql: 'select turma', start: 13.04, end: 21.04 },
        { sql: 'select user', start: 1, end: 13 },
      ],
      colo: 'GRU',
    })
    expect(registro).toEqual({
      perf: 1,
      metodo: 'GET',
      caminho: `/_serverFn/${id}`,
      fn: 'painelDeTurmasFn',
      tela: '/painel/conteudo',
      status: 200,
      ms: 42.3,
      idas: 2,
      emFila: 2,
      consultas: [
        { t: 'select user', ms: 12, em: 1 },
        { t: 'select turma', ms: 8, em: 13 },
      ],
      colo: 'GRU',
    })
  })

  it('pedido de página sem idas, sem referer e sem colo', () => {
    const registro = montarRegistroPerf({
      metodo: 'GET',
      url: 'http://localhost:3040/painel',
      referer: null,
      status: 302,
      ms: 3,
      idas: [],
    })
    expect(registro).toMatchObject({
      fn: null,
      tela: null,
      idas: 0,
      emFila: 0,
      consultas: [],
      colo: null,
    })
  })
})
