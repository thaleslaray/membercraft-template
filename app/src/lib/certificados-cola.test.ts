import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  curso as cursoDaTabela,
  matricula,
  pedidoDoMec,
  user,
} from '#/db/schema'
import { CAMPOS_PADRAO, salvarModelo } from '#/regras/certificados'
import { criarAula, criarCurso, criarModulo } from '#/regras/conteudo'
import { criarTurma } from '#/regras/matricula'
import { concluirAula } from '#/regras/progresso'
import { criarBancoDeTeste } from '#/test/banco'

// O Pedido do MEC (#56) é ligado em `ganchos()` da cola: vale para TODOS os chamadores.
const banco = vi.hoisted(() => ({ atual: null as unknown }))
vi.mock('#/db/index', () => ({ getDb: () => banco.atual }))

const agora = () => new Date('2026-06-10T12:00:00Z')
const fila = { send: vi.fn(async () => {}) }
const env = { FILA_PDF: fila } as unknown as Env

async function cenario(geraPedidoDoMec: boolean) {
  const db = await criarBancoDeTeste()
  banco.atual = db
  await db.insert(user).values({ id: 'ana', name: 'ana', email: 'ana@x.test' })
  const cursoId = await criarCurso(db, { nome: 'Formação' })
  await db
    .update(cursoDaTabela)
    .set({ geraPedidoDoMec })
    .where(eq(cursoDaTabela.id, cursoId))
  const turmaId = await criarTurma(db, { cursoId, nome: 'T1' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Base' })
  const aulaId = await criarAula(db, moduloId, { titulo: 'Raiz' })
  await db.insert(matricula).values({
    id: 'm1',
    userId: 'ana',
    turmaId,
    iniciaEm: new Date('2026-06-01T12:00:00Z'),
  })
  await salvarModelo(db, agora, cursoId, {
    ativo: true,
    frente: 'conteudo/imagens/a/frente.png',
    verso: null,
    campos: CAMPOS_PADRAO,
    todasAsAulas: true,
    pontosMinimos: 0,
  })
  await concluirAula(db, agora, 'ana', aulaId)
  return { db, cursoId, aulaId }
}

// Deixa o nome confirmado sem emitir (a emissão é o que cada teste exercita).
async function confirmarNomeSemEmitir(
  db: Awaited<ReturnType<typeof cenario>>['db'],
) {
  await db
    .update(user)
    .set({ nomeNoCertificado: 'Ana Souza', nomeConfirmadoEm: agora() })
    .where(eq(user.id, 'ana'))
}

beforeEach(() => fila.send.mockClear())

describe('Pedido do MEC nos chamadores de certificados-cola', () => {
  it('a emissão retroativa abre o pedido e enfileira o PDF', async () => {
    const { db, cursoId } = await cenario(true)
    await confirmarNomeSemEmitir(db)
    const { emitirRetroativoDoCurso } = await import('#/lib/certificados-cola')
    const r = await emitirRetroativoDoCurso(env, cursoId)
    expect(r.emitidos).toHaveLength(1)
    const pedidos = await db.select().from(pedidoDoMec)
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]).toMatchObject({
      certificadoId: r.emitidos[0].id,
      estado: 'na_fila',
    })
    expect(fila.send).toHaveBeenCalledOnce()
  })

  it('a confirmação do nome (certificado que esperava o nome) abre o pedido', async () => {
    const { db } = await cenario(true)
    const { confirmarNomeEEmitir } = await import('#/lib/certificados-cola')
    expect(await confirmarNomeEEmitir(env, 'ana', 'Ana Souza')).toBe(1)
    expect(await db.select().from(pedidoDoMec)).toHaveLength(1)
  })

  it('o gatilho de conclusão de aula (verificarCertificados) abre o pedido', async () => {
    const { db, cursoId } = await cenario(true)
    await confirmarNomeSemEmitir(db)
    const { verificarCertificados } = await import('#/lib/certificados-cola')
    await verificarCertificados(env, 'ana', cursoId)
    expect(await db.select().from(pedidoDoMec)).toHaveLength(1)
  })

  it('curso que não gera Pedido do MEC emite sem abrir pedido', async () => {
    const { db } = await cenario(false)
    const { confirmarNomeEEmitir } = await import('#/lib/certificados-cola')
    expect(await confirmarNomeEEmitir(env, 'ana', 'Ana Souza')).toBe(1)
    expect(await db.select().from(pedidoDoMec)).toHaveLength(0)
  })

  it('se abrir o pedido falhar, o certificado sai mesmo assim e o PDF é enfileirado', async () => {
    const { db } = await cenario(true)
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Derruba só a tabela do pedido: o certificado não depende dela.
    await db.run(sql`drop table pedido_do_mec`)
    const { confirmarNomeEEmitir } = await import('#/lib/certificados-cola')
    expect(await confirmarNomeEEmitir(env, 'ana', 'Ana Souza')).toBe(1)
    expect(fila.send).toHaveBeenCalledOnce()
    erro.mockRestore()
  })
})
