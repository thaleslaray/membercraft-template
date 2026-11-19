import { describe, expect, it } from 'vitest'
import {
  agruparPorSituacao,
  faltamNoModulo,
  larguraDaBarra,
  montarMeusCursos,
  proximaAulaDoCurso,
  proximaAulaParaEstudar,
  rotuloDoProgresso,
  situacaoDoCurso,
} from '#/regras/meus-cursos'

const aulas = [
  {
    cursoId: 'c',
    moduloId: 'm1',
    moduloNome: 'Base',
    aulaId: 'a1',
    titulo: 'Um',
  },
  {
    cursoId: 'c',
    moduloId: 'm1',
    moduloNome: 'Base',
    aulaId: 'a2',
    titulo: 'Dois',
  },
  {
    cursoId: 'c',
    moduloId: 'm1',
    moduloNome: 'Base',
    aulaId: 'a3',
    titulo: 'Três',
  },
  {
    cursoId: 'c',
    moduloId: 'm2',
    moduloNome: 'Cor',
    aulaId: 'a4',
    titulo: 'Quatro',
  },
]

describe('situacaoDoCurso', () => {
  it('sem nada feito nem aberto, é para começar', () => {
    expect(situacaoDoCurso({ total: 4, feitas: 0, comecou: false })).toBe(
      'para-comecar',
    )
  })
  it('com aula concluída ou só aberta, está em andamento', () => {
    expect(situacaoDoCurso({ total: 4, feitas: 1, comecou: true })).toBe(
      'em-andamento',
    )
    expect(situacaoDoCurso({ total: 4, feitas: 0, comecou: true })).toBe(
      'em-andamento',
    )
  })
  it('com todas as aulas concluídas, está concluído', () => {
    expect(situacaoDoCurso({ total: 4, feitas: 4, comecou: true })).toBe(
      'concluido',
    )
  })
  it('curso sem aulas é para começar', () => {
    expect(situacaoDoCurso({ total: 0, feitas: 0, comecou: false })).toBe(
      'para-comecar',
    )
  })
})

describe('agruparPorSituacao', () => {
  const curso = (id: string, bloqueado = false) => ({ id, bloqueado })

  it('agrupa por situação e separa os sem acesso', () => {
    const grupos = agruparPorSituacao(
      [curso('a'), curso('b'), curso('c'), curso('d', true), curso('e')],
      {
        a: 'concluido',
        b: 'para-comecar',
        c: 'em-andamento',
        e: 'em-andamento',
      },
    )
    expect(grupos.emAndamento.map((c) => c.id)).toEqual(['c', 'e'])
    expect(grupos.paraComecar.map((c) => c.id)).toEqual(['b'])
    expect(grupos.concluidos.map((c) => c.id)).toEqual(['a'])
    expect(grupos.semAcesso.map((c) => c.id)).toEqual(['d'])
  })

  it('preserva a ordem de entrada (categoria e posição) dentro de cada grupo', () => {
    const grupos = agruparPorSituacao([curso('z'), curso('y'), curso('x')], {
      z: 'para-comecar',
      y: 'para-comecar',
      x: 'para-comecar',
    })
    expect(grupos.paraComecar.map((c) => c.id)).toEqual(['z', 'y', 'x'])
  })

  it('curso sem situação conhecida vai para começar', () => {
    expect(
      agruparPorSituacao([curso('q')], {}).paraComecar.map((c) => c.id),
    ).toEqual(['q'])
  })
})

describe('proximaAulaDoCurso', () => {
  it('sem nada aberto, é a primeira pendente', () => {
    expect(proximaAulaDoCurso(aulas, new Set(), new Map())?.aulaId).toBe('a1')
  })
  it('retoma na última aula aberta ainda pendente', () => {
    const abertas = new Map([
      ['a2', 2],
      ['a1', 1],
    ])
    expect(proximaAulaDoCurso(aulas, new Set(['a1']), abertas)?.aulaId).toBe(
      'a2',
    )
  })
  it('se a última aberta já foi concluída, vai para a próxima pendente depois dela', () => {
    const abertas = new Map([['a2', 2]])
    expect(proximaAulaDoCurso(aulas, new Set(['a2']), abertas)?.aulaId).toBe(
      'a3',
    )
  })
  it('ignora aulas que a aluna não pode abrir', () => {
    expect(
      proximaAulaDoCurso(aulas, new Set(), new Map(), new Set(['a3']))?.aulaId,
    ).toBe('a3')
  })
  it('curso concluído não tem próxima', () => {
    expect(
      proximaAulaDoCurso(aulas, new Set(['a1', 'a2', 'a3', 'a4']), new Map()),
    ).toBeNull()
  })
})

