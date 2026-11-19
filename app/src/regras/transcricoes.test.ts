import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { modulo, trechoDaTranscricao, user } from '#/db/schema'
import { buscar } from '#/regras/busca'
import {
  criarAula,
  criarCurso,
  criarModulo,
  editarAula,
  excluirAula,
} from '#/regras/conteudo'
import {
  importarTranscricoes,
  listarTranscricoes,
  trechosDeTranscricao,
  vimeoIdDoArquivo,
} from '#/regras/transcricoes'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

const legenda = (...falas: [string, string][]) =>
  falas
    .map(([t, texto], i) => `${i + 1}\n${t},000 --> ${t},900\n${texto}`)
    .join('\n\n')

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values({ id: 'ana', name: 'Ana', email: 'ana@x.test' })
  const curso = await criarCurso(db, { nome: 'Coloração' })
  const mod = await criarModulo(db, curso, { nome: 'Base' })
  const raiz = await criarAula(db, mod, {
    titulo: 'Retoque de raiz',
    video: 'https://vimeo.com/111111111/abc123def4',
  })
  const mechas = await criarAula(db, mod, {
    titulo: 'Mechas',
    video: '222222222',
  })
  return { db, curso, raiz, mechas }
}

describe('nome do arquivo', () => {
  it('pega o ID do Vimeo no começo do nome', () => {
    expect(vimeoIdDoArquivo('123456789.srt')).toBe('123456789')
    expect(vimeoIdDoArquivo('pasta/123456789.pt-BR.vtt')).toBe('123456789')
    expect(vimeoIdDoArquivo('123456789_legenda.srt')).toBe('123456789')
    expect(vimeoIdDoArquivo('aula-123456789.srt')).toBeNull()
    expect(vimeoIdDoArquivo('12.srt')).toBeNull()
  })
})

