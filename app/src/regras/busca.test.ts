import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { aula, user } from '#/db/schema'
import { buscar, normalizar, textoDoHtml } from '#/regras/busca'
import {
  criarAula,
  criarCurso,
  criarModulo,
  excluirAula,
} from '#/regras/conteudo'
import { favoritar } from '#/regras/favoritos'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values({ id: 'ana', name: 'Ana', email: 'ana@x.test' })
  const cor = await criarCurso(db, {
    nome: 'Coloração',
    descricao: 'Tudo sobre tintura',
  })
  const base = await criarModulo(db, cor, { nome: 'Fundamentos de cor' })
  const raiz = await criarAula(db, base, {
    titulo: 'Retoque de raiz',
    textoHtml: '<p>Use <b>oxidante</b> de 20 volumes na aplicação.</p>',
  })
  const mechas = await criarAula(db, base, { titulo: 'Mechas' })
  const corte = await criarCurso(db, { nome: 'Corte' })
  const modCorte = await criarModulo(db, corte, { nome: 'Tesoura' })
  const franja = await criarAula(db, modCorte, { titulo: 'Franja e raiz' })
  return { db, cor, corte, base, raiz, mechas, franja }
}

const base = { userId: 'ana', cursosPermitidos: 'todos' as const }

describe('busca', () => {
  it('acha em títulos de curso, módulo e aula e conta por tipo', async () => {
    const { db } = await cenario()
    const r = await buscar(db, { ...base, termo: 'cor' })
    expect(r.contagem).toMatchObject({
      todos: 2,
      cursos: 1,
      modulos: 1,
      aulas: 0,
    })
    expect(r.resultados.map((x) => x.tipo)).toEqual(['curso', 'modulo'])
  })

  it('acha no texto da aula, ignora acento e maiúscula e devolve um trecho', async () => {
    const { db, raiz } = await cenario()
    const r = await buscar(db, { ...base, termo: 'OXIDANTE' })
    expect(r.resultados).toHaveLength(1)
    expect(r.resultados[0]).toMatchObject({ tipo: 'aula', aulaId: raiz })
    expect(r.resultados[0].trecho).toContain('oxidante')
    expect(
      (await buscar(db, { ...base, termo: 'coloracao' })).contagem.cursos,
    ).toBe(1)
  })

  it('todas as palavras do termo precisam aparecer', async () => {
    const { db } = await cenario()
    expect(
      (await buscar(db, { ...base, termo: 'retoque raiz' })).contagem.aulas,
    ).toBe(1)
    expect(
      (await buscar(db, { ...base, termo: 'retoque franja' })).contagem.todos,
    ).toBe(0)
  })

  it('só busca nos cursos permitidos', async () => {
    const { db, cor } = await cenario()
    const r = await buscar(db, {
      ...base,
      cursosPermitidos: [cor],
      termo: 'raiz',
    })
    expect(r.resultados.map((x) => x.titulo)).toEqual(['Retoque de raiz'])
    const nada = await buscar(db, {
      ...base,
      cursosPermitidos: [],
      termo: 'raiz',
    })
    expect(nada.contagem.todos).toBe(0)
  })

  it('filtra por tipo e por favoritos, mantendo a contagem de todos os filtros', async () => {
    const { db, raiz, franja } = await cenario()
    await favoritar(db, agora, { id: 'ana', perfil: 'equipe' }, raiz)
    const r = await buscar(db, { ...base, termo: 'raiz', filtro: 'favoritos' })
    expect(r.resultados.map((x) => x.aulaId)).toEqual([raiz])
    expect(r.contagem).toMatchObject({ todos: 2, aulas: 2, favoritos: 1 })
    const aulas = await buscar(db, { ...base, termo: 'raiz', filtro: 'aulas' })
    expect(aulas.resultados.map((x) => x.aulaId).sort()).toEqual(
      [raiz, franja].sort(),
    )
    expect(
      (await buscar(db, { ...base, termo: 'raiz', filtro: 'cursos' }))
        .resultados,
    ).toEqual([])
  })

  it('termo vazio não devolve nada; aula excluída some', async () => {
    const { db, mechas } = await cenario()
    expect((await buscar(db, { ...base, termo: '  ' })).contagem.todos).toBe(0)
    await excluirAula(db, agora, mechas)
    expect(
      (await buscar(db, { ...base, termo: 'mechas' })).contagem.todos,
    ).toBe(0)
    expect(
      await db.select().from(aula).where(eq(aula.id, mechas)),
    ).toHaveLength(1)
  })

  it('ponto de extensão: trechos de transcrição com tempo e cadeado com motivo', async () => {
    const { db, mechas } = await cenario()
    const r = await buscar(db, {
      ...base,
      termo: 'decapagem',
      trechosExtras: async () => [
        {
          tipo: 'transcricao',
          cursoId: 'x',
          aulaId: mechas,
          texto: 'agora vamos falar de decapagem do fio',
          tempo: 95,
        },
      ],
      bloqueioDaAula: (id) => (id === mechas ? 'Libera em 10 dias' : null),
    })
    expect(r.resultados).toHaveLength(1)
    expect(r.resultados[0]).toMatchObject({
      aulaId: mechas,
      tempo: 95,
      bloqueio: 'Libera em 10 dias',
    })
  })
})

describe('texto do HTML', () => {
  it('tira marcação e entidades', () => {
    expect(
      textoDoHtml('<p>Pão&nbsp;&amp; <i>café</i></p><script>x()</script>'),
    ).toBe('Pão & café')
  })
  it('normaliza acentos', () => {
    expect(normalizar('Ação')).toBe('acao')
  })
})

describe('busca com regras de liberação (#42)', () => {
  it('esconde o oculto e mostra o motivo do cadeado em módulo e aula', async () => {
    const { db, base: modulo, mechas, raiz, franja } = await cenario()
    const r = await buscar(db, {
      ...base,
      termo: 'raiz',
      aulaOculta: (id) => id === raiz,
    })
    expect(r.resultados.map((x) => x.aulaId)).toEqual([franja])
    const c = await buscar(db, {
      ...base,
      termo: 'mechas',
      bloqueioDaAula: (id) => (id === mechas ? 'Libera em 12/03' : null),
    })
    expect(c.resultados[0].bloqueio).toBe('Libera em 12/03')
    const m = await buscar(db, {
      ...base,
      termo: 'fundamentos',
      bloqueioDoModulo: (id) => (id === modulo ? 'Conteúdo bloqueado' : null),
    })
    expect(m.resultados[0]).toMatchObject({
      tipo: 'modulo',
      bloqueio: 'Conteúdo bloqueado',
    })
    const oculto = await buscar(db, {
      ...base,
      termo: 'fundamentos',
      moduloOculto: (id) => id === modulo,
    })
    expect(oculto.resultados).toEqual([])
  })
})
