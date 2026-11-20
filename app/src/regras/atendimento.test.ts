import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import {
  avisoAgrupado,
  conversaDeAtendimento,
  mensagemDeAtendimento,
  user,
} from '#/db/schema'
import { coletarAvisosProntos } from '#/regras/agrupamento'
import {
  abrirConversa,
  abrirConversaPelaEquipe,
  anexoDoDono,
  assuntoComCodigo,
  avisoDeAtendimentoLigado,
  avisosParaEquipe,
  CHAVE_DO_AVISO,
  chaveDoAnexo,
  contarAbertas,
  continuarComoAluno,
  cursosParaConversa,
  definirAvisoDeAtendimento,
  ErroDeAtendimento,
  ehRespostaAutomatica,
  etiquetaDoCodigo,
  excluirConversa,
  extrairCodigo,
  filaDaEquipe,
  htmlParaTexto,
  lerConversa,
  limparRespostaDeEmail,
  normalizarAssunto,
  podeVerAnexo,
  receberEmail,
  resolverConversa,
  responderComoEquipe,
  validarImagem,
} from '#/regras/atendimento'
import { criarCurso } from '#/regras/conteudo'
import { limparExclusoesVencidas } from '#/regras/exclusao-protegida'
import { criarTurma, matricularManual } from '#/regras/matricula'
import { TABELAS_COM_EXCLUSAO } from '#/regras/tabelas-com-exclusao'
import { criarBancoDeTeste } from '#/test/banco'

let relogio = new Date('2026-06-01T12:00:00Z')
const agora = () => relogio
const avancar = (minutos: number) => {
  relogio = new Date(relogio.getTime() + minutos * 60_000)
}

async function cenario() {
  relogio = new Date('2026-06-01T12:00:00Z')
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    { id: 'ana', name: 'Ana Souza', email: 'ana@x.test' },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
    { id: 'eq', name: 'Carla', email: 'eq@x.test', perfil: 'equipe' },
    {
      id: 'dono',
      name: 'Helena',
      email: 'dono@x.test',
      perfil: 'proprietario',
    },
  ])
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  const outroCursoId = await criarCurso(db, { nome: 'Corte' })
  const turmaId = await criarTurma(db, { cursoId, nome: 'Turma 1' })
  await matricularManual(db, agora, {
    pessoas: [{ email: 'ana@x.test' }],
    turmaId,
    autorId: 'eq',
  })
  return { db, cursoId, outroCursoId }
}

const aluna = { id: 'ana', equipe: false }
const equipe = { id: 'eq', equipe: true }

