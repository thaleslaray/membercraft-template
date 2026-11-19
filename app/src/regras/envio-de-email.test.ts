import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { envioDeEmail, user } from '#/db/schema'
import { criarCurso } from '#/regras/conteudo'
import { modeloDe, montarEmail } from '#/regras/email-modelos'
import {
  alunoParaEmail,
  cursosDaLiberacao,
  type DependenciasDoEnvio,
  definirPreferenciaDeEmail,
  enfileirarEmail,
  enviarCodigoDeAcesso,
  historicoDeEmails,
  interpretarRetorno,
  listarTextosDeEmail,
  type MensagemDeEmail,
  marcarFalha,
  nomesDaLiberacao,
  preferenciasDeEmail,
  previaDeTexto,
  processarEnvio,
  registrarRetorno,
  restaurarTextoDeEmail,
  salvarTextoDeEmail,
  textoVigente,
  varrerEnviosSemResposta,
} from '#/regras/envio-de-email'
import { criarBancoDeTeste } from '#/test/banco'

const T0 = new Date('2026-06-01T12:00:00Z')
const agora = () => T0

async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana', email: 'ana@exemplo.com' },
    {
      id: 'dono',
      name: 'Helena',
      email: 'helena@exemplo.com',
      perfil: 'proprietario',
    },
  ])
  const mensagens: MensagemDeEmail[] = []
  const fila = {
    send: vi.fn(async (m: MensagemDeEmail) => void mensagens.push(m)),
  }
  return { db, fila, mensagens }
}

function deps(
  sobrepor: Partial<DependenciasDoEnvio> = {},
): DependenciasDoEnvio {
  return {
    montar: async (envio) =>
      montarEmail(modeloDe(envio.tipo), undefined, {
        nome: 'Ana',
        curso: 'Curso',
        link: 'https://x.com',
      }),
    enviar: vi.fn(async () => ({
      sent: true,
      provider: 'cloudflare',
      id: 'msg-1',
    })),
    ...sobrepor,
  }
}

const pedido = {
  tipo: 'curso-liberado',
  para: 'Ana@Exemplo.com',
  variaveis: { nome: 'Ana' },
} as const

describe('enfileirarEmail', () => {
  it('grava no histórico como na-fila e põe na fila com origem "email"', async () => {
    const { db, fila, mensagens } = await cenario()
    const r = await enfileirarEmail(db, agora, fila, pedido)
    expect(r.status).toBe('na-fila')
    expect(mensagens).toEqual([{ origem: 'email', envioId: r.envioId }])
    const [linha] = await db.select().from(envioDeEmail)
    expect(linha).toMatchObject({
      para: 'ana@exemplo.com',
      userId: 'ana',
      tipo: 'curso-liberado',
      status: 'na-fila',
    })
    expect(JSON.parse(linha?.variaveis ?? '')).toEqual({ nome: 'Ana' })
  })

  it('e-mail desligado pelo aluno fica "ignorado" e não vai para a fila', async () => {
    const { db, fila } = await cenario()
    await definirPreferenciaDeEmail(db, agora, {
      userId: 'ana',
      tipo: 'sentimos-sua-falta',
      ativo: false,
    })
    const r = await enfileirarEmail(db, agora, fila, {
      tipo: 'sentimos-sua-falta',
      para: 'ana@exemplo.com',
    })
    expect(r.status).toBe('ignorado')
    expect(fila.send).not.toHaveBeenCalled()
  })

  it('e-mail sem descadastro sai mesmo que a pessoa tenha desligado os outros', async () => {
    const { db, fila } = await cenario()
    await definirPreferenciaDeEmail(db, agora, {
      userId: 'ana',
      tipo: 'sentimos-sua-falta',
      ativo: false,
    })
    const r = await enfileirarEmail(db, agora, fila, pedido)
    expect(r.status).toBe('na-fila')
  })

  it('tipo desconhecido é erro', async () => {
    const { db, fila } = await cenario()
    await expect(
      enfileirarEmail(db, agora, fila, { tipo: 'x' as never, para: 'a@b.com' }),
    ).rejects.toThrow(/desconhecido/)
  })
})

