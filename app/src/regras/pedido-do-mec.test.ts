import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import {
  certificado,
  conversaDeAtendimento,
  curso as cursoDaTabela,
  notificacao,
  pedidoDoMec,
  registroDeAcoes,
  user,
} from '#/db/schema'
import { abrirConversaPelaEquipe } from '#/regras/atendimento'
import { certificadosDoAluno } from '#/regras/certificados'
import { criarCurso } from '#/regras/conteudo'
import { contarFilas, FILAS } from '#/regras/filas'
import { notificarVarios } from '#/regras/notificacoes'
import {
  conferirLink,
  contarPedidosAtrasados,
  contarPedidosNaFila,
  criarPedidoDoMec,
  destacarPedidosAtrasados,
  listarPedidos,
  marcarLiberado,
  marcarProblema,
  pedidosDaAluna,
  tentarDeNovo,
} from '#/regras/pedido-do-mec'
import { PermissaoNegada } from '#/regras/permissoes'
import { montarResumo } from '#/regras/resumo-diario'
import { criarBancoDeTeste } from '#/test/banco'

// 2026-06-01 é segunda-feira.
let relogio = new Date('2026-06-01T15:00:00Z')
const agora = () => relogio
const em = (iso: string) => new Date(`${iso}T15:00:00Z`)

const link = 'https://voomp.example/certificado/abc'

async function cenario() {
  relogio = em('2026-06-01')
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana Souza', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
    { id: 'eq', name: 'Marina', email: 'eq@x.test', perfil: 'equipe' },
  ])
  const formacao = await criarCurso(db, { nome: 'Formação' })
  await db
    .update(cursoDaTabela)
    .set({ geraPedidoDoMec: true })
    .where(eq(cursoDaTabela.id, formacao))
  const comum = await criarCurso(db, { nome: 'Curso comum' })
  const emitir = async (userId: string, cursoId: string, n: number) => {
    const emitido = {
      id: `cert-${userId}-${n}`,
      userId,
      cursoId,
      codigo: `COD${n}-${userId}`.slice(0, 9).toUpperCase(),
      nome: 'Nome',
      cursoNome: cursoId === formacao ? 'Formação' : 'Curso comum',
      concluidoEm: agora(),
    }
    await db
      .insert(certificado)
      .values({ ...emitido, emitidoEm: agora(), pdfEstado: 'pronto' })
    return emitido
  }
  const equipe = { perfil: 'equipe' as const, equipeId: 'eq' }
  const abrir = (entrada: Parameters<typeof abrirConversaPelaEquipe>[2]) =>
    abrirConversaPelaEquipe(db, agora, entrada).then((r) => r.conversaId)
  return { db, formacao, comum, emitir, equipe, abrir }
}

describe('criar o pedido na emissão', () => {
  it('curso que gera Pedido do MEC abre um pedido Na fila', async () => {
    const { db, formacao, emitir } = await cenario()
    const c = await emitir('ana', formacao, 1)
    const id = await criarPedidoDoMec(db, agora, c)
    expect(id).toBeTruthy()
    const [p] = await db.select().from(pedidoDoMec)
    expect(p).toMatchObject({
      id,
      certificadoId: c.id,
      userId: 'ana',
      cursoId: formacao,
      estado: 'na_fila',
    })
    expect(p.naFilaDesde).toEqual(agora())
  })

  it('curso comum não abre pedido', async () => {
    const { db, comum, emitir } = await cenario()
    const c = await emitir('ana', comum, 1)
    expect(await criarPedidoDoMec(db, agora, c)).toBeNull()
    expect(await db.select().from(pedidoDoMec)).toHaveLength(0)
  })

  it('é idempotente: o mesmo certificado não duplica o pedido', async () => {
    const { db, formacao, emitir } = await cenario()
    const c = await emitir('ana', formacao, 1)
    expect(await criarPedidoDoMec(db, agora, c)).toBeTruthy()
    expect(await criarPedidoDoMec(db, agora, c)).toBeNull()
    expect(await db.select().from(pedidoDoMec)).toHaveLength(1)
  })
})

