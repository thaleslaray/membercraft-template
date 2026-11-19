import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import {
  aula as aulaDaTabela,
  avisoAgrupado,
  comentarioDaAula,
  matricula,
  notificacao,
  user,
} from '#/db/schema'
import { enviarAgrupamentosProntos } from '#/regras/agrupamento-envio'
import {
  agruparRespostasEmEmail,
  alterarComentarios,
  contarComentarios,
  criarComentario,
  ErroDeComentario,
  editarComentario,
  excluirComentario,
  fixarComentario,
  listarComentarios,
  moduloDaAula,
  PREFIXO_DA_RESPOSTA,
} from '#/regras/comentarios'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { limparExclusoesVencidas } from '#/regras/exclusao-protegida'
import { criarTurma } from '#/regras/matricula'
import { PermissaoNegada, type Pessoa } from '#/regras/permissoes'
import { TABELAS_COM_EXCLUSAO } from '#/regras/tabelas-com-exclusao'
import { criarBancoDeTeste } from '#/test/banco'

let relogio = new Date('2026-06-01T12:00:00Z')
const agora = () => relogio
const passar = (minutos: number) => {
  relogio = new Date(relogio.getTime() + minutos * 60_000)
}

const ana: Pessoa = { id: 'ana', perfil: 'aluno' }
const bia: Pessoa = { id: 'bia', perfil: 'aluno' }
const caio: Pessoa = { id: 'caio', perfil: 'aluno' }
const eq1: Pessoa = { id: 'eq', perfil: 'equipe' }

let n = 0
const chave = () => `k${++n}`