describe('abrirConversa', () => {
  it('abre Aberta, com a primeira mensagem e o curso escolhido', async () => {
    const { db, cursoId } = await cenario()
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      cursoId,
      assunto: ' Não abre a aula ',
      texto: 'Aparece tela preta.',
    })
    const conversa = await lerConversa(db, id, aluna)
    expect(conversa).toMatchObject({
      assunto: 'Não abre a aula',
      estado: 'aberta',
      cursoNome: 'Coloração',
      canal: 'area',
      visitante: false,
    })
    expect(conversa.mensagens).toHaveLength(1)
    expect(conversa.mensagens[0]).toMatchObject({
      autor: 'aluno',
      texto: 'Aparece tela preta.',
    })
  })

  it('só deixa escolher um curso que o aluno tem', async () => {
    const { db, outroCursoId } = await cenario()
    await expect(
      abrirConversa(db, agora, {
        userId: 'ana',
        cursoId: outroCursoId,
        assunto: 'Oi',
        texto: 'Oi',
      }),
    ).rejects.toThrow('Escolha um dos seus cursos.')
  })

  it('aceita sem curso (outro assunto) e recusa assunto ou texto vazio', async () => {
    const { db } = await cenario()
    await abrirConversa(db, agora, {
      userId: 'bia',
      assunto: 'Antes de comprar',
      texto: 'Tenho uma dúvida.',
    })
    await expect(
      abrirConversa(db, agora, { userId: 'bia', assunto: ' ', texto: 'x' }),
    ).rejects.toThrow('Escreva o assunto.')
    await expect(
      abrirConversa(db, agora, { userId: 'bia', assunto: 'x', texto: '  ' }),
    ).rejects.toThrow('Escreva a mensagem.')
  })

  it('limita a mensagem a 5.000 caracteres', async () => {
    const { db } = await cenario()
    const entrada = { userId: 'ana', assunto: 'x' }
    await abrirConversa(db, agora, { ...entrada, texto: 'a'.repeat(5000) })
    await expect(
      abrirConversa(db, agora, { ...entrada, texto: 'a'.repeat(5001) }),
    ).rejects.toThrow(ErroDeAtendimento)
  })

  it('limita a 5 conversas novas por hora por aluno, e a hora seguinte libera', async () => {
    const { db } = await cenario()
    const abrir = (userId: string) =>
      abrirConversa(db, agora, { userId, assunto: 'x', texto: 'y' })
    for (let i = 0; i < 5; i++) await abrir('ana')
    await expect(abrir('ana')).rejects.toThrow('5 conversas na última hora')
    // Outro aluno não é afetado.
    await expect(abrir('bia')).resolves.toBeTruthy()
    avancar(61)
    await expect(abrir('ana')).resolves.toBeTruthy()
  })

  it('anexa só imagens do próprio dono, até 5', async () => {
    const { db } = await cenario()
    const minha = chaveDoAnexo('ana', 'u1', 'print.png')
    const dela = chaveDoAnexo('bia', 'u2', 'print.png')
    const base = { userId: 'ana', assunto: 'x', texto: 'y' }
    await expect(
      abrirConversa(db, agora, { ...base, anexos: [dela] }),
    ).rejects.toThrow('Anexo inválido.')
    await expect(
      abrirConversa(db, agora, {
        ...base,
        anexos: Array.from({ length: 6 }, (_, i) =>
          chaveDoAnexo('ana', `u${i}`, 'a.png'),
        ),
      }),
    ).rejects.toThrow('no máximo 5 imagens')
    const id = await abrirConversa(db, agora, { ...base, anexos: [minha] })
    expect((await lerConversa(db, id, aluna)).mensagens[0]?.anexos).toEqual([
      minha,
    ])
  })

  it('avisa a equipe pelo agrupamento de 15 minutos', async () => {
    const { db } = await cenario()
    await abrirConversa(db, agora, { userId: 'ana', assunto: 'x', texto: 'y' })
    expect(await db.select().from(avisoAgrupado)).toMatchObject([
      { chave: CHAVE_DO_AVISO },
    ])
  })
})

describe('estados da conversa', () => {
  it('Aberta -> Respondida pela equipe -> Aberta quando o aluno responde -> Resolvida -> reabre', async () => {
    const { db } = await cenario()
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'Ajuda',
      texto: 'Preciso de ajuda',
    })
    const estado = async () => (await lerConversa(db, id, equipe)).estado

    avancar(5)
    await responderComoEquipe(db, agora, {
      conversaId: id,
      equipeId: 'eq',
      texto: 'Já olho.',
    })
    expect(await estado()).toBe('respondida')

    avancar(5)
    await continuarComoAluno(db, agora, {
      conversaId: id,
      userId: 'ana',
      texto: 'Obrigada!',
    })
    expect(await estado()).toBe('aberta')

    await resolverConversa(db, agora, id)
    expect(await estado()).toBe('resolvida')

    avancar(5)
    await continuarComoAluno(db, agora, {
      conversaId: id,
      userId: 'ana',
      texto: 'Voltou o erro.',
    })
    const lida = await lerConversa(db, id, equipe)
    expect(lida.estado).toBe('aberta')
    expect(lida.mensagens.map((m) => m.autor)).toEqual([
      'aluno',
      'equipe',
      'aluno',
      'aluno',
    ])
    expect(lida.mensagens[1]?.autorNome).toBe('Carla')
  })

  it('a equipe responde a Resolvida e ela volta a Respondida', async () => {
    const { db } = await cenario()
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'x',
      texto: 'y',
    })
    await resolverConversa(db, agora, id)
    await responderComoEquipe(db, agora, {
      conversaId: id,
      equipeId: 'dono',
      texto: 'Mais uma coisa.',
    })
    expect((await lerConversa(db, id, equipe)).estado).toBe('respondida')
  })

  it('o aluno não continua a conversa de outro', async () => {
    const { db } = await cenario()
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'x',
      texto: 'y',
    })
    await expect(
      continuarComoAluno(db, agora, {
        conversaId: id,
        userId: 'bia',
        texto: 'oi',
      }),
    ).rejects.toThrow('Conversa não encontrada.')
    await expect(
      lerConversa(db, id, { id: 'bia', equipe: false }),
    ).rejects.toThrow('Conversa não encontrada.')
  })
})