describe('processarEnvio', () => {
  it('envia, marca como enviado e guarda assunto, provedor e id', async () => {
    const { db, fila } = await cenario()
    const { envioId } = await enfileirarEmail(db, agora, fila, pedido)
    const d = deps()
    expect(await processarEnvio(db, agora, envioId, d)).toBe('enviado')
    expect(d.enviar).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ana@exemplo.com' }),
    )
    const [linha] = await db.select().from(envioDeEmail)
    expect(linha).toMatchObject({
      status: 'enviado',
      provedor: 'cloudflare',
      idDoProvedor: 'msg-1',
      tentativas: 1,
      enviadoEm: T0,
    })
    expect(linha?.assunto).toContain('liberado')
  })

  it('repetir a mensagem de um envio já resolvido não envia de novo', async () => {
    const { db, fila } = await cenario()
    const { envioId } = await enfileirarEmail(db, agora, fila, pedido)
    const d = deps()
    await processarEnvio(db, agora, envioId, d)
    expect(await processarEnvio(db, agora, envioId, d)).toBe('enviado')
    expect(d.enviar).toHaveBeenCalledTimes(1)
  })

  it('falha lança (a fila tenta de novo), conta a tentativa e mantém na-fila; a nova tentativa envia', async () => {
    const { db, fila } = await cenario()
    const { envioId } = await enfileirarEmail(db, agora, fila, pedido)
    const falha = deps({
      enviar: vi.fn(async () => {
        throw new Error('provedor fora do ar')
      }),
    })
    await expect(processarEnvio(db, agora, envioId, falha)).rejects.toThrow(
      /fora do ar/,
    )
    const [depoisDaFalha] = await db.select().from(envioDeEmail)
    expect(depoisDaFalha).toMatchObject({
      status: 'na-fila',
      tentativas: 1,
      erro: 'provedor fora do ar',
    })

    expect(await processarEnvio(db, agora, envioId, deps())).toBe('enviado')
    const [final] = await db.select().from(envioDeEmail)
    expect(final).toMatchObject({
      status: 'enviado',
      tentativas: 2,
      erro: null,
    })
  })

  it('o ambiente de testes bloqueia: fica "bloqueado" e não conta como enviado', async () => {
    const { db, fila } = await cenario()
    const { envioId } = await enfileirarEmail(db, agora, fila, pedido)
    const d = deps({
      enviar: async () => ({ sent: false, provider: 'bloqueado' }),
    })
    expect(await processarEnvio(db, agora, envioId, d)).toBe('bloqueado')
    const [linha] = await db.select().from(envioDeEmail)
    expect(linha?.enviadoEm).toBeNull()
  })

  it('corrida de dois consumidores: só um envia', async () => {
    const { db, fila } = await cenario()
    const { envioId } = await enfileirarEmail(db, agora, fila, pedido)
    const d = deps()
    const resultados = await Promise.all([
      processarEnvio(db, agora, envioId, d),
      processarEnvio(db, agora, envioId, d),
    ])
    expect(d.enviar).toHaveBeenCalledTimes(1)
    expect(resultados).toContain('enviado')
    const [linha] = await db.select().from(envioDeEmail)
    expect(linha).toMatchObject({ status: 'enviado', tentativas: 1 })
  })

  it('mensagem repetida enquanto outro consumidor envia (enviando) não envia', async () => {
    const { db, fila } = await cenario()
    const { envioId } = await enfileirarEmail(db, agora, fila, pedido)
    await db.update(envioDeEmail).set({ status: 'enviando' })
    const d = deps()
    expect(await processarEnvio(db, agora, envioId, d)).toBe('enviando')
    expect(d.enviar).not.toHaveBeenCalled()
  })

  it('o provedor aceitou mas o registro final falhou: não lança (evita duplicata) e fica enviando', async () => {
    const { db, fila } = await cenario()
    const { envioId } = await enfileirarEmail(db, agora, fila, pedido)
    await db.run(sql`CREATE TRIGGER recusa_enviado BEFORE UPDATE ON envio_de_email
      WHEN NEW.status = 'enviado'
      BEGIN SELECT RAISE(ABORT, 'banco caiu'); END`)
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps()
    expect(await processarEnvio(db, agora, envioId, d)).toBe('enviado')
    expect(d.enviar).toHaveBeenCalledTimes(1)
    expect(erro).toHaveBeenCalled()
    erro.mockRestore()
    const [linha] = await db.select().from(envioDeEmail)
    expect(linha?.status).toBe('enviando')
    // a fila reentrega: não envia de novo
    expect(await processarEnvio(db, agora, envioId, d)).toBe('enviando')
    expect(d.enviar).toHaveBeenCalledTimes(1)
  })

  it('envio inexistente não quebra', async () => {
    const { db } = await cenario()
    expect(await processarEnvio(db, agora, 'nada', deps())).toBe('inexistente')
  })
})

