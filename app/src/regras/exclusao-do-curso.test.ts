import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { excluirCurso, excluirModulo } from '#/regras/conteudo'
import { limparExclusoesVencidas } from '#/regras/exclusao-protegida'
import { TABELAS_COM_EXCLUSAO } from '#/regras/tabelas-com-exclusao'
import { criarBancoDeTeste } from '#/test/banco'

const T0 = new Date('2026-06-01T12:00:00Z')
const depoisDe = (dias: number) => () =>
  new Date(T0.getTime() + dias * 86_400_000)
const ms = T0.getTime()

type Banco = Awaited<ReturnType<typeof criarBancoDeTeste>>

async function contar(db: Banco, tabela: string): Promise<number> {
  const [linha] = await db.all<{ n: number }>(
    sql.raw(`select count(*) as n from ${tabela}`),
  )
  return linha.n
}

// Um curso com filhos de todas as fatias que apontam para curso, módulo, aula ou turma.
async function semear(db: Banco, sufixo = '') {
  const s = sufixo
  const sql_ = (texto: string) => db.run(sql.raw(texto))
  await sql_(
    `insert or ignore into user (id, name, email) values ('u1', 'Aluna', 'aluna@exemplo.com'), ('eq', 'Equipe', 'eq@exemplo.com')`,
  )
  await sql_(
    `insert into categoria (id, nome, ordem) values ('cat${s}', 'Cat', 1)`,
  )
  await sql_(
    `insert into curso (id, categoria_id, nome, capa_horizontal, capa_vertical, imagem_destaque, ordem) values ('c${s}', 'cat${s}', 'Curso', 'img/c-h${s}.png', 'img/c-v${s}.png', 'img/c-d${s}.png', 1)`,
  )
  await sql_(
    `insert into modulo (id, curso_id, nome, capa, ordem) values ('m${s}', 'c${s}', 'Módulo', 'img/m${s}.png', 1)`,
  )
  await sql_(
    `insert into aula (id, modulo_id, titulo, miniatura, ordem) values ('a${s}', 'm${s}', 'Aula', 'img/a${s}.png', 1)`,
  )
  await sql_(
    `insert into material_da_aula (id, aula_id, nome, chave, tipo, tamanho, ordem) values ('mat${s}', 'a${s}', 'PDF', 'materiais/mat${s}.pdf', 'application/pdf', 10, 1)`,
  )
  await sql_(
    `insert into turma (id, curso_id, nome) values ('t${s}', 'c${s}', 'Turma')`,
  )
  await sql_(
    `insert into matricula (id, user_id, turma_id, inicia_em) values ('mt${s}', 'u1', 't${s}', ${ms})`,
  )
  await sql_(
    `insert into origem_da_matricula (id, matricula_id, tipo) values ('om${s}', 'mt${s}', 'manual')`,
  )
  await sql_(`insert into favorito (user_id, aula_id) values ('u1', 'a${s}')`)
  await sql_(
    `insert into progresso_da_aula (id, user_id, aula_id, aberta_em) values ('pr${s}', 'u1', 'a${s}', ${ms})`,
  )
  await sql_(
    `insert into regra_de_liberacao (id, turma_id, modulo_id, tipo) values ('rm${s}', 't${s}', 'm${s}', 'oculto')`,
  )
  await sql_(
    `insert into regra_de_liberacao (id, turma_id, aula_id, tipo) values ('ra${s}', 't${s}', 'a${s}', 'oculto')`,
  )
  await sql_(
    `insert into ligacao_de_venda (id, produto_id, turma_id) values ('lv${s}', 'prod${s}', 't${s}')`,
  )
  await sql_(`insert into quiz (id, aula_id) values ('q${s}', 'a${s}')`)
  await sql_(
    `insert into pergunta_do_quiz (id, quiz_id, enunciado, imagem, ordem) values ('pq${s}', 'q${s}', 'P?', 'img/pq${s}.png', 1)`,
  )
  await sql_(
    `insert into alternativa_da_pergunta (id, pergunta_id, texto, imagem, ordem) values ('alt${s}', 'pq${s}', 'A', 'img/alt${s}.png', 1)`,
  )
  await sql_(
    `insert into tentativa_do_quiz (id, quiz_id, user_id, numero, estado, perguntas, respostas, acertos, total, percentual, minimo_de_acertos, enviada_em) values ('tq${s}', 'q${s}', 'u1', 1, 'aprovada', '[]', '{}', 1, 1, 100, 70, ${ms})`,
  )
  await sql_(
    `insert into resposta_aberta_do_quiz (id, tentativa_id, pergunta_id, texto) values ('ro${s}', 'tq${s}', 'pq${s}', 'resposta')`,
  )
  await sql_(
    `insert into arquivo_da_resposta (id, tentativa_id, pergunta_id, chave, nome, tipo, tamanho, enviado_em) values ('ar${s}', 'tq${s}', 'pq${s}', 'entregas/ar${s}.zip', 'x.zip', 'application/zip', 5, ${ms})`,
  )
  await sql_(
    `insert into liberacao_de_tentativa (id, quiz_id, user_id, liberada_por_id, liberada_em) values ('lt${s}', 'q${s}', 'u1', 'eq', ${ms})`,
  )
  await sql_(
    `insert into modelo_de_certificado (id, curso_id, frente, verso) values ('mc${s}', 'c${s}', 'modelos/f${s}.png', 'modelos/v${s}.png')`,
  )
  await sql_(
    `insert into certificado (id, user_id, curso_id, codigo, nome, curso_nome, concluido_em, emitido_em, pdf_chave) values ('ce${s}', 'u1', 'c${s}', 'COD${s}', 'Aluna', 'Curso', ${ms}, ${ms}, 'pdfs/ce${s}.pdf')`,
  )
  await sql_(
    `insert into pedido_do_mec (id, certificado_id, user_id, curso_id, criado_em, na_fila_desde) values ('pm${s}', 'ce${s}', 'u1', 'c${s}', ${ms}, ${ms})`,
  )
  await sql_(
    `insert into lancamento_de_pontos (id, user_id, curso_id, origem_tipo, origem_id, pontos) values ('lp${s}', 'u1', 'c${s}', 'aula', 'a${s}', 10)`,
  )
  await sql_(
    `insert into comentario_da_aula (id, aula_id, user_id, texto) values ('co${s}', 'a${s}', 'u1', 'oi')`,
  )
  await sql_(
    `insert into banner (id, titulo, imagem_computador, ordem) values ('b${s}', 'B', 'img/b${s}.png', 1)`,
  )
  await sql_(
    `insert into banner_curso (banner_id, curso_id) values ('b${s}', 'c${s}')`,
  )
}