describe('importar transcrições', () => {
  it('casa o arquivo com a aula pelo ID do vídeo e lista o que não achou aula', async () => {
    const { db } = await cenario()
    const r = await importarTranscricoes(db, agora, [
      {
        nome: '111111111.srt',
        conteudo: legenda(['00:00:05', 'fala sobre decapagem']),
      },
      {
        nome: '999999999.srt',
        conteudo: legenda(['00:00:05', 'vídeo sem aula']),
      },
      { nome: 'sem-id.srt', conteudo: legenda(['00:00:05', 'x']) },
      { nome: '222222222.vtt', conteudo: 'WEBVTT\n\nnada legível' },
    ])
    expect(r.importadas).toEqual([
      {
        nome: '111111111.srt',
        vimeoId: '111111111',
        aulas: ['Retoque de raiz'],
        trechos: 1,
        substituiu: false,
      },
    ])
    expect(r.ignorados).toEqual([
      { nome: '999999999.srt', motivo: 'sem-aula' },
      { nome: 'sem-id.srt', motivo: 'sem-id' },
      { nome: '222222222.vtt', motivo: 'sem-legenda' },
    ])
    expect(await listarTranscricoes(db)).toMatchObject([
      { vimeoId: '111111111', trechos: 1, aulas: ['Retoque de raiz'] },
    ])
  })

  it('aula excluída não conta como aula do vídeo', async () => {
    const { db, raiz } = await cenario()
    await excluirAula(db, agora, raiz)
    const r = await importarTranscricoes(db, agora, [
      { nome: '111111111.srt', conteudo: legenda(['00:00:05', 'x']) },
    ])
    expect(r.ignorados).toEqual([{ nome: '111111111.srt', motivo: 'sem-aula' }])
  })

  it('arquivo novo do mesmo vídeo substitui o anterior por inteiro', async () => {
    const { db } = await cenario()
    await importarTranscricoes(db, agora, [
      {
        nome: '111111111.srt',
        conteudo: legenda(
          ['00:00:05', 'velho assunto'],
          ['00:01:00', 'outro velho'],
        ),
      },
    ])
    const r = await importarTranscricoes(db, agora, [
      {
        nome: '111111111.vtt',
        conteudo: legenda(['00:00:10', 'novo assunto']),
      },
    ])
    expect(r.importadas[0]).toMatchObject({ substituiu: true, trechos: 1 })
    const textos = await db
      .select()
      .from(trechoDaTranscricao)
      .where(eq(trechoDaTranscricao.vimeoId, '111111111'))
    expect(textos.map((t) => t.texto)).toEqual(['novo assunto'])
    const lista = await listarTranscricoes(db)
    expect(lista).toHaveLength(1)
    expect(lista[0].arquivo).toBe('111111111.vtt')
  })

  it('grava transcrição longa em vários comandos', async () => {
    const { db } = await cenario()
    const falas = Array.from({ length: 200 }, (_, i) => [
      `00:${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
      `fala ${i}`,
    ]) as [string, string][]
    const r = await importarTranscricoes(db, agora, [
      { nome: '222222222.srt', conteudo: legenda(...falas) },
    ])
    expect(r.importadas[0].trechos).toBeGreaterThan(50)
    expect((await listarTranscricoes(db))[0].trechos).toBe(
      r.importadas[0].trechos,
    )
  })
})

describe('busca nas transcrições', () => {
  async function comTranscricoes() {
    const c = await cenario()
    await importarTranscricoes(c.db, agora, [
      {
        nome: '111111111.srt',
        conteudo: legenda(
          ['00:00:05', 'bem-vindas à aula'],
          ['00:03:20', 'agora a Decapagem do fio com 100% de cuidado'],
        ),
      },
    ])
    return c
  }
  const opcoes = (
    db: Awaited<ReturnType<typeof cenario>>['db'],
    termo: string,
  ) => ({
    userId: 'ana',
    cursosPermitidos: 'todos' as const,
    termo,
    trechosExtras: trechosDeTranscricao(db, termo),
  })

  it('acha a fala sem acento nem maiúscula e devolve o minuto, sem expor o texto', async () => {
    const { db, raiz } = await comTranscricoes()
    const r = await buscar(db, opcoes(db, 'decapagem'))
    expect(r.contagem.aulas).toBe(1)
    expect(r.resultados[0]).toMatchObject({
      aulaId: raiz,
      tempo: 200,
      trecho: null,
    })
  })

  it('exige todas as palavras no mesmo trecho', async () => {
    const { db } = await comTranscricoes()
    expect(
      (await buscar(db, opcoes(db, 'decapagem fio'))).resultados,
    ).toHaveLength(1)
    expect(
      (await buscar(db, opcoes(db, 'decapagem bem-vindas'))).resultados,
    ).toHaveLength(0)
  })

  it('trata % e _ do termo como texto comum', async () => {
    const { db } = await comTranscricoes()
    expect((await buscar(db, opcoes(db, '%'))).resultados).toHaveLength(1)
    expect((await buscar(db, opcoes(db, 'd_capagem'))).resultados).toHaveLength(
      0,
    )
  })

  it('só olha aulas pedidas e não excluídas', async () => {
    const { db, raiz } = await comTranscricoes()
    const f = trechosDeTranscricao(db, 'decapagem')
    expect(await f(['outra'])).toEqual([])
    expect(await f([raiz])).toHaveLength(1)
    await excluirAula(db, agora, raiz)
    expect(await f([raiz])).toEqual([])
  })

  it('a transcrição vale para toda aula que usa o vídeo e segue o vídeo da aula', async () => {
    const { db, mechas } = await comTranscricoes()
    await editarAula(db, mechas, { titulo: 'Mechas', video: '111111111' })
    expect((await buscar(db, opcoes(db, 'decapagem'))).resultados).toHaveLength(
      2,
    )
    await editarAula(db, mechas, { titulo: 'Mechas', video: '222222222' })
    expect((await buscar(db, opcoes(db, 'decapagem'))).resultados).toHaveLength(
      1,
    )
  })

  it('aula de curso não permitido não aparece, mesmo com a fala igual', async () => {
    const { db, curso, raiz } = await comTranscricoes()
    const outro = await criarCurso(db, { nome: 'Corte' })
    const mod = await criarModulo(db, outro, { nome: 'Base' })
    const alheia = await criarAula(db, mod, {
      titulo: 'Alheia',
      video: '111111111',
    })
    const r = await buscar(db, {
      ...opcoes(db, 'decapagem'),
      cursosPermitidos: [curso],
    })
    expect(r.resultados.map((x) => x.aulaId)).toEqual([raiz])
    expect(r.resultados.map((x) => x.aulaId)).not.toContain(alheia)
    // Pedir só a aula permitida também deixa a alheia de fora, sem filtrar em memória.
    expect(await trechosDeTranscricao(db, 'decapagem')([raiz])).toHaveLength(1)
  })

  it('respeita o limite de aulas e a lista grande de permitidas', async () => {
    const { db, raiz } = await comTranscricoes()
    const mod = (await db.select().from(modulo))[0].id
    const ids = [raiz]
    for (let i = 0; i < 120; i++) {
      ids.push(
        await criarAula(db, mod, { titulo: `Extra ${i}`, video: '111111111' }),
      )
    }
    const todas = await trechosDeTranscricao(db, 'decapagem')(ids)
    expect(todas).toHaveLength(121)
    const duas = await trechosDeTranscricao(db, 'decapagem', 2)(ids)
    expect(duas).toHaveLength(2)
  })
})