describe('montarMeusCursos', () => {
  const cursos = [
    { id: 'c1', nome: 'Um', bloqueado: false },
    { id: 'c2', nome: 'Dois', bloqueado: false },
    { id: 'c3', nome: 'Três', bloqueado: false },
    { id: 'c4', nome: 'Quatro', bloqueado: true },
  ]
  const a = (cursoId: string, n: number, moduloId = `${cursoId}m`) => ({
    cursoId,
    moduloId,
    moduloNome: `Módulo ${moduloId}`,
    aulaId: `${cursoId}a${n}`,
    titulo: `Aula ${cursoId}${n}`,
  })
  const dados = {
    aulas: [a('c1', 1), a('c1', 2), a('c2', 1), a('c2', 2), a('c3', 1)],
    concluidas: new Set(['c2a1', 'c2a2']),
    abertas: new Map([
      ['c1a1', 100],
      ['c2a2', 50],
    ]),
  }

  it('agrupa os cursos, com percentual e próxima aula em cada cartão', () => {
    const { grupos } = montarMeusCursos(cursos, dados)
    // c1 só teve uma aula aberta, nenhuma concluída: ainda é "para começar".
    expect(grupos.emAndamento.map((c) => c.id)).toEqual([])
    expect(grupos.concluidos.map((c) => c.id)).toEqual(['c2'])
    expect(grupos.paraComecar.map((c) => c.id)).toEqual(['c1', 'c3'])
    expect(grupos.semAcesso.map((c) => c.id)).toEqual(['c4'])
    expect(grupos.paraComecar[0]).toMatchObject({
      percentual: 0,
      proxima: { aulaId: 'c1a1', titulo: 'Aula c11' },
    })
    expect(grupos.concluidos[0]).toMatchObject({
      percentual: 100,
      proxima: null,
    })
  })

  it('curso com aula concluída fica em andamento', () => {
    const { grupos } = montarMeusCursos(cursos, {
      ...dados,
      concluidas: new Set([...dados.concluidas, 'c1a1']),
    })
    expect(grupos.emAndamento.map((c) => c.id)).toEqual(['c1'])
    expect(grupos.emAndamento[0]).toMatchObject({
      percentual: 50,
      proxima: { aulaId: 'c1a2' },
    })
  })

  it('abrir uma aula sem concluir nenhuma não põe o curso no destaque', () => {
    // c1 teve a aula 1 aberta mais recentemente, mas nada concluído: não vira destaque.
    expect(montarMeusCursos(cursos, dados).destaque).toBeNull()
  })

  it('o destaque é a próxima aula do curso aberto por último com aula concluída, com o que falta no módulo', () => {
    const { destaque } = montarMeusCursos(cursos, {
      ...dados,
      concluidas: new Set([...dados.concluidas, 'c1a1']),
    })
    expect(destaque).toMatchObject({
      curso: { id: 'c1' },
      aulaId: 'c1a2',
      aulaTitulo: 'Aula c12',
      moduloNome: 'Módulo c1m',
      faltam: 1,
    })
  })

  it('sem aula aberta e pendente, não há destaque', () => {
    expect(
      montarMeusCursos(cursos, { ...dados, abertas: new Map() }).destaque,
    ).toBeNull()
  })

  it('o destaque só leva a aula que a aluna pode abrir', () => {
    const comAula = {
      ...dados,
      concluidas: new Set([...dados.concluidas, 'c1a1']),
    }
    const { destaque } = montarMeusCursos(cursos, comAula, new Set(['c1a2']))
    expect(destaque).toMatchObject({ aulaId: 'c1a2' })
    expect(montarMeusCursos(cursos, comAula, new Set()).destaque).toBeNull()
  })

  it('o destaque é a próxima aula do curso com a aula aberta mais recente, não uma aula antiga', () => {
    const cursosAB = [
      { id: 'A', nome: 'A', bloqueado: false },
      { id: 'B', nome: 'B', bloqueado: false },
    ]
    const { destaque } = montarMeusCursos(cursosAB, {
      aulas: [a('A', 1), a('A', 2), a('B', 1), a('B', 2), a('B', 3), a('B', 4)],
      // A aula 2 do curso A ficou pela metade; depois a aluna abriu e concluiu a 3 do curso B.
      concluidas: new Set(['Aa1', 'Ba1', 'Ba2', 'Ba3']),
      abertas: new Map([
        ['Aa2', 10],
        ['Ba3', 20],
      ]),
    })
    expect(destaque).toMatchObject({ curso: { id: 'B' }, aulaId: 'Ba4' })
  })

  it('com o curso mais recente concluído, o destaque cai no curso aberto antes dele', () => {
    const cursosAB = [
      { id: 'A', nome: 'A', bloqueado: false },
      { id: 'B', nome: 'B', bloqueado: false },
    ]
    const { destaque } = montarMeusCursos(cursosAB, {
      aulas: [a('A', 1), a('A', 2), a('B', 1)],
      concluidas: new Set(['Aa1', 'Ba1']),
      abertas: new Map([
        ['Aa1', 10],
        ['Ba1', 20],
      ]),
    })
    expect(destaque).toMatchObject({ curso: { id: 'A' }, aulaId: 'Aa2' })
  })
})