describe('responderComoEquipe', () => {
  it('devolve a quem avisar e chama o gancho; visitante é respondido por e-mail', async () => {
    const { db } = await cenario()
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'Ajuda',
      texto: 'x',
    })
    const gancho = vi.fn()
    const resposta = await responderComoEquipe(
      db,
      agora,
      { conversaId: id, equipeId: 'eq', texto: 'Oi, Ana.' },
      { aoResponderPelaEquipe: gancho },
    )
    expect(resposta).toMatchObject({
      assunto: 'Ajuda',
      texto: 'Oi, Ana.',
      para: { userId: 'ana', email: 'ana@x.test', visitante: false },
    })
    expect(gancho).toHaveBeenCalledWith(resposta)

    const visita = await receberEmail(db, agora, {
      autenticado: true,
      de: 'Nova@Exemplo.com',
      nome: 'Nova',
      assunto: 'Quero comprar',
      texto: 'Como funciona?',
    })
    if (visita.resultado !== 'abriu') throw new Error('esperava abrir')
    const r2 = await responderComoEquipe(db, agora, {
      conversaId: visita.conversaId,
      equipeId: 'eq',
      texto: 'Funciona assim.',
    })
    expect(r2.para).toMatchObject({
      userId: null,
      email: 'nova@exemplo.com',
      nome: 'Nova',
      visitante: true,
    })
  })

  it('recusa conversa excluída ou resposta vazia', async () => {
    const { db } = await cenario()
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'x',
      texto: 'y',
    })
    await expect(
      responderComoEquipe(db, agora, {
        conversaId: id,
        equipeId: 'eq',
        texto: ' ',
      }),
    ).rejects.toThrow('Escreva a mensagem.')
    await excluirConversa(db, agora, id)
    await expect(
      responderComoEquipe(db, agora, {
        conversaId: id,
        equipeId: 'eq',
        texto: 'oi',
      }),
    ).rejects.toThrow('Conversa não encontrada.')
  })
})

describe('abrirConversaPelaEquipe', () => {
  it('nasce Respondida, com a mensagem da equipe, sem avisar a equipe nem gastar o limite do aluno', async () => {
    const { db, cursoId } = await cenario()
    const resposta = await abrirConversaPelaEquipe(db, agora, {
      equipeId: 'eq',
      userId: 'ana',
      cursoId,
      assunto: 'Pedido do MEC com problema',
      texto: 'Faltou um documento.',
    })
    expect(resposta.para).toMatchObject({ userId: 'ana', visitante: false })
    expect(resposta.codigo).toHaveLength(6)
    const lida = await lerConversa(db, resposta.conversaId, aluna)
    expect(lida.estado).toBe('respondida')
    expect(lida.mensagens[0]).toMatchObject({
      autor: 'equipe',
      autorNome: 'Carla',
    })
    expect(await db.select().from(avisoAgrupado)).toHaveLength(0)
  })

  it('recusa aluno inexistente', async () => {
    const { db } = await cenario()
    await expect(
      abrirConversaPelaEquipe(db, agora, {
        equipeId: 'eq',
        userId: 'ninguem',
        assunto: 'x',
        texto: 'y',
      }),
    ).rejects.toThrow('Aluno não encontrado.')
  })
})

