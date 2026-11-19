import { describe, expect, it } from 'vitest'
import { matricula, user } from '#/db/schema'
import { carregarAula, carregarCurso } from '#/lib/conteudo-fns'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { criarTurma } from '#/regras/matricula'
import { definirRegra } from '#/regras/regras-de-liberacao'
import { criarBancoDeTeste } from '#/test/banco'

const ana = { id: 'ana', perfil: 'aluno' as const, fuso: null }

// Curso com duas aulas com vídeo e texto: a 2ª fica trancada (cadeado "bloqueado") para a Ana.
async function cenario() {
  const db = await criarBancoDeTeste()
  await db
    .insert(user)
    .values({ id: 'ana', name: 'Ana', email: 'ana@x.test', perfil: 'aluno' })
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const m1 = await criarModulo(db, cursoId, { nome: 'Módulo 1' })
  const m2 = await criarModulo(db, cursoId, { nome: 'Módulo 2' })
  const livre = await criarAula(db, m1, {
    titulo: 'Livre',
    video: 'https://vimeo.com/111111111/abc123def4',
    textoHtml: '<p>TEXTO-DA-AULA-LIVRE</p>',
  })
  const trancada = await criarAula(db, m2, {
    titulo: 'Trancada',
    video: 'https://vimeo.com/222222222/segredo9999',
    textoHtml: '<p>TEXTO-SECRETO</p>',
  })
  const semVideo = await criarAula(db, m1, { titulo: 'Só texto' })
  const turmaId = await criarTurma(db, { cursoId, nome: 'Turma' })
  await db.insert(matricula).values({
    id: crypto.randomUUID(),
    userId: 'ana',
    turmaId,
    iniciaEm: new Date('2020-01-01T00:00:00Z'),
  })
  await definirRegra(db, { turmaId, moduloId: m2, tipo: 'bloqueado' })
  return { db, cursoId, livre, trancada, semVideo }
}

describe('índice do curso enviado ao aluno', () => {
  it('a aula aberta leva o texto e o vídeo dela, mas o índice não leva os de nenhuma aula', async () => {
    const c = await cenario()
    const r = await carregarAula(c.db, ana, { id: c.livre })
    expect(r?.aula.aula.textoHtml).toContain('TEXTO-DA-AULA-LIVRE')
    expect(r?.aula.aula.vimeoId).toBe('111111111')

    const indice = JSON.stringify({
      modulos: r?.aula.modulos,
      sequencia: r?.aula.sequencia,
    })
    expect(indice).not.toContain('TEXTO-')
    expect(indice).not.toContain('vimeoHash')
    expect(indice).not.toContain('textoHtml')
    expect(indice).not.toContain('abc123def4')
    expect(indice).not.toContain('segredo9999')
    expect(indice).not.toContain('origemMemberkit')
    for (const m of r?.aula.modulos ?? []) {
      for (const a of m.aulas) {
        expect(Object.keys(a).sort()).toEqual(
          ['id', 'miniatura', 'moduloId', 'ordem', 'temVideo', 'titulo'].sort(),
        )
      }
    }
  })

  it('aula trancada chega sem texto nem vídeo, e as outras não vazam o dela', async () => {
    const c = await cenario()
    const r = await carregarAula(c.db, ana, { id: c.trancada })
    expect(r?.aula.situacao.tipo).toBe('cadeado')
    expect(r?.aula.aula.textoHtml).toBe('')
    expect(r?.aula.aula.vimeoHash).toBeNull()
    expect(JSON.stringify(r?.aula)).not.toContain('TEXTO-SECRETO')
    expect(JSON.stringify(r?.aula)).not.toContain('segredo9999')
  })

  it('abrir a aula livre não revela o texto nem o hash da trancada', async () => {
    const c = await cenario()
    const r = await carregarAula(c.db, ana, { id: c.livre })
    const json = JSON.stringify(r?.aula)
    expect(json).not.toContain('TEXTO-SECRETO')
    expect(json).not.toContain('segredo9999')
    expect(json).not.toContain('222222222')
  })

  it('o índice diz só se a aula tem vídeo', async () => {
    const c = await cenario()
    const r = await carregarCurso(c.db, ana, { id: c.cursoId })
    const aulas = r?.curso.modulos.flatMap((m) => m.aulas) ?? []
    expect(aulas.find((a) => a.id === c.livre)?.temVideo).toBe(true)
    expect(aulas.find((a) => a.id === c.semVideo)?.temVideo).toBe(false)
    expect(JSON.stringify(r?.curso.modulos)).not.toContain('TEXTO-')
    expect(JSON.stringify(r?.curso.modulos)).not.toContain('vimeoId')
  })
})
