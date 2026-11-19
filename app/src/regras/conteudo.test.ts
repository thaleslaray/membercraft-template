import { describe, expect, it } from 'vitest'
import {
  anexarMaterial,
  criarAula,
  criarCategoria,
  criarCurso,
  criarModulo,
  ErroDeConteudo,
  editarAula,
  editarCurso,
  excluirAula,
  excluirCategoria,
  excluirCurso,
  excluirMaterial,
  excluirModulo,
  listarCursos,
  materialComCurso,
  montarVitrine,
  obterAula,
  obterCurso,
  reordenar,
} from '#/regras/conteudo'
import { limparExclusoesVencidas } from '#/regras/exclusao-protegida'
import { TABELAS_COM_EXCLUSAO } from '#/regras/tabelas-com-exclusao'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')

async function cursoComUmaAula() {
  const db = await criarBancoDeTeste()
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Módulo 1' })
  const aulaId = await criarAula(db, moduloId, { titulo: 'Boas-vindas' })
  return { db, cursoId, moduloId, aulaId }
}

describe('cadastro de conteúdo', () => {
  it('cria categorias, cursos, módulos e aulas já na ordem de criação', async () => {
    const db = await criarBancoDeTeste()
    const cursoId = await criarCurso(db, { nome: 'Curso' })
    const m1 = await criarModulo(db, cursoId, { nome: 'A' })
    const m2 = await criarModulo(db, cursoId, { nome: 'B' })
    await criarAula(db, m2, { titulo: 'b1' })
    await criarAula(db, m1, { titulo: 'a1' })
    await criarAula(db, m1, { titulo: 'a2' })
    const completo = await obterCurso(db, cursoId)
    expect(completo?.modulos.map((m) => m.nome)).toEqual(['A', 'B'])
    expect(completo?.modulos[0].aulas.map((a) => a.titulo)).toEqual([
      'a1',
      'a2',
    ])
  })

  it('exige nome e rejeita carga horária inválida', async () => {
    const db = await criarBancoDeTeste()
    await expect(criarCurso(db, { nome: '   ' })).rejects.toThrow(
      ErroDeConteudo,
    )
    await expect(
      criarCurso(db, { nome: 'X', cargaHoraria: -2 }),
    ).rejects.toThrow('carga horária')
  })

  it('"mostrar a todos" pede uma URL de vendas válida', async () => {
    const db = await criarBancoDeTeste()
    await expect(
      criarCurso(db, { nome: 'X', mostrarATodos: true }),
    ).rejects.toThrow('URL')
    await expect(
      criarCurso(db, { nome: 'X', urlDeVendas: 'javascript:alert(1)' }),
    ).rejects.toThrow(ErroDeConteudo)
    const id = await criarCurso(db, {
      nome: 'X',
      mostrarATodos: true,
      urlDeVendas: 'https://pay.voomp.com.br/x',
    })
    const [c] = await listarCursos(db)
    expect(c.id).toBe(id)
    expect(c.mostrarATodos).toBe(true)
  })

  it('edita o curso', async () => {
    const db = await criarBancoDeTeste()
    const id = await criarCurso(db, { nome: 'Antigo' })
    await editarCurso(db, id, {
      nome: 'Novo',
      descricao: 'Texto',
      cargaHoraria: 40,
    })
    const [c] = await listarCursos(db)
    expect(c).toMatchObject({
      nome: 'Novo',
      descricao: 'Texto',
      cargaHoraria: 40,
    })
  })

  it('marca o curso como "gera Pedido do MEC" e editar sem informar o campo não o desmarca', async () => {
    const db = await criarBancoDeTeste()
    const id = await criarCurso(db, { nome: 'Formação' })
    expect((await listarCursos(db))[0].geraPedidoDoMec).toBe(false)
    await editarCurso(db, id, { nome: 'Formação', geraPedidoDoMec: true })
    expect((await listarCursos(db))[0].geraPedidoDoMec).toBe(true)
    await editarCurso(db, id, { nome: 'Formação 2' })
    expect((await listarCursos(db))[0]).toMatchObject({
      nome: 'Formação 2',
      geraPedidoDoMec: true,
    })
    await editarCurso(db, id, { nome: 'Formação 2', geraPedidoDoMec: false })
    expect((await listarCursos(db))[0].geraPedidoDoMec).toBe(false)
  })

  it('guarda o id e o hash do Vimeo a partir do que a equipe colou', async () => {
    const { db, aulaId, cursoId } = await cursoComUmaAula()
    await editarAula(db, aulaId, {
      titulo: 'Aula',
      video: 'https://vimeo.com/76979871/a1b2c3d4e5',
    })
    const aula = (await obterCurso(db, cursoId))?.modulos[0].aulas[0]
    expect(aula).toMatchObject({ vimeoId: '76979871', vimeoHash: 'a1b2c3d4e5' })
    await expect(
      editarAula(db, aulaId, { titulo: 'Aula', video: 'não é vídeo' }),
    ).rejects.toThrow('Vimeo')
  })

  it('limpa o HTML do texto da aula ao gravar', async () => {
    const { db, aulaId, cursoId } = await cursoComUmaAula()
    await editarAula(db, aulaId, {
      titulo: 'Aula',
      textoHtml: '<p>Oi</p><script>alert(1)</script>',
    })
    expect((await obterCurso(db, cursoId))?.modulos[0].aulas[0].textoHtml).toBe(
      '<p>Oi</p>',
    )
  })
})

