import { describe, expect, it } from 'vitest'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { criarTurma } from '#/regras/matricula'
import {
  definirRegra,
  ErroDeLiberacao,
  opcoesDeAlvo,
  regrasDaTurma,
  removerRegra,
} from '#/regras/regras-de-liberacao'
import { criarBancoDeTeste } from '#/test/banco'

async function cenario() {
  const db = await criarBancoDeTeste()
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const m1 = await criarModulo(db, cursoId, { nome: 'Módulo 1' })
  const m2 = await criarModulo(db, cursoId, { nome: 'Módulo 2' })
  const a1 = await criarAula(db, m1, { titulo: 'Aula 1' })
  const a3 = await criarAula(db, m2, { titulo: 'Aula 3' })
  const turmaId = await criarTurma(db, { cursoId, nome: 'Turma 1' })
  const outro = await criarCurso(db, { nome: 'Outro' })
  const mo = await criarModulo(db, outro, { nome: 'Outro módulo' })
  return { db, cursoId, m1, m2, a1, a3, turmaId, outro, mo }
}

describe('gravar as regras da turma', () => {
  it('grava, lista com as datas no formato do campo e troca a regra existente', async () => {
    const c = await cenario()
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'data',
      liberaEm: '2026-03-12',
      fechaEm: '2026-04-01',
    })
    let lista = await regrasDaTurma(c.db, c.turmaId)
    expect(lista.turma).toMatchObject({ cursoNome: 'Coloração' })
    expect(lista.modulos[1].regra).toMatchObject({
      tipo: 'data',
      liberaEm: '2026-03-12',
      fechaEm: '2026-04-01',
    })
    expect(lista.modulos[0].regra).toBeNull()
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m2,
      tipo: 'oculto',
    })
    lista = await regrasDaTurma(c.db, c.turmaId)
    expect(lista.modulos[1].regra).toMatchObject({
      tipo: 'oculto',
      liberaEm: '',
    })
  })

  it('a regra da aula e a do módulo convivem; remover devolve a aula ao módulo', async () => {
    const c = await cenario()
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'bloqueado',
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      aulaId: c.a1,
      tipo: 'livre',
    })
    let lista = await regrasDaTurma(c.db, c.turmaId)
    expect(lista.modulos[0].aulas[0].regra?.tipo).toBe('livre')
    await removerRegra(c.db, c.turmaId, { aulaId: c.a1 })
    lista = await regrasDaTurma(c.db, c.turmaId)
    expect(lista.modulos[0].aulas[0].regra).toBeNull()
    expect(lista.modulos[0].regra?.tipo).toBe('bloqueado')
  })

  it('valida os campos de cada regra', async () => {
    const c = await cenario()
    const base = { turmaId: c.turmaId, moduloId: c.m1 }
    await expect(definirRegra(c.db, { ...base, tipo: 'data' })).rejects.toThrow(
      ErroDeLiberacao,
    )
    await expect(
      definirRegra(c.db, {
        ...base,
        tipo: 'data',
        liberaEm: '2026-03-12',
        fechaEm: '2026-03-11',
      }),
    ).rejects.toThrow('depois da liberação')
    await expect(
      definirRegra(c.db, { ...base, tipo: 'dias_apos_compra', dias: 0 }),
    ).rejects.toThrow(ErroDeLiberacao)
    await expect(
      definirRegra(c.db, { ...base, tipo: 'pontuacao_minima' }),
    ).rejects.toThrow(ErroDeLiberacao)
    await expect(
      definirRegra(c.db, { ...base, tipo: 'modulo_concluido' }),
    ).rejects.toThrow('Escolha')
  })

  it('rejeita módulo, aula ou turma de outro curso', async () => {
    const c = await cenario()
    await expect(
      definirRegra(c.db, {
        turmaId: c.turmaId,
        moduloId: c.mo,
        tipo: 'oculto',
      }),
    ).rejects.toThrow('Módulo não encontrado')
    await expect(
      definirRegra(c.db, {
        turmaId: 'nao-existe',
        moduloId: c.m1,
        tipo: 'oculto',
      }),
    ).rejects.toThrow('Turma não encontrada')
  })

  it('a condição "concluído" pode apontar para qualquer curso, mas não para si mesma', async () => {
    const c = await cenario()
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'modulo_concluido',
      alvoId: c.mo,
    })
    await definirRegra(c.db, {
      turmaId: c.turmaId,
      moduloId: c.m1,
      tipo: 'curso_concluido',
      alvoId: c.outro,
    })
    await expect(
      definirRegra(c.db, {
        turmaId: c.turmaId,
        moduloId: c.m1,
        tipo: 'curso_concluido',
        alvoId: c.cursoId,
      }),
    ).rejects.toThrow('a si mesmo')
    await expect(
      definirRegra(c.db, {
        turmaId: c.turmaId,
        moduloId: c.m1,
        tipo: 'modulo_concluido',
        alvoId: c.m1,
      }),
    ).rejects.toThrow('a si mesmo')
    await expect(
      definirRegra(c.db, {
        turmaId: c.turmaId,
        moduloId: c.m1,
        tipo: 'aula_concluida',
        alvoId: c.a1,
      }),
    ).rejects.toThrow('dentro do que ela libera')
    await expect(
      definirRegra(c.db, {
        turmaId: c.turmaId,
        aulaId: c.a1,
        tipo: 'aula_concluida',
        alvoId: 'nao-existe',
      }),
    ).rejects.toThrow('Aula não encontrada')
  })

  it('lista todos os cursos, módulos e aulas como alvos possíveis', async () => {
    const c = await cenario()
    const { cursos } = await opcoesDeAlvo(c.db)
    expect(cursos.map((x) => x.nome)).toEqual(['Coloração', 'Outro'])
    expect(cursos[0].modulos[0].aulas[0].titulo).toBe('Aula 1')
  })
})
