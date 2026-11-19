import { describe, expect, it, vi } from 'vitest'
import { user } from '#/db/schema'
import {
  criarAula,
  criarCurso,
  criarModulo,
  excluirAula,
} from '#/regras/conteudo'
import {
  concluirAula,
  dadosDeProgressoDosCursos,
  desmarcarAula,
  ErroDeProgresso,
  gravarProgresso,
  INTERVALO_MINIMO_S,
  lerProgressoDaAula,
  progressoDoCurso,
  registrarAbertura,
} from '#/regras/progresso'
import { criarBancoDeTeste } from '#/test/banco'

const T0 = new Date('2026-06-01T12:00:00Z')
let relogio = T0
const agora = () => relogio
const depois = (segundos: number) => {
  relogio = new Date(relogio.getTime() + segundos * 1000)
}

async function cenario() {
  relogio = T0
  const db = await criarBancoDeTeste()
  await db.insert(user).values({ id: 'ana', name: 'Ana', email: 'ana@x.test' })
  await db.insert(user).values({ id: 'bia', name: 'Bia', email: 'bia@x.test' })
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const m1 = await criarModulo(db, cursoId, { nome: 'Base' })
  const v1 = await criarAula(db, m1, { titulo: 'Vídeo 1', video: '123456' })
  const v2 = await criarAula(db, m1, { titulo: 'Vídeo 2', video: '234567' })
  const texto = await criarAula(db, m1, { titulo: 'Leitura' })
  return { db, cursoId, m1, v1, v2, texto }
}

const gravacao = (posicao: number, extra = {}) => ({
  posicao,
  duracao: 100,
  tempoTocando: 0,
  ...extra,
})

describe('gravar o progresso do vídeo', () => {
  it('guarda a última posição, o maior ponto e soma o tempo tocando', async () => {
    const { db, v1 } = await cenario()
    await gravarProgresso(
      db,
      agora,
      'ana',
      v1,
      gravacao(30, { tempoTocando: 30 }),
    )
    depois(INTERVALO_MINIMO_S)
    await gravarProgresso(
      db,
      agora,
      'ana',
      v1,
      gravacao(60, { tempoTocando: 28 }),
    )
    depois(INTERVALO_MINIMO_S)
    // Voltou para 10 s: a última posição muda, o maior ponto não diminui.
    await gravarProgresso(
      db,
      agora,
      'ana',
      v1,
      gravacao(10, { tempoTocando: 5 }),
    )
    expect(await lerProgressoDaAula(db, 'ana', v1)).toMatchObject({
      ultimaPosicao: 10,
      maiorPonto: 60,
      tempoTocando: 63,
      concluida: false,
    })
  })

  it('ignora gravação mais perto que o intervalo mínimo e avisa que não gravou', async () => {
    const { db, v1 } = await cenario()
    expect(
      (await gravarProgresso(db, agora, 'ana', v1, gravacao(10))).gravou,
    ).toBe(true)
    depois(INTERVALO_MINIMO_S - 1)
    expect(
      (await gravarProgresso(db, agora, 'ana', v1, gravacao(14))).gravou,
    ).toBe(false)
    expect((await lerProgressoDaAula(db, 'ana', v1)).ultimaPosicao).toBe(10)
    depois(1)
    expect(
      (await gravarProgresso(db, agora, 'ana', v1, gravacao(15))).gravou,
    ).toBe(true)
  })

  it('cada aluno tem o seu progresso', async () => {
    const { db, v1 } = await cenario()
    await gravarProgresso(db, agora, 'ana', v1, gravacao(40))
    expect((await lerProgressoDaAula(db, 'bia', v1)).ultimaPosicao).toBe(0)
  })

  it('não aceita posição fora do vídeo nem tempo tocando absurdo', async () => {
    const { db, v1 } = await cenario()
    await gravarProgresso(
      db,
      agora,
      'ana',
      v1,
      gravacao(5000, { tempoTocando: 99999 }),
    )
    const p = await lerProgressoDaAula(db, 'ana', v1)
    expect(p.ultimaPosicao).toBe(100)
    expect(p.tempoTocando).toBeLessThanOrEqual(120)
  })

  it('aula sem vídeo não recebe gravação do player', async () => {
    const { db, texto } = await cenario()
    await expect(
      gravarProgresso(db, agora, 'ana', texto, gravacao(10)),
    ).rejects.toThrow(ErroDeProgresso)
  })
})