// Ana e Bia dividem a turma T1; Caio está na T2 (mesmo curso); a Equipe não tem matrícula.
async function cenario() {
  relogio = new Date('2026-06-01T12:00:00Z')
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana Souza', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
    { id: 'caio', name: 'Caio', email: 'caio@x.test' },
    { id: 'eq', name: 'Marina', email: 'eq@x.test', perfil: 'equipe' },
  ])
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const t1 = await criarTurma(db, { cursoId, nome: 'T1' })
  const t2 = await criarTurma(db, { cursoId, nome: 'T2' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Base' })
  const aula1 = await criarAula(db, moduloId, { titulo: 'Raiz' })
  const aula2 = await criarAula(db, moduloId, { titulo: 'Mechas' })
  for (const [userId, turmaId] of [
    ['ana', t1],
    ['bia', t1],
    ['caio', t2],
  ] as const) {
    await db.insert(matricula).values({
      id: `m-${userId}`,
      userId,
      turmaId,
      iniciaEm: agora(),
    })
  }
  return { db, cursoId, moduloId, aula1, aula2 }
}

const comentar = (
  db: Awaited<ReturnType<typeof criarBancoDeTeste>>,
  ator: Pessoa,
  aulaId: string,
  texto: string,
  paiId?: string,
  ganchos = {},
) =>
  criarComentario(
    db,
    agora,
    ator,
    { aulaId, texto, paiId, chaveDeEnvio: chave() },
    ganchos,
  )

describe('foto e bio do autor', () => {
  it('cada comentário traz foto e bio do autor (ou nulo), sem e-mail', async () => {
    const { db, aula1 } = await cenario()
    await db
      .update(user)
      .set({ image: '/api/imagens/avatar-ana', bio: 'Colorista de Recife' })
      .where(eq(user.id, 'ana'))
    const { id } = await comentar(db, ana, aula1, 'Oi')
    await comentar(db, bia, aula1, 'Oi!', id)
    const [c] = (await listarComentarios(db, ana, aula1)).comentarios
    expect(c).toMatchObject({
      autorImagem: '/api/imagens/avatar-ana',
      autorBio: 'Colorista de Recife',
    })
    expect(c.respostas[0]).toMatchObject({ autorImagem: null, autorBio: null })
    expect(JSON.stringify(c)).not.toContain('@')
  })
})

describe('criarComentario e responder', () => {
  it('cria o comentário em texto simples e a resposta de um nível', async () => {
    const { db, aula1 } = await cenario()
    const { id } = await comentar(db, ana, aula1, '  Como misturar o tom?  ')
    await comentar(db, bia, aula1, 'Use 1 para 2.', id)
    const lista = await listarComentarios(db, ana, aula1)
    expect(lista.comentarios).toHaveLength(1)
    expect(lista.comentarios[0].texto).toBe('Como misturar o tom?')
    expect(lista.comentarios[0].respostas.map((r) => r.texto)).toEqual([
      'Use 1 para 2.',
    ])
  })

  it('não aceita resposta de resposta, texto vazio, texto longo nem aula que não existe', async () => {
    const { db, aula1 } = await cenario()
    const { id } = await comentar(db, ana, aula1, 'Oi')
    const { id: resposta } = await comentar(db, bia, aula1, 'Oi!', id)
    await expect(comentar(db, ana, aula1, 'Ei', resposta)).rejects.toThrow(
      ErroDeComentario,
    )
    await expect(comentar(db, ana, aula1, '   ')).rejects.toThrow(
      ErroDeComentario,
    )
    await expect(comentar(db, ana, aula1, 'a'.repeat(2001))).rejects.toThrow(
      ErroDeComentario,
    )
    await expect(comentar(db, ana, 'nao-existe', 'Oi')).rejects.toThrow(
      ErroDeComentario,
    )
  })

  it('não responde um comentário de outra aula nem um que o aluno não pode ver', async () => {
    const { db, aula1, aula2 } = await cenario()
    const { id } = await comentar(db, ana, aula1, 'Oi')
    await expect(comentar(db, bia, aula2, 'Ei', id)).rejects.toThrow(
      ErroDeComentario,
    )
    // Caio é de outra turma: nem enxerga o comentário da Ana, então não responde.
    await expect(comentar(db, caio, aula1, 'Ei', id)).rejects.toThrow(
      ErroDeComentario,
    )
  })

  it('chave de envio repetida (clique duplo) cria um comentário só e não repete os avisos', async () => {
    const { db, aula1 } = await cenario()
    const { id } = await comentar(db, ana, aula1, 'Oi')
    const entrada = {
      aulaId: aula1,
      texto: 'Resposta',
      paiId: id,
      chaveDeEnvio: 'mesma',
    }
    const primeiro = await criarComentario(db, agora, bia, entrada)
    const segundo = await criarComentario(db, agora, bia, entrada)
    expect(primeiro.criado).toBe(true)
    expect(segundo).toEqual({ id: primeiro.id, criado: false })
    expect(await db.select().from(comentarioDaAula)).toHaveLength(2)
    expect(await db.select().from(notificacao)).toHaveLength(1)
    expect(await db.select().from(avisoAgrupado)).toHaveLength(1)
  })
})

describe('quem vê', () => {
  it('o aluno vê só os colegas da mesma turma, os próprios e a Equipe', async () => {
    const { db, aula1 } = await cenario()
    await comentar(db, ana, aula1, 'da Ana')
    await comentar(db, bia, aula1, 'da Bia')
    await comentar(db, caio, aula1, 'do Caio')
    await comentar(db, eq1, aula1, 'da Equipe')
    const textos = async (ator: Pessoa) =>
      (await listarComentarios(db, ator, aula1)).comentarios
        .map((c) => c.texto)
        .sort()
    expect(await textos(ana)).toEqual(['da Ana', 'da Bia', 'da Equipe'])
    expect(await textos(caio)).toEqual(['da Equipe', 'do Caio'])
    expect(await textos(eq1)).toHaveLength(4)
  })

  it('resposta de quem não é da turma não aparece, e a Equipe vem com o selo', async () => {
    const { db, aula1 } = await cenario()
    const { id } = await comentar(db, ana, aula1, 'Oi')
    await comentar(db, eq1, aula1, 'Resposta oficial', id)
    const [c] = (await listarComentarios(db, bia, aula1)).comentarios
    expect(c.respostas).toHaveLength(1)
    expect(c.respostas[0].autorEquipe).toBe(true)
    expect(c.autorEquipe).toBe(false)
    expect(c.seu).toBe(false)
    expect((await listarComentarios(db, ana, aula1)).comentarios[0].seu).toBe(
      true,
    )
  })

  it('pagina de 20 em 20, com os fixados primeiro', async () => {
    const { db, aula1 } = await cenario()
    let primeiro = ''
    for (let i = 0; i < 25; i++) {
      const { id } = await comentar(db, ana, aula1, `c${i}`)
      if (i === 0) primeiro = id
      passar(1)
    }
    await fixarComentario(db, agora, eq1, primeiro, true)
    const p1 = await listarComentarios(db, ana, aula1, 1)
    const p2 = await listarComentarios(db, ana, aula1, 2)
    expect(p1.comentarios).toHaveLength(20)
    expect(p1.temMais).toBe(true)
    expect(p1.comentarios[0]).toMatchObject({ id: primeiro, fixado: true })
    expect(p1.comentarios[1].texto).toBe('c24')
    expect(p2.comentarios).toHaveLength(5)
    expect(p2.temMais).toBe(false)
  })
})

describe('editar e excluir', () => {
  it('o autor edita e exclui o seu; o colega não mexe no dos outros', async () => {
    const { db, aula1 } = await cenario()
    const { id } = await comentar(db, ana, aula1, 'Oi')
    await expect(editarComentario(db, agora, bia, id, 'x')).rejects.toThrow(
      ErroDeComentario,
    )
    await expect(excluirComentario(db, agora, bia, id)).rejects.toThrow(
      ErroDeComentario,
    )
    await editarComentario(db, agora, ana, id, 'Oi, tudo bem?')
    const [c] = (await listarComentarios(db, ana, aula1)).comentarios
    expect(c).toMatchObject({ texto: 'Oi, tudo bem?', editado: true })
    await excluirComentario(db, agora, ana, id)
    expect((await listarComentarios(db, ana, aula1)).comentarios).toHaveLength(
      0,
    )
  })

  it('a exclusão é protegida: a linha fica com a data, leva as respostas e some só depois de 30 dias', async () => {
    const { db, aula1 } = await cenario()
    const { id } = await comentar(db, ana, aula1, 'Oi')
    await comentar(db, bia, aula1, 'Resposta', id)
    await excluirComentario(db, agora, ana, id)
    const linhas = await db.select().from(comentarioDaAula)
    expect(linhas).toHaveLength(2)
    expect(linhas.every((l) => l.excluidoEm !== null)).toBe(true)
    await expect(editarComentario(db, agora, ana, id, 'x')).rejects.toThrow(
      ErroDeComentario,
    )

    expect(
      (await limparExclusoesVencidas(db, agora, TABELAS_COM_EXCLUSAO)).apagadas
        .comentario_da_aula,
    ).toBe(0)
    passar(31 * 24 * 60)
    // A resposta sai junto com o comentário (chave estrangeira em cascata).
    expect(
      (await limparExclusoesVencidas(db, agora, TABELAS_COM_EXCLUSAO)).apagadas
        .comentario_da_aula,
    ).toBeGreaterThan(0)
    expect(await db.select().from(comentarioDaAula)).toHaveLength(0)
  })

  it('a Equipe edita e exclui qualquer um; o aluno não fixa', async () => {
    const { db, aula1 } = await cenario()
    const { id } = await comentar(db, ana, aula1, 'Oi')
    await editarComentario(db, agora, eq1, id, 'Texto revisado')
    await expect(fixarComentario(db, agora, ana, id, true)).rejects.toThrow(
      PermissaoNegada,
    )
    await excluirComentario(db, agora, eq1, id)
    expect((await listarComentarios(db, ana, aula1)).comentarios).toHaveLength(
      0,
    )
  })

  it('não fixa resposta; desafixar tira do alto', async () => {
    const { db, aula1 } = await cenario()
    const { id } = await comentar(db, ana, aula1, 'Oi')
    const { id: resp } = await comentar(db, bia, aula1, 'Ei', id)
    await expect(fixarComentario(db, agora, eq1, resp, true)).rejects.toThrow(
      ErroDeComentario,
    )
    await fixarComentario(db, agora, eq1, id, true)
    await fixarComentario(db, agora, eq1, id, false)
    expect(
      (await listarComentarios(db, ana, aula1)).comentarios[0].fixado,
    ).toBe(false)
  })
})

describe('desligar comentários', () => {
  it('desligar a aula esconde dos alunos, trava novos comentários e a Equipe continua vendo', async () => {
    const { db, aula1, aula2 } = await cenario()
    await comentar(db, ana, aula1, 'Oi')
    await expect(
      alterarComentarios(db, agora, ana, { tipo: 'aula', id: aula1 }, false),
    ).rejects.toThrow(PermissaoNegada)
    await alterarComentarios(db, agora, eq1, { tipo: 'aula', id: aula1 }, false)
    const doAluno = await listarComentarios(db, bia, aula1)
    expect(doAluno).toMatchObject({ ligados: false, comentarios: [] })
    expect((await listarComentarios(db, eq1, aula1)).comentarios).toHaveLength(
      1,
    )
    await expect(comentar(db, bia, aula1, 'Ei')).rejects.toThrow(/desligados/)
    await comentar(db, bia, aula2, 'Outra aula segue ligada')
    await alterarComentarios(db, agora, eq1, { tipo: 'aula', id: aula1 }, true)
    expect((await listarComentarios(db, bia, aula1)).ligados).toBe(true)
  })

  it('desligar o módulo vale para todas as aulas dele', async () => {
    const { db, moduloId, aula1, aula2 } = await cenario()
    await alterarComentarios(
      db,
      agora,
      eq1,
      { tipo: 'modulo', id: moduloId },
      false,
    )
    for (const aulaId of [aula1, aula2]) {
      const lista = await listarComentarios(db, ana, aulaId)
      expect(lista.ligados).toBe(false)
      await expect(comentar(db, ana, aulaId, 'Oi')).rejects.toThrow(
        ErroDeComentario,
      )
    }
    expect((await listarComentarios(db, eq1, aula1)).desligadosNoModulo).toBe(
      true,
    )
  })

  it('desligar duas vezes não duplica e alvo que não existe dá erro', async () => {
    const { db, aula1 } = await cenario()
    await alterarComentarios(db, agora, eq1, { tipo: 'aula', id: aula1 }, false)
    await alterarComentarios(db, agora, eq1, { tipo: 'aula', id: aula1 }, false)
    await expect(
      alterarComentarios(db, agora, eq1, { tipo: 'modulo', id: 'x' }, false),
    ).rejects.toThrow(ErroDeComentario)
  })
})

describe('resposta avisa', () => {
  it('responder avisa o autor no sininho e põe o aviso no agrupamento', async () => {
    const { db, aula1 } = await cenario()
    const { id } = await comentar(db, ana, aula1, 'Oi')
    await comentar(db, bia, aula1, 'Respondendo', id)
    const [aviso] = await db.select().from(notificacao)
    expect(aviso).toMatchObject({
      userId: 'ana',
      tipo: 'resposta-ao-comentario',
      link: `/aulas/${aula1}`,
    })
    expect(aviso.texto).toContain('Bia')
    const [agrupado] = await db.select().from(avisoAgrupado)
    expect(agrupado.chave).toBe('resposta-ao-comentario:ana')
  })

  it('comentário novo e resposta ao próprio comentário não avisam ninguém', async () => {
    const { db, aula1 } = await cenario()
    const { id } = await comentar(db, ana, aula1, 'Oi')
    await comentar(db, ana, aula1, 'Complemento', id)
    expect(await db.select().from(notificacao)).toHaveLength(0)
    expect(await db.select().from(avisoAgrupado)).toHaveLength(0)
  })

  it('as respostas de 15 minutos saem num e-mail só, e a coleta chama o agrupador do prefixo', async () => {
    const { db, aula1 } = await cenario()
    const agrupadores = {
      [PREFIXO_DA_RESPOSTA]: agruparRespostasEmEmail,
    }
    const { id } = await comentar(db, ana, aula1, 'Oi')
    await comentar(db, bia, aula1, 'Primeira resposta', id)
    passar(5)
    await comentar(db, eq1, aula1, 'Segunda resposta', id)
    const pedirEmail = vi.fn(async () => null)

    passar(5)
    await enviarAgrupamentosProntos(
      db,
      agora,
      { pedirEmail, baseDoApp: 'https://escola.exemplo' },
      agrupadores,
    )
    expect(pedirEmail).not.toHaveBeenCalled()

    passar(6)
    await enviarAgrupamentosProntos(
      db,
      agora,
      { pedirEmail, baseDoApp: 'https://escola.exemplo' },
      agrupadores,
    )
    expect(pedirEmail).toHaveBeenCalledTimes(1)
    expect(pedirEmail).toHaveBeenCalledWith({
      tipo: 'resposta-ao-comentario',
      para: 'ana@x.test',
      userId: 'ana',
      variaveis: {
        nome: 'Ana',
        quantidade: '2',
        respostas: 'Bia: Primeira resposta\nMarina: Segunda resposta',
      },
    })
  })
})

describe('ganchos de pontos', () => {
  it('aoComentarPelaPrimeiraVezNaAula roda uma vez por aula; excluir e comentar de novo conta como primeira', async () => {
    const { db, aula1, aula2 } = await cenario()
    const aoComentarPelaPrimeiraVezNaAula = vi.fn(async () => {})
    const ganchos = { aoComentarPelaPrimeiraVezNaAula }
    const { id } = await comentar(db, ana, aula1, 'Um', undefined, ganchos)
    await comentar(db, ana, aula1, 'Dois', undefined, ganchos)
    await comentar(db, ana, aula2, 'Outra aula', undefined, ganchos)
    expect(aoComentarPelaPrimeiraVezNaAula).toHaveBeenCalledTimes(2)
    expect(aoComentarPelaPrimeiraVezNaAula).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'ana',
        aulaId: aula1,
        comentarioId: id,
      }),
    )
    // Chave repetida não é comentário novo: não pontua de novo.
    await criarComentario(
      db,
      agora,
      ana,
      { aulaId: aula2, texto: 'Outra aula', chaveDeEnvio: 'fixa' },
      ganchos,
    )
    await criarComentario(
      db,
      agora,
      ana,
      { aulaId: aula2, texto: 'Outra aula', chaveDeEnvio: 'fixa' },
      ganchos,
    )
    expect(aoComentarPelaPrimeiraVezNaAula).toHaveBeenCalledTimes(2)
  })

  it('aoExcluirComentario leva quantos comentários vivos o autor ainda tem na aula', async () => {
    const { db, aula1 } = await cenario()
    const aoExcluirComentario = vi.fn(async () => {})
    const { id: a } = await comentar(db, ana, aula1, 'Um')
    const { id: b } = await comentar(db, ana, aula1, 'Dois')
    await excluirComentario(db, agora, ana, a, { aoExcluirComentario })
    expect(aoExcluirComentario).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: 'ana',
        aulaId: aula1,
        comentarioId: a,
        restantesDoAutorNaAula: 1,
      }),
    )
    await excluirComentario(db, agora, eq1, b, { aoExcluirComentario })
    expect(aoExcluirComentario).toHaveBeenLastCalledWith(
      expect.objectContaining({ comentarioId: b, restantesDoAutorNaAula: 0 }),
    )
  })

  it('excluir um comentário com respostas chama o gancho para cada autor atingido', async () => {
    const { db, aula1 } = await cenario()
    const aoExcluirComentario = vi.fn(async () => {})
    const { id } = await comentar(db, ana, aula1, 'Um')
    await comentar(db, bia, aula1, 'Resposta', id)
    await excluirComentario(db, agora, ana, id, { aoExcluirComentario })
    const autores = aoExcluirComentario.mock.calls.map(
      (c) => (c as unknown as [{ userId: string }])[0].userId,
    )
    expect(autores.sort()).toEqual(['ana', 'bia'])
  })
})