describe('receberEmail (suporte@ e help@)', () => {
  it('e-mail de aluno abre uma conversa dele, pelo canal e-mail', async () => {
    const { db } = await cenario()
    const r = await receberEmail(db, agora, {
      autenticado: true,
      de: 'ANA@x.test',
      assunto: 'Re: Certificado',
      texto: 'Cadê meu certificado?',
    })
    if (r.resultado !== 'abriu') throw new Error('esperava abrir')
    const lida = await lerConversa(db, r.conversaId, aluna)
    expect(lida).toMatchObject({
      assunto: 'Certificado',
      canal: 'email',
      visitante: false,
      estado: 'aberta',
    })
    expect(lida.mensagens[0]).toMatchObject({ autor: 'aluno', origem: 'email' })
  })

  it('e-mail com o From de um aluno, mas sem autenticação, vira Visitante e não toca na conta', async () => {
    const { db } = await cenario()
    const r = await receberEmail(db, agora, {
      de: 'ana@x.test',
      assunto: 'Certificado',
      texto: 'Mensagem forjada.',
      autenticado: false,
    })
    if (r.resultado !== 'abriu') throw new Error('esperava abrir')
    const lida = await lerConversa(db, r.conversaId, equipe)
    expect(lida).toMatchObject({ visitante: true, alunoEmail: 'ana@x.test' })
    expect(lida.mensagens[0]?.autor).toBe('visitante')
    expect(await filaDaEquipe(db, 'aberta')).toMatchObject({
      itens: [{ visitante: true }],
    })
  })

  it('e-mail de desconhecido vira conversa de Visitante', async () => {
    const { db } = await cenario()
    const r = await receberEmail(db, agora, {
      autenticado: true,
      de: 'estranha@exemplo.com',
      nome: 'Estranha',
      assunto: 'Perdi o acesso',
      texto: 'Não entro mais.',
    })
    if (r.resultado !== 'abriu') throw new Error('esperava abrir')
    const lida = await lerConversa(db, r.conversaId, equipe)
    expect(lida).toMatchObject({
      visitante: true,
      alunoEmail: 'estranha@exemplo.com',
      alunoNome: 'Estranha',
    })
    expect(lida.mensagens[0]?.autor).toBe('visitante')
    expect(await filaDaEquipe(db, 'aberta')).toMatchObject({
      itens: [{ visitante: true }],
    })
  })

  it('responder o e-mail com o código no assunto continua a mesma conversa e a reabre', async () => {
    const { db } = await cenario()
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'Ajuda',
      texto: 'x',
    })
    const { codigo } = await responderComoEquipe(db, agora, {
      conversaId: id,
      equipeId: 'eq',
      texto: 'Oi',
    })
    await resolverConversa(db, agora, id)
    const r = await receberEmail(db, agora, {
      autenticado: true,
      de: 'ana@x.test',
      assunto: `Re: Resposta ao seu atendimento: Ajuda ${etiquetaDoCodigo(codigo)}`,
      texto:
        'Obrigada, mas não resolveu.\n\nEm seg., 1 de jun. de 2026, Escola escreveu:\n> Oi',
    })
    expect(r).toEqual({ resultado: 'continuou', conversaId: id })
    const lida = await lerConversa(db, id, aluna)
    expect(lida.estado).toBe('aberta')
    expect(lida.mensagens.at(-1)).toMatchObject({
      texto: 'Obrigada, mas não resolveu.',
      origem: 'email',
    })
  })

  it('o código de outra pessoa não vale: abre conversa nova', async () => {
    const { db } = await cenario()
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'Ajuda',
      texto: 'x',
    })
    const { codigo } = await responderComoEquipe(db, agora, {
      conversaId: id,
      equipeId: 'eq',
      texto: 'Oi',
    })
    const r = await receberEmail(db, agora, {
      autenticado: true,
      de: 'intrusa@exemplo.com',
      assunto: `Re: ${etiquetaDoCodigo(codigo)}`,
      texto: 'Oi',
    })
    expect(r.resultado).toBe('abriu')
    expect((await lerConversa(db, id, aluna)).mensagens).toHaveLength(2)
  })

  it('sem código, o mesmo assunto continua a conversa do remetente', async () => {
    const { db } = await cenario()
    const primeiro = await receberEmail(db, agora, {
      autenticado: true,
      de: 'v@exemplo.com',
      assunto: 'Dúvida',
      texto: 'Primeira',
    })
    const segundo = await receberEmail(db, agora, {
      autenticado: true,
      de: 'v@exemplo.com',
      assunto: 'RES: Dúvida',
      texto: 'Segunda',
    })
    if (primeiro.resultado !== 'abriu') throw new Error('esperava abrir')
    expect(segundo).toEqual({
      resultado: 'continuou',
      conversaId: primeiro.conversaId,
    })
    expect(await db.select().from(conversaDeAtendimento)).toHaveLength(1)
  })

  it('corta o texto em 5.000 caracteres, ignora e-mail vazio e respeita 5 novas por hora', async () => {
    const { db } = await cenario()
    expect(
      await receberEmail(db, agora, {
        autenticado: true,
        de: 'a@exemplo.com',
        assunto: 'x',
        texto: '> só citação',
      }),
    ).toEqual({ resultado: 'vazio' })
    const longo = await receberEmail(db, agora, {
      autenticado: true,
      de: 'a@exemplo.com',
      assunto: 'longo',
      texto: 'b'.repeat(9000),
    })
    if (longo.resultado !== 'abriu') throw new Error('esperava abrir')
    const [m] = await db
      .select()
      .from(mensagemDeAtendimento)
      .where(eq(mensagemDeAtendimento.conversaId, longo.conversaId))
    expect(m?.texto).toHaveLength(5000)
    for (let i = 0; i < 4; i++) {
      await receberEmail(db, agora, {
        autenticado: true,
        de: 'a@exemplo.com',
        assunto: `assunto ${i}`,
        texto: 'oi',
      })
    }
    expect(
      await receberEmail(db, agora, {
        autenticado: true,
        de: 'a@exemplo.com',
        assunto: 'um a mais',
        texto: 'oi',
      }),
    ).toEqual({ resultado: 'limitado' })
  })

  it('guarda só anexos do dono e-mail', async () => {
    const { db } = await cenario()
    const boa = chaveDoAnexo('email', 'u1', 'foto.png')
    const r = await receberEmail(db, agora, {
      autenticado: true,
      de: 'a@exemplo.com',
      assunto: 'foto',
      texto: 'veja',
      anexos: [boa, chaveDoAnexo('ana', 'u2', 'x.png')],
    })
    if (r.resultado !== 'abriu') throw new Error('esperava abrir')
    expect(
      (await lerConversa(db, r.conversaId, equipe)).mensagens[0]?.anexos,
    ).toEqual([boa])
  })
})

