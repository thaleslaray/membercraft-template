import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { banner, bannerCurso, matricula, user } from '#/db/schema'
import {
  bannersParaOAluno,
  bannerVisivel,
  criarBanner,
  ErroDeBanner,
  editarBanner,
  excluirBanner,
  listarBannersDoPainel,
  pausarOuAtivar,
  registrarClique,
  registrarExibicao,
  reordenarBanners,
} from '#/regras/banners'
import { criarCurso, excluirCurso } from '#/regras/conteudo'
import { limparExclusoesVencidas } from '#/regras/exclusao-protegida'
import { criarTurma, matricularManual } from '#/regras/matricula'
import { TABELAS_COM_EXCLUSAO } from '#/regras/tabelas-com-exclusao'
import { criarBancoDeTeste } from '#/test/banco'

const T0 = new Date('2026-06-10T15:00:00Z')
const agora = () => T0
const dias = (n: number) => new Date(T0.getTime() + n * 86_400_000)

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'eq', name: 'Marina', email: 'eq@x.test', perfil: 'equipe' },
    { id: 'a1', name: 'Ana', email: 'ana@x.test', perfil: 'aluno' },
    { id: 'a2', name: 'Bia', email: 'bia@x.test', perfil: 'aluno' },
  ])
  const cursoA = await criarCurso(db, { nome: 'Coloração' })
  const cursoB = await criarCurso(db, { nome: 'Corte' })
  const turmaA = await criarTurma(db, { cursoId: cursoA, nome: 'T1' })
  // Ana tem o curso A; Bia não tem nada.
  await matricularManual(db, agora, {
    pessoas: [{ email: 'ana@x.test' }],
    turmaId: turmaA,
    autorId: 'eq',
  })
  const novo = (extra: Partial<Parameters<typeof criarBanner>[1]> = {}) =>
    criarBanner(db, {
      titulo: 'Oferta',
      imagemComputador: 'conteudo/imagens/x/pc.png',
      ...extra,
    })
  const ids = async (userId: string) =>
    (await bannersParaOAluno(db, agora, userId)).map((b) => b.id)
  return { db, cursoA, cursoB, novo, ids }
}

describe('banner visível (regra pura)', () => {
  const base = {
    ativo: true,
    inicio: null,
    fim: null,
    publico: 'todos' as const,
    cursoIds: [] as string[],
  }
  it('respeita ativo/pausado e as datas de início e fim', () => {
    expect(bannerVisivel(base, [], T0)).toBe(true)
    expect(bannerVisivel({ ...base, ativo: false }, [], T0)).toBe(false)
    expect(bannerVisivel({ ...base, inicio: dias(1) }, [], T0)).toBe(false)
    expect(bannerVisivel({ ...base, inicio: dias(-1) }, [], T0)).toBe(true)
    expect(bannerVisivel({ ...base, fim: dias(-1) }, [], T0)).toBe(false)
    expect(bannerVisivel({ ...base, fim: dias(1) }, [], T0)).toBe(true)
  })
  it('público por matrícula ativa nos cursos escolhidos', () => {
    const com = { ...base, publico: 'com_matricula' as const, cursoIds: ['a'] }
    const sem = { ...base, publico: 'sem_matricula' as const, cursoIds: ['a'] }
    expect(bannerVisivel(com, ['a'], T0)).toBe(true)
    expect(bannerVisivel(com, ['b'], T0)).toBe(false)
    expect(bannerVisivel(sem, ['a'], T0)).toBe(false)
    expect(bannerVisivel(sem, ['b'], T0)).toBe(true)
    expect(bannerVisivel(sem, [], T0)).toBe(true)
  })
})

describe('banners para o aluno', () => {
  it('mostra o que vale para cada aluno, na ordem do painel', async () => {
    const { novo, ids, cursoA, cursoB } = await cenario()
    const todos = await novo({ titulo: 'Todos' })
    const comA = await novo({ publico: 'com_matricula', cursoIds: [cursoA] })
    const semA = await novo({ publico: 'sem_matricula', cursoIds: [cursoA] })
    const comB = await novo({ publico: 'com_matricula', cursoIds: [cursoB] })
    expect(await ids('a1')).toEqual([todos, comA])
    expect(await ids('a2')).toEqual([todos, semA])
    expect(await ids('a2')).not.toContain(comB)
  })

  it('matrícula expirada não conta como ativa', async () => {
    const { db, novo, ids, cursoA } = await cenario()
    const semA = await novo({ publico: 'sem_matricula', cursoIds: [cursoA] })
    const depois = () => dias(400)
    // Sem prazo a matrícula é vitalícia; vence só quando tem expiração.
    expect(await ids('a1')).toEqual([])
    await db.update(matricula).set({ expiraEm: dias(10) })
    expect(
      (await bannersParaOAluno(db, depois, 'a1')).map((b) => b.id),
    ).toEqual([semA])
  })

  it('não mostra pausado, fora das datas nem excluído', async () => {
    const { db, novo, ids } = await cenario()
    const pausado = await novo()
    await pausarOuAtivar(db, pausado, false)
    await novo({ inicio: dias(2) })
    await novo({ fim: dias(-2) })
    const excluido = await novo()
    await excluirBanner(db, agora, excluido)
    const ok = await novo({ inicio: dias(-1), fim: dias(1) })
    expect(await ids('a1')).toEqual([ok])
  })

  it('devolve as duas imagens e o link, sem expor dados internos', async () => {
    const { db, novo } = await cenario()
    await novo({
      imagemCelular: 'conteudo/imagens/x/cel.png',
      link: 'https://exemplo.com/oferta',
    })
    const [b] = await bannersParaOAluno(db, agora, 'a1')
    expect(b).toMatchObject({
      titulo: 'Oferta',
      imagemComputador: 'conteudo/imagens/x/pc.png',
      imagemCelular: 'conteudo/imagens/x/cel.png',
      link: 'https://exemplo.com/oferta',
    })
    expect(b).not.toHaveProperty('cliques')
  })
})

