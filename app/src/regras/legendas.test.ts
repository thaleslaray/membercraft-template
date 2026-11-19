import { describe, expect, it } from 'vitest'
import { lerLegendas, trechosDaLegenda } from '#/regras/legendas'

const SRT = `1
00:00:01,000 --> 00:00:03,500
Olá, <i>pessoal</i>!

2
00:01:02,250 --> 00:01:05,000
Hoje vamos falar
de decapagem.
`

const VTT = `WEBVTT - Aula

NOTE comentário da equipe

intro
00:05.000 --> 00:07.000 align:start position:0%
Bem-vindas &amp; bem-vindos

01:00:10.500 --> 01:00:12.000
<c.cor>Fim</c><00:01:00.900><c> da aula</c>
`

describe('leitor de legendas', () => {
  it('lê SRT: tempo em segundos, tira marcação e junta as linhas da legenda', () => {
    expect(lerLegendas(SRT)).toEqual([
      { inicio: 1, texto: 'Olá, pessoal!' },
      { inicio: 62, texto: 'Hoje vamos falar de decapagem.' },
    ])
  })

  it('lê VTT: ignora cabeçalho, nota, identificador e ajustes; aceita tempo sem hora', () => {
    expect(lerLegendas(VTT)).toEqual([
      { inicio: 5, texto: 'Bem-vindas & bem-vindos' },
      { inicio: 3610, texto: 'Fim da aula' },
    ])
  })

  it('aceita BOM e quebra de linha do Windows', () => {
    const r = lerLegendas(`﻿${SRT.replace(/\n/g, '\r\n')}`)
    expect(r.map((f) => f.inicio)).toEqual([1, 62])
  })

  it('arquivo sem legenda reconhecível dá lista vazia', () => {
    expect(lerLegendas('isto não é uma legenda')).toEqual([])
    expect(lerLegendas('')).toEqual([])
  })

  it('agrupa legendas vizinhas num trecho que começa na primeira', () => {
    const arquivo = [
      '1\n00:00:00,000 --> 00:00:02,000\nuse oxidante',
      '2\n00:00:02,000 --> 00:00:04,000\nde vinte volumes',
      '3\n00:00:30,000 --> 00:00:32,000\nagora o enxágue',
    ].join('\n\n')
    expect(trechosDaLegenda(arquivo)).toEqual([
      { inicio: 0, texto: 'use oxidante de vinte volumes' },
      { inicio: 30, texto: 'agora o enxágue' },
    ])
  })
})