describe('marcarFalha (fila de mortos)', () => {
  it('marca como falhou o que ainda estava na fila, e só isso', async () => {
    const { db, fila } = await cenario()
    const a = await enfileirarEmail(db, agora, fila, pedido)
    const b = await enfileirarEmail(db, agora, fila, pedido)
    await processarEnvio(db, agora, b.envioId, deps())
    await marcarFalha(db, a.envioId, 'esgotou')
    await marcarFalha(db, b.envioId, 'esgotou')
    const linhas = await db.select().from(envioDeEmail)
    expect(linhas.find((l) => l.id === a.envioId)).toMatchObject({
      status: 'falhou',
      erro: 'esgotou',
    })
    expect(linhas.find((l) => l.id === b.envioId)?.status).toBe('enviado')
  })
})

describe('varrerEnviosSemResposta', () => {
  it('na-fila e enviando com mais de 1 h viram falhou; o resto fica', async () => {
    const { db } = await cenario()
    const velho = new Date(T0.getTime() - 61 * 60 * 1000)
    const recente = new Date(T0.getTime() - 59 * 60 * 1000)
    const base = { para: 'ana@exemplo.com', tipo: 'curso-liberado' }
    await db.insert(envioDeEmail).values([
      { ...base, id: 'a', status: 'na-fila', criadoEm: velho },
      { ...base, id: 'b', status: 'enviando', criadoEm: velho },
      { ...base, id: 'c', status: 'na-fila', criadoEm: recente },
      { ...base, id: 'd', status: 'enviado', criadoEm: velho },
    ])
    expect(await varrerEnviosSemResposta(db, agora)).toBe(2)
    const linhas = await db.select().from(envioDeEmail)
    const por = (id: string) => linhas.find((l) => l.id === id)
    expect(por('a')).toMatchObject({ status: 'falhou', erro: 'sem resposta' })
    expect(por('b')).toMatchObject({ status: 'falhou', erro: 'sem resposta' })
    expect(por('c')?.status).toBe('na-fila')
    expect(por('d')?.status).toBe('enviado')
  })
})

describe('retorno', () => {
  it('interpreta bounce e reclamação do Resend e ignora o resto', () => {
    expect(
      interpretarRetorno({
        type: 'email.bounced',
        data: { email_id: 'm1', bounce: { message: 'Caixa cheia' } },
      }),
    ).toEqual({ idDoProvedor: 'm1', motivo: 'Caixa cheia' })
    expect(
      interpretarRetorno({ type: 'email.complained', data: { email_id: 'm1' } })
        ?.motivo,
    ).toMatch(/spam/)
    expect(
      interpretarRetorno({ type: 'email.delivered', data: { email_id: 'm1' } }),
    ).toBeNull()
    expect(interpretarRetorno({ type: 'email.bounced', data: {} })).toBeNull()
    expect(interpretarRetorno(null)).toBeNull()
  })

  it('marca o envio como retornou, com motivo e hora, e aparece no histórico', async () => {
    const { db, fila } = await cenario()
    const { envioId } = await enfileirarEmail(db, agora, fila, pedido)
    await processarEnvio(db, agora, envioId, deps())
    expect(
      await registrarRetorno(db, agora, {
        idDoProvedor: 'msg-1',
        motivo: 'Caixa cheia',
      }),
    ).toBe(true)
    const [item] = await historicoDeEmails(db, 'ana')
    expect(item).toMatchObject({
      status: 'retornou',
      retorno: 'Caixa cheia',
      retornoEm: T0,
      nome: 'Curso liberado',
    })
  })

  it('retorno sobre envio que falhou ou foi bloqueado é ignorado', async () => {
    const { db, fila } = await cenario()
    const a = await enfileirarEmail(db, agora, fila, pedido)
    await processarEnvio(db, agora, a.envioId, deps())
    await marcarFalha(db, a.envioId, 'x') // enviado: segue enviado
    await db.update(envioDeEmail).set({ status: 'falhou' })
    expect(
      await registrarRetorno(db, agora, {
        idDoProvedor: 'msg-1',
        motivo: 'Caixa cheia',
      }),
    ).toBe(false)
    await db.update(envioDeEmail).set({ status: 'bloqueado' })
    expect(
      await registrarRetorno(db, agora, {
        idDoProvedor: 'msg-1',
        motivo: 'Caixa cheia',
      }),
    ).toBe(false)
    const [linha] = await db.select().from(envioDeEmail)
    expect(linha).toMatchObject({ status: 'bloqueado', retorno: null })
  })

  it('retorno de um id que não é nosso é ignorado', async () => {
    const { db } = await cenario()
    expect(
      await registrarRetorno(db, agora, { idDoProvedor: 'zzz', motivo: 'x' }),
    ).toBe(false)
  })
})