describe('cadastro de banners', () => {
  it('cria no fim da ordem e valida os campos', async () => {
    const { db, novo, cursoA } = await cenario()
    await expect(novo({ titulo: '  ' })).rejects.toThrow(ErroDeBanner)
    await expect(novo({ imagemComputador: '' })).rejects.toThrow(
      'imagem para computador',
    )
    await expect(novo({ link: 'javascript:alert(1)' })).rejects.toThrow('link')
    await expect(novo({ link: '//evil.com' })).rejects.toThrow('link')
    await expect(novo({ inicio: dias(5), fim: dias(1) })).rejects.toThrow('fim')
    await expect(novo({ publico: 'com_matricula' })).rejects.toThrow('curso')
    await expect(
      novo({ publico: 'com_matricula', cursoIds: ['nao-existe'] }),
    ).rejects.toThrow('curso')
    const a = await novo({ link: '/cursos/abc' })
    const b = await novo({ publico: 'com_matricula', cursoIds: [cursoA] })
    const lista = await listarBannersDoPainel(db, agora)
    expect(lista.map((x) => [x.id, x.ordem])).toEqual([
      [a, 1],
      [b, 2],
    ])
    expect(lista[1].cursoIds).toEqual([cursoA])
  })

  it('edita e troca os cursos escolhidos', async () => {
    const { db, novo, cursoA, cursoB } = await cenario()
    const id = await novo({ publico: 'com_matricula', cursoIds: [cursoA] })
    await editarBanner(db, id, {
      titulo: 'Novo',
      imagemComputador: 'conteudo/imagens/y/pc.png',
      publico: 'sem_matricula',
      cursoIds: [cursoB],
    })
    const [b] = await listarBannersDoPainel(db, agora)
    expect(b).toMatchObject({ titulo: 'Novo', publico: 'sem_matricula' })
    expect(b.cursoIds).toEqual([cursoB])
    await editarBanner(db, id, {
      titulo: 'Novo',
      imagemComputador: 'conteudo/imagens/y/pc.png',
      publico: 'todos',
      cursoIds: [cursoB],
    })
    expect(await db.select().from(bannerCurso)).toEqual([])
  })

  it('mostra a situação: ativo, pausado, agendado e encerrado', async () => {
    const { db, novo } = await cenario()
    const ativo = await novo()
    const pausado = await novo()
    await pausarOuAtivar(db, pausado, false)
    const agendado = await novo({ inicio: dias(3) })
    const encerrado = await novo({ fim: dias(-3) })
    const lista = await listarBannersDoPainel(db, agora)
    const situacao = (id: string) => lista.find((b) => b.id === id)?.situacao
    expect(situacao(ativo)).toBe('ativo')
    expect(situacao(pausado)).toBe('pausado')
    expect(situacao(agendado)).toBe('agendado')
    expect(situacao(encerrado)).toBe('encerrado')
  })

  it('reordena e rejeita ids repetidos ou que não existem', async () => {
    const { db, novo } = await cenario()
    const a = await novo()
    const b = await novo()
    const c = await novo()
    await reordenarBanners(db, [c, a, b])
    expect((await listarBannersDoPainel(db, agora)).map((x) => x.id)).toEqual([
      c,
      a,
      b,
    ])
    await expect(reordenarBanners(db, [a, a, b])).rejects.toThrow(ErroDeBanner)
    await expect(reordenarBanners(db, [a, b, 'x'])).rejects.toThrow(
      ErroDeBanner,
    )
    await expect(reordenarBanners(db, [a, b])).rejects.toThrow(ErroDeBanner)
  })

  it('exclusão protegida: some das telas, volta a linha só para a limpeza', async () => {
    const { db, novo } = await cenario()
    const id = await novo()
    await excluirBanner(db, agora, id)
    expect(await listarBannersDoPainel(db, agora)).toEqual([])
    const [linha] = await db.select().from(banner).where(eq(banner.id, id))
    expect(linha.excluidoEm).toEqual(T0)
    const depois = () => dias(31)
    await limparExclusoesVencidas(db, depois, TABELAS_COM_EXCLUSAO)
    expect(await db.select().from(banner)).toEqual([])
  })

  it('curso excluído de vez não trava a limpeza de um banner que o usa', async () => {
    const { db, novo, cursoB } = await cenario()
    await novo({ publico: 'com_matricula', cursoIds: [cursoB] })
    await excluirCurso(db, agora, cursoB)
    await limparExclusoesVencidas(db, () => dias(31), TABELAS_COM_EXCLUSAO)
    expect(await db.select().from(bannerCurso)).toEqual([])
  })
})

describe('exibições e cliques', () => {
  it('conta por banner e aparece no painel', async () => {
    const { db, novo } = await cenario()
    const a = await novo()
    const b = await novo()
    await registrarExibicao(db, a)
    await registrarExibicao(db, a)
    await registrarClique(db, a)
    await registrarExibicao(db, b)
    const lista = await listarBannersDoPainel(db, agora)
    expect(lista.map((x) => [x.exibicoes, x.cliques])).toEqual([
      [2, 1],
      [1, 0],
    ])
  })

  it('ignora banner que não existe ou foi excluído', async () => {
    const { db, novo } = await cenario()
    const id = await novo()
    await excluirBanner(db, agora, id)
    await registrarExibicao(db, id)
    await registrarClique(db, 'nao-existe')
    const [linha] = await db.select().from(banner)
    expect(linha.exibicoes).toBe(0)
    expect(linha.cliques).toBe(0)
  })
})