describe('conclusão da aula', () => {
  it('conclui sozinha ao cruzar os 90% do vídeo', async () => {
    const { db, v1 } = await cenario()
    const a = await gravarProgresso(db, agora, 'ana', v1, gravacao(89))
    expect(a.concluiuAgora).toBe(false)
    depois(INTERVALO_MINIMO_S)
    const b = await gravarProgresso(db, agora, 'ana', v1, gravacao(90))
    expect(b.concluiuAgora).toBe(true)
    const p = await lerProgressoDaAula(db, 'ana', v1)
    expect(p.concluida).toBe(true)
    expect(p.concluidaEm).toEqual(relogio)
  })

  it('conclui no fim do vídeo mesmo com a gravação dentro do intervalo', async () => {
    const { db, v1 } = await cenario()
    await gravarProgresso(db, agora, 'ana', v1, gravacao(20))
    const r = await gravarProgresso(
      db,
      agora,
      'ana',
      v1,
      gravacao(99, { terminou: true }),
    )
    expect(r.concluiuAgora).toBe(true)
    expect((await lerProgressoDaAula(db, 'ana', v1)).ultimaPosicao).toBe(100)
  })

  it('concluir de novo não muda a data nem chama o gancho outra vez', async () => {
    const { db, v1 } = await cenario()
    const aoConcluirAula = vi.fn(async () => {})
    await concluirAula(db, agora, 'ana', v1, { aoConcluirAula })
    const primeira = (await lerProgressoDaAula(db, 'ana', v1)).concluidaEm
    depois(60)
    const r = await concluirAula(db, agora, 'ana', v1, { aoConcluirAula })
    expect(r.concluiuAgora).toBe(false)
    expect((await lerProgressoDaAula(db, 'ana', v1)).concluidaEm).toEqual(
      primeira,
    )
    expect(aoConcluirAula).toHaveBeenCalledTimes(1)
  })

  it('o botão conclui a qualquer momento e é o único caminho da aula sem vídeo', async () => {
    const { db, v1, texto } = await cenario()
    await concluirAula(db, agora, 'ana', texto)
    await concluirAula(db, agora, 'ana', v1)
    expect((await lerProgressoDaAula(db, 'ana', texto)).concluida).toBe(true)
    expect((await lerProgressoDaAula(db, 'ana', v1)).concluida).toBe(true)
  })

  it('o aluno desmarca; a posição fica e a aula não volta sozinha a cada gravação', async () => {
    const { db, v1 } = await cenario()
    const aoDesmarcarAula = vi.fn(async () => {})
    await gravarProgresso(db, agora, 'ana', v1, gravacao(95))
    expect((await lerProgressoDaAula(db, 'ana', v1)).concluida).toBe(true)
    const r = await desmarcarAula(db, agora, 'ana', v1, { aoDesmarcarAula })
    expect(r.desmarcouAgora).toBe(true)
    depois(INTERVALO_MINIMO_S)
    await gravarProgresso(db, agora, 'ana', v1, gravacao(96))
    const p = await lerProgressoDaAula(db, 'ana', v1)
    expect(p).toMatchObject({ concluida: false, maiorPonto: 96 })
    // Desmarcar o que não está concluído não faz nada.
    expect(
      (await desmarcarAula(db, agora, 'ana', v1, { aoDesmarcarAula }))
        .desmarcouAgora,
    ).toBe(false)
    expect(aoDesmarcarAula).toHaveBeenCalledTimes(1)
  })

  it('o gancho podeConcluir trava o botão e a conclusão automática', async () => {
    const { db, v1 } = await cenario()
    const podeConcluir = async () => false
    await expect(
      concluirAula(db, agora, 'ana', v1, { podeConcluir }),
    ).rejects.toThrow('ainda não pode')
    const r = await gravarProgresso(
      db,
      agora,
      'ana',
      v1,
      gravacao(100, { terminou: true }),
      {
        podeConcluir,
      },
    )
    expect(r).toEqual({ gravou: true, concluiuAgora: false })
    expect((await lerProgressoDaAula(db, 'ana', v1)).concluida).toBe(false)
  })

  it('o gancho aoConcluirAula roda na conclusão automática', async () => {
    const { db, v1 } = await cenario()
    const aoConcluirAula = vi.fn(async () => {})
    await gravarProgresso(db, agora, 'ana', v1, gravacao(91), {
      aoConcluirAula,
    })
    expect(aoConcluirAula).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'ana', aulaId: v1 }),
    )
  })

  it('aula que não existe ou foi excluída dá erro', async () => {
    const { db, v1 } = await cenario()
    await expect(concluirAula(db, agora, 'ana', 'nao-existe')).rejects.toThrow(
      ErroDeProgresso,
    )
    await excluirAula(db, agora, v1)
    await expect(registrarAbertura(db, agora, 'ana', v1)).rejects.toThrow(
      ErroDeProgresso,
    )
  })
})