describe('fila e listas', () => {
  it('a fila separa Abertas, Respondidas e Resolvidas, com contadores, e a conversa do aluno só aparece para ele', async () => {
    const { db } = await cenario()
    const a = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'A',
      texto: 'x',
    })
    avancar(1)
    const b = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'B',
      texto: 'x',
    })
    avancar(1)
    await abrirConversa(db, agora, { userId: 'bia', assunto: 'C', texto: 'x' })
    await responderComoEquipe(db, agora, {
      conversaId: a,
      equipeId: 'eq',
      texto: 'r',
    })
    await resolverConversa(db, agora, b)
    const abertas = await filaDaEquipe(db, 'aberta')
    expect(abertas.itens.map((i) => i.assunto)).toEqual(['C'])
    expect(await contarAbertas(db)).toBe(1)
    expect(abertas.contagens).toEqual({
      aberta: 1,
      respondida: 1,
      resolvida: 1,
    })
    expect((await filaDaEquipe(db, 'respondida')).itens[0]).toMatchObject({
      assunto: 'A',
      alunoNome: 'Ana Souza',
    })
  })

  it('a Abertas mostra a que espera há mais tempo primeiro', async () => {
    const { db } = await cenario()
    await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'Antiga',
      texto: 'x',
    })
    avancar(10)
    await abrirConversa(db, agora, {
      userId: 'bia',
      assunto: 'Nova',
      texto: 'x',
    })
    expect(
      (await filaDaEquipe(db, 'aberta')).itens.map((i) => i.assunto),
    ).toEqual(['Antiga', 'Nova'])
  })
})