describe('histórico', () => {
  it('lista só os e-mails do aluno, do mais novo para o mais antigo', async () => {
    const { db, fila } = await cenario()
    let t = T0
    await enfileirarEmail(db, () => t, fila, pedido)
    t = new Date(T0.getTime() + 1000)
    await enfileirarEmail(db, () => t, fila, {
      tipo: 'acesso-pronto',
      para: 'ana@exemplo.com',
    })
    await enfileirarEmail(db, agora, fila, {
      tipo: 'acesso-pronto',
      para: 'helena@exemplo.com',
    })
    const itens = await historicoDeEmails(db, 'ana')
    expect(itens.map((i) => i.tipo)).toEqual([
      'acesso-pronto',
      'curso-liberado',
    ])
  })
})

describe('preferências de e-mail', () => {
  it('Minha conta lista só os e-mails com descadastro, todos ligados no começo', async () => {
    const { db } = await cenario()
    const prefs = await preferenciasDeEmail(db, 'ana')
    expect(prefs.map((p) => p.tipo)).toEqual([
      'sentimos-sua-falta',
      'acesso-expirando',
      'resposta-ao-comentario',
    ])
    expect(prefs.every((p) => p.ativo)).toBe(true)
  })

  it('desligar e religar', async () => {
    const { db } = await cenario()
    await definirPreferenciaDeEmail(db, agora, {
      userId: 'ana',
      tipo: 'acesso-expirando',
      ativo: false,
    })
    await definirPreferenciaDeEmail(db, agora, {
      userId: 'ana',
      tipo: 'acesso-expirando',
      ativo: false,
    })
    expect(
      (await preferenciasDeEmail(db, 'ana')).find(
        (p) => p.tipo === 'acesso-expirando',
      )?.ativo,
    ).toBe(false)
    await definirPreferenciaDeEmail(db, agora, {
      userId: 'ana',
      tipo: 'acesso-expirando',
      ativo: true,
    })
    expect(
      (await preferenciasDeEmail(db, 'ana')).find(
        (p) => p.tipo === 'acesso-expirando',
      )?.ativo,
    ).toBe(true)
  })

  it('e-mail sem descadastro não pode ser desligado', async () => {
    const { db } = await cenario()
    await expect(
      definirPreferenciaDeEmail(db, agora, {
        userId: 'ana',
        tipo: 'curso-liberado',
        ativo: false,
      }),
    ).rejects.toThrow(/não pode ser desligado/)
  })
})

describe('textos editáveis', () => {
  it('sem edição vale o padrão; salvar passa a valer e restaurar volta ao padrão', async () => {
    const { db } = await cenario()
    expect(await textoVigente(db, 'curso-liberado')).toBeUndefined()
    await salvarTextoDeEmail(db, agora, {
      tipo: 'curso-liberado',
      assunto: 'Chegou, {{nome}}!',
      corpo: 'Entre: {{link}}',
      autorId: 'dono',
    })
    expect(await textoVigente(db, 'curso-liberado')).toEqual({
      assunto: 'Chegou, {{nome}}!',
      corpo: 'Entre: {{link}}',
    })
    const item = (await listarTextosDeEmail(db)).find(
      (t) => t.tipo === 'curso-liberado',
    )
    expect(item).toMatchObject({
      editado: true,
      vigente: { assunto: 'Chegou, {{nome}}!' },
    })
    expect(item?.padrao.assunto).toContain('{{curso}}')
    await restaurarTextoDeEmail(db, 'curso-liberado')
    expect(await textoVigente(db, 'curso-liberado')).toBeUndefined()
  })

  it('salvar de novo substitui o texto anterior', async () => {
    const { db } = await cenario()
    await salvarTextoDeEmail(db, agora, {
      tipo: 'conteudo-liberado',
      assunto: 'A',
      corpo: 'um',
      autorId: 'dono',
    })
    await salvarTextoDeEmail(db, agora, {
      tipo: 'conteudo-liberado',
      assunto: 'B',
      corpo: 'dois',
      autorId: 'dono',
    })
    expect(await textoVigente(db, 'conteudo-liberado')).toEqual({
      assunto: 'B',
      corpo: 'dois',
    })
  })

  it('texto inválido não é salvo (variável desconhecida, e-mail do código)', async () => {
    const { db } = await cenario()
    await expect(
      salvarTextoDeEmail(db, agora, {
        tipo: 'conteudo-liberado',
        assunto: 'a',
        corpo: '{{cpf}}',
        autorId: 'dono',
      }),
    ).rejects.toThrow(/cpf/)
    await expect(
      salvarTextoDeEmail(db, agora, {
        tipo: 'codigo',
        assunto: 'a',
        corpo: 'b',
        autorId: 'dono',
      }),
    ).rejects.toThrow(/travado/)
    expect(await textoVigente(db, 'conteudo-liberado')).toBeUndefined()
  })

  it('a prévia valida e usa os exemplos', () => {
    const previa = previaDeTexto('acesso-pronto', {
      assunto: 'Oi {{nome}}',
      corpo: 'Entre {{link}}',
    })
    expect(previa.subject).toBe('Oi Marina')
    expect(() =>
      previaDeTexto('acesso-pronto', { assunto: 'x', corpo: 'sem link' }),
    ).toThrow(/link/)
  })
})

