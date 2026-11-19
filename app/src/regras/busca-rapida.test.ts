import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import { buscaRapida, ultimasAulasAbertas } from '#/regras/busca-rapida'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { favoritar } from '#/regras/favoritos'
import { registrarAbertura } from '#/regras/progresso'
import { criarBancoDeTeste } from '#/test/banco'

const agora = () => new Date('2026-06-01T12:00:00Z')
const base = { userId: 'ana', cursosPermitidos: 'todos' as const }

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values({ id: 'ana', name: 'Ana', email: 'ana@x.test' })
  const cor = await criarCurso(db, { nome: 'Coloração', descricao: '' })
  const mod = await criarModulo(db, cor, { nome: 'Raiz e comprimento' })
  const aulas: string[] = []
  for (let i = 1; i <= 8; i++) {
    aulas.push(await criarAula(db, mod, { titulo: `Raiz número ${i}` }))
  }
  return { db, cor, mod, aulas }
}

describe('busca rápida', () => {
  it('limita cada grupo mas mantém a contagem total', async () => {
    const { db } = await cenario()
    const r = await buscaRapida(db, {
      ...base,
      termo: 'raiz',
      limitePorGrupo: 3,
    })
    expect(r.contagem).toEqual({ cursos: 0, modulos: 1, aulas: 8, falados: 0 })
    expect(r.grupos.aulas).toHaveLength(3)
    expect(r.grupos.modulos).toHaveLength(1)
  })

  it('sem limite informado, aulas e falas mostram 3 e curso e módulo mostram 2', async () => {
    const { db } = await cenario()
    const r = await buscaRapida(db, { ...base, termo: 'raiz' })
    expect(r.grupos.aulas).toHaveLength(3)
    expect(r.contagem.aulas).toBe(8)
  })

  it('menos de 2 letras não procura', async () => {
    const { db } = await cenario()
    const r = await buscaRapida(db, { ...base, termo: 'r' })
    expect(r.contagem.aulas).toBe(0)
  })

  it('fala do vídeo vai para o grupo próprio, com o minuto, e não vira "Aula"', async () => {
    const { db, aulas } = await cenario()
    const r = await buscaRapida(db, {
      ...base,
      termo: 'decapagem',
      trechosExtras: async () => [
        {
          tipo: 'transcricao',
          cursoId: 'x',
          aulaId: aulas[0],
          texto: 'vamos falar de decapagem',
          tempo: 95,
        },
      ],
    })
    expect(r.contagem).toMatchObject({ aulas: 0, falados: 1 })
    expect(r.grupos.falados[0]).toMatchObject({
      aulaId: aulas[0],
      tempo: 95,
      moduloNome: 'Raiz e comprimento',
    })
  })

  it('a fala do vídeo chega só com o minuto: o texto da transcrição não sai do servidor', async () => {
    const { db, aulas } = await cenario()
    const segredo = 'decapagem confidencial no comprimento'
    const r = await buscaRapida(db, {
      ...base,
      termo: 'decapagem',
      trechosExtras: async () => [
        {
          tipo: 'transcricao',
          cursoId: 'x',
          aulaId: aulas[0],
          texto: segredo,
          tempo: 95,
        },
      ],
    })
    expect(r.grupos.falados[0]).toMatchObject({ tempo: 95 })
    expect(JSON.stringify(r)).not.toContain('confidencial')
    expect(Object.keys(r.grupos.falados[0]).sort()).toEqual(
      [
        'aulaId',
        'bloqueio',
        'cursoId',
        'cursoNome',
        'favorita',
        'grupo',
        'moduloNome',
        'tempo',
        'titulo',
      ].sort(),
    )
  })

  it('a aula favorita chega marcada, as outras não', async () => {
    const { db, aulas } = await cenario()
    await favoritar(db, agora, { id: 'ana', perfil: 'equipe' }, aulas[1])
    const r = await buscaRapida(db, { ...base, termo: 'raiz número' })
    const por = (id: string) => r.grupos.aulas.find((i) => i.aulaId === id)
    expect(por(aulas[1])?.favorita).toBe(true)
    expect(por(aulas[0])?.favorita).toBe(false)
  })

  it('aula com o termo no título e na fala aparece nos dois grupos', async () => {
    const { db, aulas } = await cenario()
    const r = await buscaRapida(db, {
      ...base,
      termo: 'raiz',
      trechosExtras: async () => [
        {
          tipo: 'transcricao',
          cursoId: 'x',
          aulaId: aulas[1],
          texto: 'a raiz',
          tempo: 40,
        },
      ],
    })
    expect(r.grupos.aulas.map((i) => i.aulaId)).toContain(aulas[1])
    expect(r.grupos.falados.map((i) => i.tempo)).toEqual([40])
  })

  it('oculto some, cadeado vem com o motivo', async () => {
    const { db, aulas } = await cenario()
    const r = await buscaRapida(db, {
      ...base,
      termo: 'raiz número',
      aulaOculta: (id) => id === aulas[0],
      bloqueioDaAula: (id) => (id === aulas[1] ? 'Libera em 3 dias' : null),
    })
    expect(r.contagem.aulas).toBe(7)
    expect(r.grupos.aulas.find((i) => i.aulaId === aulas[0])).toBeUndefined()
    expect(r.grupos.aulas.find((i) => i.aulaId === aulas[1])?.bloqueio).toBe(
      'Libera em 3 dias',
    )
  })
})

describe('últimas aulas abertas', () => {
  it('traz até 5, da mais recente para a mais antiga, sem oculto', async () => {
    const { db, aulas } = await cenario()
    for (let i = 0; i < 7; i++) {
      await registrarAbertura(
        db,
        () => new Date(2026, 5, 1, 10, i),
        'ana',
        aulas[i],
      )
    }
    const r = await ultimasAulasAbertas(db, {
      ...base,
      aulaOculta: (id) => id === aulas[6],
    })
    expect(r.map((x) => x.aulaId)).toEqual([
      aulas[5],
      aulas[4],
      aulas[3],
      aulas[2],
      aulas[1],
    ])
    expect(r[0]).toMatchObject({
      moduloNome: 'Raiz e comprimento',
      cursoNome: 'Coloração',
    })
  })

  it('só de curso com matrícula ativa e só do próprio aluno', async () => {
    const { db, aulas, cor } = await cenario()
    await db
      .insert(user)
      .values({ id: 'bia', name: 'Bia', email: 'bia@x.test' })
    await registrarAbertura(db, () => new Date(2026, 5, 1), 'ana', aulas[0])
    await registrarAbertura(db, () => new Date(2026, 5, 2), 'bia', aulas[1])
    expect(
      await ultimasAulasAbertas(db, { userId: 'ana', cursosPermitidos: [] }),
    ).toEqual([])
    const r = await ultimasAulasAbertas(db, {
      userId: 'ana',
      cursosPermitidos: [cor],
    })
    expect(r.map((x) => x.aulaId)).toEqual([aulas[0]])
  })
})