describe('marcar liberado', () => {
  it('vira Liberado com data e link, registra a ação e avisa a aluna uma vez', async () => {
    const { db, formacao, emitir, equipe } = await cenario()
    const pedidoId = (await criarPedidoDoMec(
      db,
      agora,
      await emitir('ana', formacao, 1),
    )) as string
    relogio = em('2026-06-03')
    const aoLiberar = vi.fn(async () => {})
    await marcarLiberado(
      db,
      agora,
      { ...equipe, pedidoId, link },
      { aoLiberar },
    )
    const [p] = await db.select().from(pedidoDoMec)
    expect(p).toMatchObject({ estado: 'liberado', linkDaVoomp: link })
    expect(p.liberadoEm).toEqual(em('2026-06-03'))
    expect(aoLiberar).toHaveBeenCalledOnce()
    expect(aoLiberar).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'ana',
        email: 'ana@x.test',
        cursoNome: 'Formação',
        linkDaVoomp: link,
      }),
    )
    const [acao] = await db
      .select()
      .from(registroDeAcoes)
      .where(eq(registroDeAcoes.acao, 'pedido-do-mec-liberado'))
    expect(acao.autorId).toBe('eq')
  })

  it('recusa liberar duas vezes, link inválido e quem não é da equipe', async () => {
    const { db, formacao, emitir, equipe } = await cenario()
    const pedidoId = (await criarPedidoDoMec(
      db,
      agora,
      await emitir('ana', formacao, 1),
    )) as string
    await expect(
      marcarLiberado(db, agora, { ...equipe, pedidoId, link: '' }),
    ).rejects.toThrow('Informe o link da Voomp.')
    await expect(
      marcarLiberado(db, agora, {
        ...equipe,
        pedidoId,
        link: 'javascript:alert(1)',
      }),
    ).rejects.toThrow('https://')
    await expect(
      marcarLiberado(db, agora, {
        perfil: 'aluno',
        equipeId: 'ana',
        pedidoId,
        link,
      }),
    ).rejects.toThrow(PermissaoNegada)
    await marcarLiberado(db, agora, { ...equipe, pedidoId, link })
    await expect(
      marcarLiberado(db, agora, { ...equipe, pedidoId, link }),
    ).rejects.toThrow('já está liberado')
    expect(await db.select().from(registroDeAcoes)).toHaveLength(1)
  })

  it('conferirLink aceita http(s) e devolve o endereço normalizado', () => {
    expect(conferirLink(' https://voomp.example/x ')).toBe(
      'https://voomp.example/x',
    )
    expect(() => conferirLink('voomp.example')).toThrow('não é um endereço')
    expect(() => conferirLink(`https://x.test/${'a'.repeat(600)}`)).toThrow(
      'passa de',
    )
  })
})

describe('problema e tentar de novo', () => {
  it('Problema com motivo abre o Atendimento com a aluna e guarda a conversa', async () => {
    const { db, formacao, emitir, equipe, abrir } = await cenario()
    const pedidoId = (await criarPedidoDoMec(
      db,
      agora,
      await emitir('ana', formacao, 1),
    )) as string
    const conversaId = await marcarProblema(
      db,
      agora,
      { ...equipe, pedidoId, motivo: 'CPF divergente na Voomp' },
      abrir,
    )
    const [p] = await db.select().from(pedidoDoMec)
    expect(p).toMatchObject({
      estado: 'problema',
      problemaMotivo: 'CPF divergente na Voomp',
      conversaId,
    })
    const [conversa] = await db
      .select()
      .from(conversaDeAtendimento)
      .where(eq(conversaDeAtendimento.id, conversaId))
    expect(conversa).toMatchObject({
      userId: 'ana',
      cursoId: formacao,
      assunto: 'Seu certificado do MEC',
      estado: 'respondida',
    })
    const registros = await db.select().from(registroDeAcoes)
    expect(registros.map((r) => r.acao)).toEqual(['pedido-do-mec-problema'])
    expect(registros[0].detalhe).toContain('CPF divergente na Voomp')
  })

  it('exige motivo, só vale para Na fila e não muda nada se o Atendimento falhar', async () => {
    const { db, formacao, emitir, equipe, abrir } = await cenario()
    const pedidoId = (await criarPedidoDoMec(
      db,
      agora,
      await emitir('ana', formacao, 1),
    )) as string
    await expect(
      marcarProblema(db, agora, { ...equipe, pedidoId, motivo: ' ' }, abrir),
    ).rejects.toThrow('Informe o motivo.')
    await expect(
      marcarProblema(
        db,
        agora,
        { ...equipe, pedidoId, motivo: 'x'.repeat(501) },
        abrir,
      ),
    ).rejects.toThrow('passa de 500')
    await expect(
      marcarProblema(
        db,
        agora,
        { ...equipe, pedidoId, motivo: 'faltou doc' },
        async () => {
          throw new Error('atendimento fora do ar')
        },
      ),
    ).rejects.toThrow('atendimento fora do ar')
    expect((await db.select().from(pedidoDoMec))[0].estado).toBe('na_fila')
    expect(await db.select().from(registroDeAcoes)).toHaveLength(0)

    await marcarProblema(
      db,
      agora,
      { ...equipe, pedidoId, motivo: 'faltou doc' },
      abrir,
    )
    await expect(
      marcarProblema(
        db,
        agora,
        { ...equipe, pedidoId, motivo: 'de novo' },
        abrir,
      ),
    ).rejects.toThrow('Só um pedido Na fila')
  })

  it('tentar de novo volta para Na fila, recomeça a contagem e registra', async () => {
    const { db, formacao, emitir, equipe, abrir } = await cenario()
    const pedidoId = (await criarPedidoDoMec(
      db,
      agora,
      await emitir('ana', formacao, 1),
    )) as string
    await expect(
      tentarDeNovo(db, agora, { ...equipe, pedidoId }),
    ).rejects.toThrow('com problema')
    await marcarProblema(
      db,
      agora,
      { ...equipe, pedidoId, motivo: 'faltou doc' },
      abrir,
    )
    relogio = em('2026-06-10')
    await tentarDeNovo(db, agora, { ...equipe, pedidoId })
    const [p] = await db.select().from(pedidoDoMec)
    expect(p.estado).toBe('na_fila')
    expect(p.naFilaDesde).toEqual(em('2026-06-10'))
    expect(p.destacadoEm).toBeNull()
    expect(
      (await db.select().from(registroDeAcoes)).map((r) => r.acao).sort(),
    ).toEqual(['pedido-do-mec-nova-tentativa', 'pedido-do-mec-problema'])
  })

  it('um pedido com Problema também pode ser liberado direto', async () => {
    const { db, formacao, emitir, equipe, abrir } = await cenario()
    const pedidoId = (await criarPedidoDoMec(
      db,
      agora,
      await emitir('ana', formacao, 1),
    )) as string
    await marcarProblema(
      db,
      agora,
      { ...equipe, pedidoId, motivo: 'faltou doc' },
      abrir,
    )
    await marcarLiberado(db, agora, { ...equipe, pedidoId, link })
    expect((await db.select().from(pedidoDoMec))[0].estado).toBe('liberado')
  })
})