describe('enviarCodigoDeAcesso', () => {
  const mensagem = {
    subject: 'Seu código de acesso: 123456',
    html: '<p>123456</p>',
    text: '123456',
  }

  it('envia na hora e registra no histórico sem o código', async () => {
    const { db } = await cenario()
    const enviar = vi.fn(async () => ({
      sent: true,
      provider: 'resend',
      id: 're_1',
    }))
    const resultado = await enviarCodigoDeAcesso(
      db,
      agora,
      { email: ' Ana@Exemplo.com ', otp: '123456', mensagem },
      enviar,
    )
    expect(resultado).toMatchObject({ provider: 'resend' })
    expect(enviar).toHaveBeenCalledWith({ to: 'ana@exemplo.com', ...mensagem })
    const [linha] = await db.select().from(envioDeEmail)
    expect(linha).toMatchObject({
      userId: 'ana',
      para: 'ana@exemplo.com',
      tipo: 'codigo',
      assunto: 'Seu código de acesso: ••••••',
      status: 'enviado',
      provedor: 'resend',
      idDoProvedor: 're_1',
      tentativas: 1,
      enviadoEm: T0,
      criadoEm: T0,
    })
    expect(JSON.stringify(linha)).not.toContain('123456')
  })

  it('e-mail sem conta entra sem usuário; provedor bloqueado vira "bloqueado" sem data de envio', async () => {
    const { db } = await cenario()
    await enviarCodigoDeAcesso(
      db,
      agora,
      { email: 'visitante@exemplo.com', otp: '123456', mensagem },
      async () => ({ sent: false, provider: 'bloqueado' }),
    )
    const [linha] = await db.select().from(envioDeEmail)
    expect(linha).toMatchObject({
      userId: null,
      status: 'bloqueado',
      enviadoEm: null,
    })
  })

  it('o envio que falha anota o erro no histórico e sobe', async () => {
    const { db } = await cenario()
    await expect(
      enviarCodigoDeAcesso(
        db,
        agora,
        { email: 'ana@exemplo.com', otp: '123456', mensagem },
        async () => {
          throw new Error('Resend fora do ar')
        },
      ),
    ).rejects.toThrow('Resend fora do ar')
    const [linha] = await db.select().from(envioDeEmail)
    expect(linha).toMatchObject({
      status: 'falhou',
      erro: 'Resend fora do ar',
      tentativas: 1,
    })
  })
})

describe('dados para pedir e-mails', () => {
  it('alunoParaEmail devolve nome e e-mail, ou nulo se a pessoa sumiu', async () => {
    const { db } = await cenario()
    expect(await alunoParaEmail(db, 'ana')).toEqual({
      id: 'ana',
      nome: 'Ana',
      email: 'ana@exemplo.com',
    })
    expect(await alunoParaEmail(db, 'ninguem')).toBeNull()
  })

  it('cursosDaLiberacao segue a ordem da vitrine e ignora curso que sumiu', async () => {
    const { db } = await cenario()
    const a = await criarCurso(db, { nome: 'Zebra' })
    const b = await criarCurso(db, { nome: 'Abelha' })
    expect(await cursosDaLiberacao(db, [b, a, 'nada'])).toEqual([
      { id: a, nome: 'Zebra' },
      { id: b, nome: 'Abelha' },
    ])
    expect(await cursosDaLiberacao(db, [])).toEqual([])
  })

  it('nomesDaLiberacao traz o nome da aluna e do curso, e nulos quando não existem', async () => {
    const { db } = await cenario()
    const cursoId = await criarCurso(db, { nome: 'Coloração' })
    expect(await nomesDaLiberacao(db, { userId: 'ana', cursoId })).toEqual({
      aluno: 'Ana',
      curso: 'Coloração',
    })
    expect(await nomesDaLiberacao(db, { userId: 'x', cursoId: 'y' })).toEqual({
      aluno: null,
      curso: null,
    })
  })
})
