import { describe, expect, it } from 'vitest'
import {
  comunidadesVisiveis,
  contarPublicacoesPorComunidade,
  criarComunidade,
  ErroDeComunidade,
  editarComunidade,
  excluirComunidade,
  listarComunidades,
  podePublicar,
  quemEnxerga,
} from '#/regras/comunidades'
import { cenarioDeComunidades } from '#/test/cenario-da-comunidade'

const agora = () => new Date('2026-06-01T12:00:00Z')
const ana = { id: 'ana', perfil: 'aluno' as const }
const equipe = { id: 'eq', perfil: 'equipe' as const }

const base = {
  descricao: null,
  icone: 'mensagens',
  cor: '#1f4d3a',
  soEquipePublica: false,
  turmaIds: [] as string[],
}

describe('cadastro de comunidades', () => {
  it('cria com nome, ícone, cor e turmas, e lista em ordem alfabética', async () => {
    const db = await cenarioDeComunidades()
    await criarComunidade(db, { ...base, nome: 'Vitrine', turmaIds: ['t1'] })
    await criarComunidade(db, {
      ...base,
      nome: 'avisos',
      soEquipePublica: true,
    })
    const lista = await listarComunidades(db)
    expect(lista.map((c) => c.nome)).toEqual(['avisos', 'Vitrine'])
    expect(lista[0]).toMatchObject({ soEquipePublica: true, turmaIds: [] })
    expect(lista[1].turmaIds).toEqual(['t1'])
  })

  it('recusa nome vazio, ícone e cor fora da lista e turma que não existe', async () => {
    const db = await cenarioDeComunidades()
    await expect(criarComunidade(db, { ...base, nome: '  ' })).rejects.toThrow(
      ErroDeComunidade,
    )
    await expect(
      criarComunidade(db, { ...base, nome: 'A', icone: 'foguete' }),
    ).rejects.toThrow(/ícone/)
    await expect(
      criarComunidade(db, { ...base, nome: 'A', cor: 'red' }),
    ).rejects.toThrow(/cor/)
    await expect(
      criarComunidade(db, { ...base, nome: 'A', turmaIds: ['nao'] }),
    ).rejects.toThrow(/Turma/)
  })

  it('edita os dados e troca as turmas', async () => {
    const db = await cenarioDeComunidades()
    const id = await criarComunidade(db, {
      ...base,
      nome: 'A',
      turmaIds: ['t1'],
    })
    await editarComunidade(db, id, {
      ...base,
      nome: 'B',
      cor: '#2563eb',
      turmaIds: ['t2'],
    })
    const [c] = await listarComunidades(db)
    expect(c).toMatchObject({ nome: 'B', cor: '#2563eb', turmaIds: ['t2'] })
    await editarComunidade(db, id, { ...base, nome: 'B', turmaIds: [] })
    expect((await listarComunidades(db))[0].turmaIds).toEqual([])
  })

  it('excluir é protegido: some da lista mas a linha fica com a data', async () => {
    const db = await cenarioDeComunidades()
    const id = await criarComunidade(db, { ...base, nome: 'A' })
    await excluirComunidade(db, agora, id)
    expect(await listarComunidades(db)).toEqual([])
    await expect(excluirComunidade(db, agora, id)).rejects.toThrow(
      /não encontrada/,
    )
    expect(await contarPublicacoesPorComunidade(db)).toEqual({})
  })
})

describe('quem enxerga cada comunidade', () => {
  it('a pública é de todo aluno com matrícula ativa; a restrita, de quem está nas turmas', async () => {
    const db = await cenarioDeComunidades()
    await criarComunidade(db, { ...base, nome: 'Geral' })
    await criarComunidade(db, { ...base, nome: 'Só turma 1', turmaIds: ['t1'] })
    const nomes = async (p: typeof ana) =>
      (await comunidadesVisiveis(db, agora, p)).map((c) => c.nome)
    expect(await nomes(ana)).toEqual(['Geral', 'Só turma 1'])
    expect(await nomes({ id: 'bia', perfil: 'aluno' })).toEqual(['Geral'])
  })

  it('matrícula vencida ou ausente não enxerga nada; a Equipe enxerga tudo', async () => {
    const db = await cenarioDeComunidades()
    await criarComunidade(db, { ...base, nome: 'Geral' })
    await criarComunidade(db, { ...base, nome: 'Restrita', turmaIds: ['t1'] })
    expect(
      await comunidadesVisiveis(db, agora, { id: 'cris', perfil: 'aluno' }),
    ).toEqual([])
    expect(
      await comunidadesVisiveis(db, agora, { id: 'ninguem', perfil: 'aluno' }),
    ).toEqual([])
    expect(await comunidadesVisiveis(db, agora, equipe)).toHaveLength(2)
  })

  it('"só a equipe publica": o aluno não publica, a Equipe sim', () => {
    expect(podePublicar(ana, { soEquipePublica: true })).toBe(false)
    expect(podePublicar(equipe, { soEquipePublica: true })).toBe(true)
    expect(podePublicar(ana, { soEquipePublica: false })).toBe(true)
  })

  it('quemEnxerga filtra os ids de quem ainda tem acesso', async () => {
    const db = await cenarioDeComunidades()
    const id = await criarComunidade(db, {
      ...base,
      nome: 'Restrita',
      turmaIds: ['t1'],
    })
    expect(
      await quemEnxerga(db, agora, id, ['ana', 'bia', 'cris', 'eq']),
    ).toEqual(expect.arrayContaining(['ana', 'eq']))
    expect(
      await quemEnxerga(db, agora, id, ['ana', 'bia', 'cris', 'eq']),
    ).toHaveLength(2)
  })
})