describe('ordem', () => {
  it('reordena módulos pela lista de ids', async () => {
    const db = await criarBancoDeTeste()
    const cursoId = await criarCurso(db, { nome: 'Curso' })
    const a = await criarModulo(db, cursoId, { nome: 'A' })
    const b = await criarModulo(db, cursoId, { nome: 'B' })
    const c = await criarModulo(db, cursoId, { nome: 'C' })
    await reordenar(db, 'modulo', [c, a, b])
    expect((await obterCurso(db, cursoId))?.modulos.map((m) => m.nome)).toEqual(
      ['C', 'A', 'B'],
    )
  })

  it('recusa ordenar itens de grupos diferentes ou que não existem', async () => {
    const db = await criarBancoDeTeste()
    const c1 = await criarCurso(db, { nome: 'C1' })
    const c2 = await criarCurso(db, { nome: 'C2' })
    const m1 = await criarModulo(db, c1, { nome: 'A' })
    const m2 = await criarModulo(db, c2, { nome: 'B' })
    await expect(reordenar(db, 'modulo', [m1, m2])).rejects.toThrow(
      ErroDeConteudo,
    )
    await expect(reordenar(db, 'modulo', [m1, 'fantasma'])).rejects.toThrow(
      ErroDeConteudo,
    )
    await expect(reordenar(db, 'modulo', [m1, m1])).rejects.toThrow(
      ErroDeConteudo,
    )
  })

  it('reordena categorias e cursos', async () => {
    const db = await criarBancoDeTeste()
    const a = await criarCurso(db, { nome: 'A' })
    const b = await criarCurso(db, { nome: 'B' })
    await reordenar(db, 'curso', [b, a])
    expect((await listarCursos(db)).map((c) => c.nome)).toEqual(['B', 'A'])
  })
})

describe('exclusão protegida', () => {
  it('excluir o curso leva módulos, aulas e materiais e some das consultas', async () => {
    const { db, cursoId, aulaId } = await cursoComUmaAula()
    const materialId = await anexarMaterial(db, aulaId, {
      nome: 'Guia.pdf',
      chave: 'materiais/x',
      tipo: 'application/pdf',
      tamanho: 10,
    })
    await excluirCurso(db, agora, cursoId)
    expect(await obterCurso(db, cursoId)).toBeNull()
    expect(await obterAula(db, aulaId)).toBeNull()
    expect(await materialComCurso(db, materialId)).toBeNull()
    expect(await listarCursos(db)).toEqual([])
  })

  it('excluir módulo, aula e material tira só aquilo', async () => {
    const { db, cursoId, moduloId, aulaId } = await cursoComUmaAula()
    const outraAula = await criarAula(db, moduloId, { titulo: 'Outra' })
    const material = await anexarMaterial(db, outraAula, {
      nome: 'a',
      chave: 'k',
      tipo: 't',
      tamanho: 1,
    })
    await excluirMaterial(db, agora, material)
    expect((await obterAula(db, outraAula))?.materiais).toEqual([])
    await excluirAula(db, agora, aulaId)
    expect(
      (await obterCurso(db, cursoId))?.modulos[0].aulas.map((a) => a.id),
    ).toEqual([outraAula])
    await excluirModulo(db, agora, moduloId)
    expect((await obterCurso(db, cursoId))?.modulos).toEqual([])
  })

  it('excluir a categoria deixa os cursos dela sem categoria', async () => {
    const db = await criarBancoDeTeste()
    const cat = await criarCategoria(db, { nome: '2022' })
    const curso = await criarCurso(db, { nome: 'X', categoriaId: cat })
    await excluirCategoria(db, agora, cat)
    const vitrine = await montarVitrine(db, 'todos')
    expect(vitrine).toHaveLength(1)
    expect(vitrine[0].categoria).toBeNull()
    expect(vitrine[0].cursos.map((c) => c.id)).toEqual([curso])
  })

  it('a limpeza diária apaga tudo, filhos antes dos pais, depois de 30 dias', async () => {
    const { db, cursoId, aulaId } = await cursoComUmaAula()
    await anexarMaterial(db, aulaId, {
      nome: 'a',
      chave: 'k',
      tipo: 't',
      tamanho: 1,
    })
    await excluirCurso(db, agora, cursoId)
    const depois = () => new Date('2026-07-15T12:00:00Z')
    const { apagadas, falhas } = await limparExclusoesVencidas(
      db,
      depois,
      TABELAS_COM_EXCLUSAO,
    )
    expect(falhas).toEqual([])
    expect(apagadas).toMatchObject({
      material_da_aula: 1,
      aula: 1,
      modulo: 1,
      curso: 1,
    })
  })
})