describe('faltamNoModulo', () => {
  it('conta as aulas do módulo da aula que ainda não foram concluídas', () => {
    expect(faltamNoModulo(aulas, new Set(['a1']), 'a2')).toEqual({
      moduloNome: 'Base',
      faltam: 2,
    })
  })
  it('só olha o módulo da aula', () => {
    expect(faltamNoModulo(aulas, new Set(), 'a4')).toEqual({
      moduloNome: 'Cor',
      faltam: 1,
    })
  })
  it('aula desconhecida não tem módulo', () => {
    expect(faltamNoModulo(aulas, new Set(), 'zzz')).toBeNull()
  })
})

describe('proximaAulaParaEstudar', () => {
  const curso = (id: string, proxima: string | null) => ({
    id,
    proxima: proxima ? { aulaId: proxima, titulo: proxima } : null,
  })
  const vazio = { emAndamento: [], paraComecar: [] }

  it('prefere o destaque (a última aula aberta e pendente)', () => {
    expect(
      proximaAulaParaEstudar({
        destaque: { aulaId: 'x' },
        grupos: { ...vazio, emAndamento: [curso('c1', 'y')] },
      }),
    ).toBe('x')
  })

  it('sem destaque, usa a próxima aula do primeiro curso em andamento e depois dos para começar', () => {
    expect(
      proximaAulaParaEstudar({
        destaque: null,
        grupos: {
          ...vazio,
          emAndamento: [curso('c1', null), curso('c2', 'b')],
          paraComecar: [curso('c3', 'c')],
        },
      }),
    ).toBe('b')
    expect(
      proximaAulaParaEstudar({
        destaque: null,
        grupos: { ...vazio, paraComecar: [curso('c3', 'c')] },
      }),
    ).toBe('c')
  })

  it('sem nenhuma aula a estudar, devolve nulo (o botão leva a Meus cursos)', () => {
    expect(
      proximaAulaParaEstudar({
        destaque: null,
        grupos: { ...vazio, emAndamento: [curso('c4', null)] },
      }),
    ).toBeNull()
  })
})

describe('progresso nos cartões', () => {
  it('"Novo" vale só sem aula concluída, mesmo com percentual 0', () => {
    expect(rotuloDoProgresso({ feitas: 0, total: 10, percentual: 0 })).toEqual({
      tipo: 'novo',
      texto: 'Novo',
    })
    expect(rotuloDoProgresso({ feitas: 1, total: 300, percentual: 0 })).toEqual(
      { tipo: 'andamento', texto: '0%' },
    )
  })

  it('concluído quando todas as aulas estão feitas; curso sem aulas é novo', () => {
    expect(
      rotuloDoProgresso({ feitas: 3, total: 3, percentual: 100 }).tipo,
    ).toBe('concluido')
    expect(rotuloDoProgresso({ feitas: 0, total: 0, percentual: 0 }).tipo).toBe(
      'novo',
    )
  })

  it('a barra de quem concluiu alguma aula nunca fica invisível', () => {
    expect(larguraDaBarra(0, 1)).toBe(2)
    expect(larguraDaBarra(50, 5)).toBe(50)
    expect(larguraDaBarra(0, 0)).toBe(0)
    expect(larguraDaBarra(140, 9)).toBe(100)
  })
})