describe('percentual e botão do curso', () => {
  it('calcula o percentual por curso, para baixo, só com o que o aluno concluiu', async () => {
    const { db, cursoId, v1, v2 } = await cenario()
    const outro = await criarCurso(db, { nome: 'Outro' })
    expect(await progressoDoCurso(db, 'ana', cursoId)).toMatchObject({
      totalDeAulas: 3,
      aulasConcluidas: 0,
      percentual: 0,
    })
    await concluirAula(db, agora, 'ana', v1)
    expect(await progressoDoCurso(db, 'ana', cursoId)).toMatchObject({
      aulasConcluidas: 1,
      percentual: 33,
    })
    expect(await progressoDoCurso(db, 'ana', outro)).toMatchObject({
      totalDeAulas: 0,
      percentual: 0,
    })
    await concluirAula(db, agora, 'ana', v2)
    expect((await progressoDoCurso(db, 'bia', cursoId)).percentual).toBe(0)
  })

  it('aula excluída sai do total e do percentual', async () => {
    const { db, cursoId, v1, v2, texto } = await cenario()
    await concluirAula(db, agora, 'ana', v1)
    await excluirAula(db, agora, v2)
    await excluirAula(db, agora, texto)
    expect((await progressoDoCurso(db, 'ana', cursoId)).percentual).toBe(100)
  })

  it('o botão leva à primeira aula não concluída, na ordem do curso', async () => {
    const { db, cursoId, v1, v2, texto } = await cenario()
    let p = await progressoDoCurso(db, 'ana', cursoId)
    expect(p).toMatchObject({ proximaAulaId: v1, jaComecou: false })
    await concluirAula(db, agora, 'ana', v1)
    await concluirAula(db, agora, 'ana', texto)
    p = await progressoDoCurso(db, 'ana', cursoId)
    expect(p).toMatchObject({ proximaAulaId: v2, jaComecou: true })
    expect(p.concluidas.sort()).toEqual([v1, texto].sort())
    await concluirAula(db, agora, 'ana', v2)
    expect(
      (await progressoDoCurso(db, 'ana', cursoId)).proximaAulaId,
    ).toBeNull()
  })

  it('o botão retoma a última aula aberta e não concluída, como o "Continuar assistindo"', async () => {
    const { db, cursoId, v1, v2 } = await cenario()
    await registrarAbertura(db, agora, 'ana', v1)
    depois(60)
    await registrarAbertura(db, agora, 'ana', v2)
    expect((await progressoDoCurso(db, 'ana', cursoId)).proximaAulaId).toBe(v2)
  })

  it('com a última aberta concluída, vai à próxima pendente depois dela', async () => {
    const { db, cursoId, v1, v2, texto } = await cenario()
    await registrarAbertura(db, agora, 'ana', v2)
    await concluirAula(db, agora, 'ana', v2)
    // v1 ficou para trás sem concluir: o botão segue em frente (texto) e não volta a ela.
    expect((await progressoDoCurso(db, 'ana', cursoId)).proximaAulaId).toBe(
      texto,
    )
    await concluirAula(db, agora, 'ana', texto)
    // Nada pendente depois da última aberta: volta à primeira pendente do curso.
    expect((await progressoDoCurso(db, 'ana', cursoId)).proximaAulaId).toBe(v1)
  })

  it('só considera as aulas liberadas', async () => {
    const { db, cursoId, v2, texto } = await cenario()
    const p = await progressoDoCurso(db, 'ana', cursoId, new Set([v2, texto]))
    expect(p.proximaAulaId).toBe(v2)
    expect(
      (await progressoDoCurso(db, 'ana', cursoId, new Set())).proximaAulaId,
    ).toBeNull()
  })

  it('abrir a aula conta como começar', async () => {
    const { db, cursoId, v1 } = await cenario()
    await registrarAbertura(db, agora, 'ana', v1)
    expect((await progressoDoCurso(db, 'ana', cursoId)).jaComecou).toBe(true)
  })
})

describe('dados do progresso dos cursos (Meus cursos)', () => {
  it('devolve as aulas na ordem, as concluídas e as abertas da aluna', async () => {
    const { db, cursoId, v1, v2 } = await cenario()
    await registrarAbertura(db, agora, 'ana', v1)
    await concluirAula(db, agora, 'ana', v1)
    depois(10)
    await registrarAbertura(db, agora, 'ana', v2)
    const d = await dadosDeProgressoDosCursos(db, 'ana', [cursoId])
    expect(d.aulas.map((a) => [a.titulo, a.moduloNome])).toEqual([
      ['Vídeo 1', 'Base'],
      ['Vídeo 2', 'Base'],
      ['Leitura', 'Base'],
    ])
    expect([...d.concluidas]).toEqual([v1])
    expect([...d.abertas.keys()].sort()).toEqual([v1, v2].sort())
    const outra = await dadosDeProgressoDosCursos(db, 'bia', [cursoId])
    expect(outra.concluidas.size).toBe(0)
    expect(outra.abertas.size).toBe(0)
  })
})