describe('vitrine', () => {
  async function cenario() {
    const db = await criarBancoDeTeste()
    const cat = await criarCategoria(db, { nome: 'Formação' })
    const meu = await criarCurso(db, { nome: 'Meu', categoriaId: cat })
    const vendido = await criarCurso(db, {
      nome: 'Vendido',
      categoriaId: cat,
      mostrarATodos: true,
      urlDeVendas: 'https://loja.com/x',
    })
    const oculto = await criarCurso(db, { nome: 'Oculto', categoriaId: cat })
    const modulo = await criarModulo(db, meu, { nome: 'M' })
    await criarAula(db, modulo, { titulo: 'a1' })
    await criarAula(db, modulo, { titulo: 'a2' })
    return { db, meu, vendido, oculto }
  }

  it('a equipe vê todos os cursos sem cadeado, com a contagem de aulas', async () => {
    const { db } = await cenario()
    const [grupo] = await montarVitrine(db, 'todos')
    expect(
      grupo.cursos.map((c) => [c.nome, c.bloqueado, c.totalDeAulas]),
    ).toEqual([
      ['Meu', false, 2],
      ['Vendido', false, 0],
      ['Oculto', false, 0],
    ])
  })

  it('o aluno vê o que tem e, com cadeado, o que a equipe deixou visível', async () => {
    const { db, meu } = await cenario()
    const [grupo] = await montarVitrine(db, [meu])
    expect(grupo.cursos.map((c) => [c.nome, c.bloqueado])).toEqual([
      ['Meu', false],
      ['Vendido', true],
    ])
  })

  it('o curso de matrícula expirada aparece com o cadeado de acesso expirado, mesmo sem ser "para todos"', async () => {
    const { db, meu, vendido, oculto } = await cenario()
    const [grupo] = await montarVitrine(db, [meu], [oculto])
    expect(grupo.cursos.map((c) => [c.id, c.bloqueado, c.expirado])).toEqual([
      [meu, false, false],
      [vendido, true, false],
      [oculto, true, true],
    ])
  })
})

describe('aula', () => {
  it('traz materiais, anterior e próxima na sequência do curso', async () => {
    const db = await criarBancoDeTeste()
    const cursoId = await criarCurso(db, { nome: 'C' })
    const m1 = await criarModulo(db, cursoId, { nome: 'M1' })
    const m2 = await criarModulo(db, cursoId, { nome: 'M2' })
    const a1 = await criarAula(db, m1, { titulo: 'a1' })
    const a2 = await criarAula(db, m1, { titulo: 'a2' })
    const a3 = await criarAula(db, m2, { titulo: 'a3' })
    const meio = await obterAula(db, a2)
    expect(meio?.anterior?.id).toBe(a1)
    expect(meio?.proxima?.id).toBe(a3)
    expect((await obterAula(db, a1))?.anterior).toBeNull()
    expect((await obterAula(db, a3))?.proxima).toBeNull()
  })

  it('acha o curso de um material para conferir o acesso', async () => {
    const { db, cursoId, aulaId } = await cursoComUmaAula()
    const id = await anexarMaterial(db, aulaId, {
      nome: 'Guia.pdf',
      chave: 'materiais/guia',
      tipo: 'application/pdf',
      tamanho: 99,
    })
    const achado = await materialComCurso(db, id)
    expect(achado?.cursoId).toBe(cursoId)
    expect(achado?.material.chave).toBe('materiais/guia')
  })
})