describe('exclusão protegida', () => {
  it('a conversa excluída some das telas, a lista de exclusão a conhece e a limpeza leva depois de 30 dias', async () => {
    const { db } = await cenario()
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'x',
      texto: 'y',
    })
    await excluirConversa(db, agora, id)
    expect((await filaDaEquipe(db, 'aberta')).itens).toHaveLength(0)
    await expect(lerConversa(db, id, equipe)).rejects.toThrow(
      'Conversa não encontrada.',
    )
    expect(TABELAS_COM_EXCLUSAO.map((t) => t.nome)).toContain(
      'conversa_de_atendimento',
    )
    avancar(31 * 24 * 60)
    await limparExclusoesVencidas(db, agora, TABELAS_COM_EXCLUSAO)
    expect(await db.select().from(conversaDeAtendimento)).toHaveLength(0)
    expect(await db.select().from(mensagemDeAtendimento)).toHaveLength(0)
  })
})

describe('aviso à equipe (agrupado em 15 minutos, desligável)', () => {
  it('junta as mensagens de 15 minutos num aviso por pessoa da equipe', async () => {
    const { db } = await cenario()
    await abrirConversa(db, agora, { userId: 'ana', assunto: 'A', texto: 'x' })
    avancar(5)
    await receberEmail(db, agora, {
      autenticado: true,
      de: 'v@exemplo.com',
      assunto: 'B',
      texto: 'y',
    })
    const filtro = (c: string) => c === CHAVE_DO_AVISO
    expect(await coletarAvisosProntos(db, agora, undefined, filtro)).toEqual([])
    avancar(11)
    const grupos = await coletarAvisosProntos(db, agora, undefined, filtro)
    const avisos = await avisosParaEquipe(db, grupos)
    expect(avisos.map((a) => [a.userId, a.quantidade]).sort()).toEqual([
      ['dono', 2],
      ['eq', 2],
    ])
    // Já coletado: não sai em dobro.
    expect(await coletarAvisosProntos(db, agora, undefined, filtro)).toEqual([])
  })

  it('quem desligou o aviso não recebe; religar volta a receber', async () => {
    const { db } = await cenario()
    expect(await avisoDeAtendimentoLigado(db, 'eq')).toBe(true)
    await definirAvisoDeAtendimento(db, agora, 'eq', false)
    await definirAvisoDeAtendimento(db, agora, 'eq', false)
    expect(await avisoDeAtendimentoLigado(db, 'eq')).toBe(false)
    await abrirConversa(db, agora, { userId: 'ana', assunto: 'A', texto: 'x' })
    avancar(16)
    const grupos = await coletarAvisosProntos(db, agora)
    expect((await avisosParaEquipe(db, grupos)).map((a) => a.userId)).toEqual([
      'dono',
    ])
    await definirAvisoDeAtendimento(db, agora, 'eq', true)
    expect(await avisoDeAtendimentoLigado(db, 'eq')).toBe(true)
  })

  it('avisos de outros assuntos (comentários, certificado) ficam intocados na coleta do Atendimento', async () => {
    const { db } = await cenario()
    await abrirConversa(db, agora, { userId: 'ana', assunto: 'A', texto: 'x' })
    await db.insert(avisoAgrupado).values({
      id: 'c1',
      chave: 'resposta-ao-comentario:ana',
      dados: '{}',
      criadoEm: agora(),
    })
    avancar(16)
    await coletarAvisosProntos(
      db,
      agora,
      undefined,
      (c) => c === CHAVE_DO_AVISO,
    )
    const sobra = await db.select().from(avisoAgrupado)
    expect(sobra.map((s) => s.chave)).toEqual(['resposta-ao-comentario:ana'])
  })
})