describe('destaque dos 5 dias úteis', () => {
  async function doisPedidos() {
    const c = await cenario()
    // Ana pediu na segunda 1/6; Bia na segunda 8/6.
    await criarPedidoDoMec(c.db, agora, await c.emitir('ana', c.formacao, 1))
    relogio = em('2026-06-08')
    await criarPedidoDoMec(c.db, agora, await c.emitir('bia', c.formacao, 2))
    return c
  }

  it('só passa de 5 dias úteis a partir da terça seguinte à segunda seguinte', async () => {
    const { db } = await doisPedidos()
    relogio = em('2026-06-08') // 5 dias úteis para a Ana: ainda não
    expect(await contarPedidosAtrasados(db, agora)).toBe(0)
    relogio = em('2026-06-09') // 6: passou
    expect(await contarPedidosAtrasados(db, agora)).toBe(1)
    relogio = em('2026-06-16') // Bia também
    expect(await contarPedidosAtrasados(db, agora)).toBe(2)
  })

  it('a lista marca o atrasado e põe os mais antigos primeiro', async () => {
    const { db } = await doisPedidos()
    relogio = em('2026-06-09')
    const lista = await listarPedidos(db, agora, { estado: 'na_fila' })
    expect(
      lista.itens.map((i) => [i.alunoNome, i.atrasado, i.diasUteis]),
    ).toEqual([
      ['Ana Souza', true, 6],
      ['Bia', false, 1],
    ])
    expect(lista.contagens).toEqual({ na_fila: 2, problema: 0, liberado: 0 })
    expect(lista.atrasados).toBe(1)
  })

  it('a lista pagina de 20 em 20 e separa por estado', async () => {
    const { db, formacao, equipe } = await cenario()
    for (let i = 0; i < 25; i++) {
      const userId = `u${i}`
      await db
        .insert(user)
        .values({ id: userId, name: userId, email: `${userId}@x.test` })
      await db.insert(certificado).values({
        id: `c${i}`,
        userId,
        cursoId: formacao,
        codigo: `K${String(i).padStart(3, '0')}-AAAA`,
        nome: 'N',
        cursoNome: 'Formação',
        concluidoEm: agora(),
        emitidoEm: agora(),
      })
      await criarPedidoDoMec(db, agora, {
        id: `c${i}`,
        userId,
        cursoId: formacao,
      })
    }
    const primeira = await listarPedidos(db, agora, { estado: 'na_fila' })
    const segunda = await listarPedidos(db, agora, {
      estado: 'na_fila',
      pagina: 2,
    })
    expect([primeira.itens.length, segunda.itens.length]).toEqual([20, 5])
    expect(primeira.total).toBe(25)
    const [um] = await db.select().from(pedidoDoMec).limit(1)
    await marcarLiberado(db, agora, { ...equipe, pedidoId: um.id, link })
    expect(
      (await listarPedidos(db, agora, { estado: 'liberado' })).itens,
    ).toHaveLength(1)
    expect(await contarPedidosNaFila(db)).toBe(24)
  })

  it('o cron destaca cada espera uma vez e avisa com a quantidade', async () => {
    const { db } = await doisPedidos()
    const avisar = vi.fn(async () => {})
    relogio = em('2026-06-08')
    expect(await destacarPedidosAtrasados(db, agora, avisar)).toBe(0)
    expect(avisar).not.toHaveBeenCalled()
    relogio = em('2026-06-09')
    expect(await destacarPedidosAtrasados(db, agora, avisar)).toBe(1)
    expect(avisar).toHaveBeenCalledWith(1)
    relogio = em('2026-06-10')
    expect(await destacarPedidosAtrasados(db, agora, avisar)).toBe(0)
    expect(avisar).toHaveBeenCalledOnce()
  })

  it('a equipe recebe o aviso no sininho (como a cola faz)', async () => {
    const { db } = await doisPedidos()
    relogio = em('2026-06-09')
    await destacarPedidosAtrasados(db, agora, async (novos) => {
      await notificarVarios(db, agora, ['eq'], {
        tipo: 'fila-da-equipe',
        texto: `${novos} pedido do MEC passou`,
        link: '/painel/certificado-do-mec',
      })
    })
    const avisos = await db.select().from(notificacao)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].userId).toBe('eq')
  })

  it('só o Na fila é destacado: Problema e Liberado ficam de fora', async () => {
    const { db, equipe, abrir } = await doisPedidos()
    const [ana, bia] = await db
      .select()
      .from(pedidoDoMec)
      .orderBy(pedidoDoMec.criadoEm)
    await marcarProblema(
      db,
      agora,
      { ...equipe, pedidoId: ana.id, motivo: 'faltou doc' },
      abrir,
    )
    await marcarLiberado(db, agora, { ...equipe, pedidoId: bia.id, link })
    relogio = em('2026-07-01')
    expect(await contarPedidosAtrasados(db, agora)).toBe(0)
  })
})