const FILHOS = [
  'modulo',
  'aula',
  'material_da_aula',
  'turma',
  'matricula',
  'origem_da_matricula',
  'favorito',
  'progresso_da_aula',
  'regra_de_liberacao',
  'ligacao_de_venda',
  'quiz',
  'pergunta_do_quiz',
  'alternativa_da_pergunta',
  'tentativa_do_quiz',
  'resposta_aberta_do_quiz',
  'arquivo_da_resposta',
  'liberacao_de_tentativa',
  'modelo_de_certificado',
  'certificado',
  'pedido_do_mec',
  'comentario_da_aula',
  'banner_curso',
]

describe('limpeza de 30 dias de um curso excluído', () => {
  it('apaga o curso e todos os filhos de todas as fatias, sem erro de chave estrangeira', async () => {
    const db = await criarBancoDeTeste()
    await semear(db)
    await excluirCurso(db, () => T0, 'c')

    const resultado = await limparExclusoesVencidas(
      db,
      depoisDe(31),
      TABELAS_COM_EXCLUSAO,
    )

    expect(resultado.falhas).toEqual([])
    expect(await contar(db, 'curso')).toBe(0)
    for (const tabela of FILHOS) {
      expect(await contar(db, tabela), tabela).toBe(0)
    }
    // O que é da pessoa ou da área fica.
    expect(await contar(db, 'user')).toBe(2)
    expect(await contar(db, 'banner')).toBe(1)
    expect(await contar(db, 'comentario_da_aula')).toBe(0)
  })

  it('os pontos do aluno ficam, sem o curso', async () => {
    const db = await criarBancoDeTeste()
    await semear(db)
    await excluirCurso(db, () => T0, 'c')
    await limparExclusoesVencidas(db, depoisDe(31), TABELAS_COM_EXCLUSAO)
    const [ponto] = await db.all<{ curso_id: string | null }>(
      sql.raw(`select curso_id from lancamento_de_pontos where id = 'lp'`),
    )
    expect(ponto.curso_id).toBeNull()
  })

  it('a categoria excluída solta os cursos em vez de travar a limpeza', async () => {
    const db = await criarBancoDeTeste()
    await semear(db)
    await db.run(
      sql.raw(`update categoria set excluido_em = ${ms} where id = 'cat'`),
    )
    const resultado = await limparExclusoesVencidas(
      db,
      depoisDe(31),
      TABELAS_COM_EXCLUSAO,
    )
    expect(resultado.falhas).toEqual([])
    const [c] = await db.all<{ categoria_id: string | null }>(
      sql.raw(`select categoria_id from curso where id = 'c'`),
    )
    expect(c.categoria_id).toBeNull()
  })

  it('excluir só um módulo leva as aulas e a limpeza apaga o que depende delas', async () => {
    const db = await criarBancoDeTeste()
    await semear(db)
    await excluirModulo(db, () => T0, 'm')
    const resultado = await limparExclusoesVencidas(
      db,
      depoisDe(31),
      TABELAS_COM_EXCLUSAO,
    )
    expect(resultado.falhas).toEqual([])
    expect(await contar(db, 'aula')).toBe(0)
    expect(await contar(db, 'quiz')).toBe(0)
    expect(await contar(db, 'favorito')).toBe(0)
    expect(await contar(db, 'curso')).toBe(1)
  })

  it('entrega ao R2 as chaves de tudo o que saiu junto com o curso', async () => {
    const db = await criarBancoDeTeste()
    await semear(db)
    await excluirCurso(db, () => T0, 'c')
    let apagados: string[] = []
    await limparExclusoesVencidas(
      db,
      depoisDe(31),
      TABELAS_COM_EXCLUSAO,
      async (chaves) => {
        apagados = chaves
      },
    )
    expect(apagados.sort()).toEqual(
      [
        'img/c-h.png',
        'img/c-v.png',
        'img/c-d.png',
        'img/m.png',
        'img/a.png',
        'materiais/mat.pdf',
        'img/pq.png',
        'img/alt.png',
        'entregas/ar.zip',
        'modelos/f.png',
        'modelos/v.png',
        'pdfs/ce.pdf',
      ].sort(),
    )
  })

  it('antes dos 30 dias nada é apagado', async () => {
    const db = await criarBancoDeTeste()
    await semear(db)
    await excluirCurso(db, () => T0, 'c')
    await limparExclusoesVencidas(db, depoisDe(10), TABELAS_COM_EXCLUSAO)
    expect(await contar(db, 'curso')).toBe(1)
    expect(await contar(db, 'tentativa_do_quiz')).toBe(1)
  })
})