describe('anexos', () => {
  it('aceita imagem JPG, PNG, WebP e GIF de até 10 MB', () => {
    expect(
      validarImagem({ tipo: 'image/png', tamanho: 10 * 1024 * 1024 }),
    ).toBeNull()
    expect(validarImagem({ tipo: 'image/webp', tamanho: 1 })).toBeNull()
    expect(
      validarImagem({ tipo: 'image/png', tamanho: 10 * 1024 * 1024 + 1 }),
    ).toBe('A imagem passa de 10 MB.')
    expect(validarImagem({ tipo: 'image/svg+xml', tamanho: 10 })).toMatch(
      'Envie uma imagem',
    )
    expect(validarImagem({ tipo: 'image/png', tamanho: 0 })).toBe(
      'O arquivo está vazio.',
    )
  })

  it('a chave leva o dono; anexoDoDono recusa de outro e caminho com ..', () => {
    const chave = chaveDoAnexo('ana', 'abc', 'Minha Foto é boa.PNG')
    expect(chave).toBe('atendimento/anexos/ana/abc/Minha-Foto-e-boa.PNG')
    expect(anexoDoDono(chave, 'ana')).toBe(true)
    expect(anexoDoDono(chave, 'bia')).toBe(false)
    expect(anexoDoDono('atendimento/anexos/ana/../bia/x.png', 'ana')).toBe(
      false,
    )
  })

  it('quem vê o anexo: equipe, quem enviou e o dono da conversa (não outro aluno)', async () => {
    const { db } = await cenario()
    const chave = chaveDoAnexo('eq', 'u1', 'resposta.png')
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'x',
      texto: 'y',
    })
    await responderComoEquipe(db, agora, {
      conversaId: id,
      equipeId: 'eq',
      texto: 'veja',
      anexos: [chave],
    })
    expect(await podeVerAnexo(db, chave, equipe)).toBe(true)
    expect(await podeVerAnexo(db, chave, aluna)).toBe(true)
    expect(await podeVerAnexo(db, chave, { id: 'bia', equipe: false })).toBe(
      false,
    )
    const dela = chaveDoAnexo('bia', 'u2', 'x.png')
    expect(await podeVerAnexo(db, dela, { id: 'bia', equipe: false })).toBe(
      true,
    )
    expect(await podeVerAnexo(db, dela, aluna)).toBe(false)
  })
})

describe('texto do e-mail', () => {
  it('extrai o código e normaliza o assunto', () => {
    expect(extrairCodigo('Re: Ajuda [Atendimento #k3f9qx]')).toBe('K3F9QX')
    expect(extrairCodigo('Sem código')).toBeNull()
    expect(
      normalizarAssunto('RE: Res: Fwd:  Ajuda   [Atendimento #K3F9QX] '),
    ).toBe('Ajuda')
  })

  it('corta a citação da resposta anterior', () => {
    expect(
      limparRespostaDeEmail(
        'Oi!\r\nTudo bem.\r\n\r\nOn Mon, Jun 1, 2026, Escola wrote:\r\n> citado',
      ),
    ).toBe('Oi!\nTudo bem.')
    expect(
      limparRespostaDeEmail(
        'Valeu\n\nEm seg., 1 de jun. de 2026 às 10:00,\nEscola <e@x> escreveu:\n> a',
      ),
    ).toBe('Valeu')
    expect(limparRespostaDeEmail('Uma linha\n> citação solta')).toBe(
      'Uma linha',
    )
    expect(limparRespostaDeEmail('> > só isso')).toBe('')
  })
})

describe('ajudas do e-mail', () => {
  it('põe a etiqueta do código no assunto uma vez só', () => {
    expect(assuntoComCodigo('Resposta: Ajuda', 'K3F9QX')).toBe(
      'Resposta: Ajuda [Atendimento #K3F9QX]',
    )
    expect(assuntoComCodigo('Ajuda [Atendimento #K3F9QX]', 'K3F9QX')).toBe(
      'Ajuda [Atendimento #K3F9QX]',
    )
  })

  it('reconhece resposta automática e lista', () => {
    const com = (h: Record<string, string>) => (n: string) => h[n]
    expect(
      ehRespostaAutomatica(com({ 'auto-submitted': 'auto-replied' })),
    ).toBe(true)
    expect(ehRespostaAutomatica(com({ precedence: 'bulk' }))).toBe(true)
    expect(ehRespostaAutomatica(com({ 'auto-submitted': 'no' }))).toBe(false)
    expect(ehRespostaAutomatica(com({}))).toBe(false)
  })

  it('tira as marcas do HTML e mantém as quebras de linha', () => {
    expect(
      htmlParaTexto(
        '<style>p{}</style><p>Oi &amp; tchau</p><p>Linha 2<br>Linha 3</p>',
      ),
    ).toBe('Oi & tchau\nLinha 2\nLinha 3')
  })
})