describe('contarComentarios', () => {
  it('conta no período e por curso, sem os excluídos', async () => {
    const { db, cursoId, aula1 } = await cenario()
    const outroCurso = await criarCurso(db, { nome: 'Corte' })
    const outroModulo = await criarModulo(db, outroCurso, { nome: 'M' })
    const outraAula = await criarAula(db, outroModulo, { titulo: 'A' })
    await comentar(db, ana, aula1, 'Um')
    const { id } = await comentar(db, ana, aula1, 'Dois')
    await comentar(db, eq1, outraAula, 'Três')
    await excluirComentario(db, agora, ana, id)
    const periodo = {
      de: new Date('2026-06-01T00:00:00Z'),
      ate: new Date('2026-06-02T00:00:00Z'),
    }
    expect(await contarComentarios(db, periodo)).toBe(2)
    expect(await contarComentarios(db, periodo, cursoId)).toBe(1)
    expect(
      await contarComentarios(db, {
        de: new Date('2026-06-02T00:00:00Z'),
        ate: new Date('2026-06-03T00:00:00Z'),
      }),
    ).toBe(0)
  })
})

describe('apagador de aluno', () => {
  it('excluir a conta apaga os comentários dele e as respostas dos outros a eles', async () => {
    const { db, aula1 } = await cenario()
    const { excluirAluno } = await import('#/regras/exclusao-de-aluno')
    await db.insert(user).values({
      id: 'dono',
      name: 'D',
      email: 'd@x.test',
      perfil: 'proprietario',
    })
    const { id } = await comentar(db, ana, aula1, 'Da Ana')
    await comentar(db, bia, aula1, 'Resposta da Bia', id)
    await comentar(db, bia, aula1, 'Outro da Bia')
    await excluirAluno(db, agora, { autorId: 'dono', userId: 'ana' })
    const restantes = await db.select().from(comentarioDaAula)
    expect(restantes.map((r) => r.texto)).toEqual(['Outro da Bia'])
    expect(
      await db
        .select()
        .from(avisoAgrupado)
        .where(eq(avisoAgrupado.chave, 'resposta-ao-comentario:ana')),
    ).toHaveLength(0)
  })
})

describe('moduloDaAula', () => {
  it('devolve o módulo da aula e recusa aula que não existe', async () => {
    const { db, aula1 } = await cenario()
    const [linha] = await db
      .select({ moduloId: aulaDaTabela.moduloId })
      .from(aulaDaTabela)
      .where(eq(aulaDaTabela.id, aula1))
    expect(await moduloDaAula(db, aula1)).toBe(linha.moduloId)
    await expect(moduloDaAula(db, 'nada')).rejects.toThrow(ErroDeComentario)
  })
})