describe('fila no painel e no resumo diário', () => {
  it('a fila "Certificado do MEC" está em FILAS e conta os Na fila', async () => {
    const { db, formacao, emitir } = await cenario()
    const fila = FILAS.find((f) => f.id === 'certificado-do-mec')
    expect(fila).toMatchObject({
      rotulo: 'Certificado do MEC',
      para: '/painel/certificado-do-mec',
    })
    await criarPedidoDoMec(db, agora, await emitir('ana', formacao, 1))
    expect(await fila?.contar(db)).toBe(1)
  })

  it('o resumo destaca quantos passaram de 5 dias úteis', async () => {
    const { db, formacao, emitir } = await cenario()
    await criarPedidoDoMec(db, agora, await emitir('ana', formacao, 1))
    relogio = em('2026-06-03')
    let resumo = montarResumo(await contarFilas(db, FILAS, agora))
    expect(resumo).toBe('Certificado do MEC: 1')
    relogio = em('2026-06-09')
    resumo = montarResumo(await contarFilas(db, FILAS, agora))
    expect(resumo).toBe('Certificado do MEC: 1 (1 com mais de 5 dias úteis)')
  })
})

describe('o que a aluna vê em Certificados', () => {
  it('"em liberação" enquanto Na fila ou com Problema, e "liberado" com a data e o link', async () => {
    const { db, formacao, comum, emitir, equipe, abrir } = await cenario()
    const doMec = await emitir('ana', formacao, 1)
    await emitir('ana', comum, 2)
    const pedidoId = (await criarPedidoDoMec(db, agora, doMec)) as string

    const lista = () => certificadosDoAluno(db, 'ana')
    const mecDe = async (cursoNome: string) =>
      (await lista()).find((c) => c.cursoNome === cursoNome)?.mec
    expect(await mecDe('Formação')).toMatchObject({
      situacao: 'em-liberacao',
      link: null,
    })
    expect(await mecDe('Curso comum')).toBeNull()

    await marcarProblema(
      db,
      agora,
      { ...equipe, pedidoId, motivo: 'faltou doc' },
      abrir,
    )
    expect((await mecDe('Formação'))?.situacao).toBe('em-liberacao')

    relogio = em('2026-06-04')
    await marcarLiberado(db, agora, { ...equipe, pedidoId, link })
    expect(await mecDe('Formação')).toEqual({
      situacao: 'liberado',
      liberadoEm: em('2026-06-04'),
      link,
    })
    expect((await pedidosDaAluna(db, 'bia')).size).toBe(0)
  })
})