describe('chave de envio contra clique duplo', () => {
  it('abrir a conversa duas vezes com a mesma chave é uma conversa só', async () => {
    const { db } = await cenario()
    const entrada = {
      userId: 'ana',
      assunto: 'Não abre',
      texto: 'Tela preta.',
      chaveDeEnvio: 'chave-da-tela-1',
    }
    const a = await abrirConversa(db, agora, entrada)
    const b = await abrirConversa(db, agora, entrada)
    expect(b).toBe(a)
    expect(await db.select().from(conversaDeAtendimento)).toHaveLength(1)
    expect(await db.select().from(mensagemDeAtendimento)).toHaveLength(1)
    // Outra chave é outra conversa.
    const c = await abrirConversa(db, agora, {
      ...entrada,
      chaveDeEnvio: 'chave-da-tela-2',
    })
    expect(c).not.toBe(a)
  })

  it('responder como aluno duas vezes com a mesma chave grava uma mensagem e avisa a equipe uma vez', async () => {
    const { db } = await cenario()
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'Oi',
      texto: 'Oi',
    })
    const antes = (await db.select().from(avisoAgrupado)).length
    const entrada = {
      conversaId: id,
      userId: 'ana',
      texto: 'Mais um detalhe',
      chaveDeEnvio: 'chave-da-resposta',
    }
    await continuarComoAluno(db, agora, entrada)
    await continuarComoAluno(db, agora, entrada)
    expect(await db.select().from(mensagemDeAtendimento)).toHaveLength(2)
    const depois = (await db.select().from(avisoAgrupado)).length
    expect(depois - antes).toBe(1)
  })

  it('a resposta da equipe com a mesma chave não manda o e-mail duas vezes', async () => {
    const { db } = await cenario()
    const id = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'Oi',
      texto: 'Oi',
    })
    const aoResponderPelaEquipe = vi.fn(async () => undefined)
    const entrada = {
      conversaId: id,
      equipeId: 'eq',
      texto: 'Resolvido!',
      chaveDeEnvio: 'chave-da-equipe',
    }
    await responderComoEquipe(db, agora, entrada, { aoResponderPelaEquipe })
    const segunda = await responderComoEquipe(db, agora, entrada, {
      aoResponderPelaEquipe,
    })
    expect(aoResponderPelaEquipe).toHaveBeenCalledTimes(1)
    expect(segunda.conversaId).toBe(id)
    expect(await db.select().from(mensagemDeAtendimento)).toHaveLength(2)
  })

  it('a mesma chave de pessoas diferentes não se confunde', async () => {
    const { db } = await cenario()
    const a = await abrirConversa(db, agora, {
      userId: 'ana',
      assunto: 'Oi',
      texto: 'Oi',
      chaveDeEnvio: 'mesma-chave-1',
    })
    const b = await abrirConversa(db, agora, {
      userId: 'bia',
      assunto: 'Oi',
      texto: 'Oi',
      chaveDeEnvio: 'mesma-chave-1',
    })
    expect(b).not.toBe(a)
  })
})

describe('cursosParaConversa', () => {
  it('lista os cursos do aluno por nome; quem não tem curso recebe lista vazia', async () => {
    const { db, cursoId } = await cenario()
    expect(await cursosParaConversa(db, agora, 'ana')).toEqual([
      { id: cursoId, nome: 'Coloração' },
    ])
    expect(await cursosParaConversa(db, agora, 'bia')).toEqual([])
  })
})
