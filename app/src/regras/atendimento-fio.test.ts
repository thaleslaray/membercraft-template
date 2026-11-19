import { describe, expect, it } from 'vitest'
import { user } from '#/db/schema'
import {
  abrirConversa,
  assuntoDoComeco,
  excluirConversa,
  fioDoAluno,
  lerConversa,
  mandarNoFio,
  receberEmail,
  resolverConversa,
  responderComoEquipe,
} from '#/regras/atendimento'
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
    {
      id: 'eq',
      name: 'Carla',
      email: 'eq@x.test',
      perfil: 'equipe',
      image: '/api/imagens/carla',
    },
  ])
  return db
}

const aluna = { id: 'ana', equipe: false }

describe('assuntoDoComeco', () => {
  it('usa a mensagem inteira quando cabe', () => {
    expect(assuntoDoComeco('  Não abre a aula  ')).toBe('Não abre a aula')
  })

  it('corta em até 60 caracteres, na palavra, com reticências', () => {
    const texto =
      'Estou tentando abrir a segunda aula do módulo de coloração e aparece tela preta sempre'
    expect(assuntoDoComeco(texto)).toBe(
      'Estou tentando abrir a segunda aula do módulo de coloração e…',
    )
  })

  it('usa só a primeira linha', () => {
    expect(assuntoDoComeco('Oi\nDuas linhas')).toBe('Oi')
  })

  it('sem texto (só imagem) dá um assunto fixo', () => {
    expect(assuntoDoComeco('   ')).toBe('Imagem')
  })

  it('palavra sem espaço maior que o limite é cortada no limite', () => {
    expect(assuntoDoComeco('a'.repeat(100))).toBe(`${'a'.repeat(60)}…`)
  })
})

describe('mandarNoFio', () => {
  it('sem nenhuma conversa, abre uma nova com o assunto tirado da mensagem', async () => {
    const db = await cenario()
    const r = await mandarNoFio(db, agora, {
      userId: 'ana',
      texto: 'Não consigo entrar.',
    })
    expect(r.novaConversa).toBe(true)
    expect(await lerConversa(db, r.conversaId, aluna)).toMatchObject({
      assunto: 'Não consigo entrar.',
      estado: 'aberta',
    })
  })

  it('com a última conversa Aberta, continua essa conversa', async () => {
    const db = await cenario()
    const primeira = await mandarNoFio(db, agora, {
      userId: 'ana',
      texto: 'Primeira',
    })
    avancar(5)
    const segunda = await mandarNoFio(db, agora, {
      userId: 'ana',
      texto: 'Segunda',
    })
    expect(segunda).toEqual({
      conversaId: primeira.conversaId,
      novaConversa: false,
    })
  })

  it('com a última conversa Respondida, continua essa conversa e ela volta a Aberta', async () => {
    const db = await cenario()
    const { conversaId } = await mandarNoFio(db, agora, {
      userId: 'ana',
      texto: 'Preciso de ajuda',
    })
    avancar(5)
    await responderComoEquipe(
      db,
      agora,
      { equipeId: 'eq', conversaId, texto: 'Já resolvo' },
      {},
    )
    avancar(5)
    const r = await mandarNoFio(db, agora, {
      userId: 'ana',
      texto: 'Obrigada',
    })
    expect(r.conversaId).toBe(conversaId)
    expect((await lerConversa(db, conversaId, aluna)).estado).toBe('aberta')
  })

  it('com a última conversa Resolvida, abre uma conversa nova e a antiga continua Resolvida', async () => {
    const db = await cenario()
    const { conversaId } = await mandarNoFio(db, agora, {
      userId: 'ana',
      texto: 'Primeira dúvida',
    })
    avancar(5)
    await resolverConversa(db, agora, conversaId)
    avancar(5)
    const r = await mandarNoFio(db, agora, {
      userId: 'ana',
      texto: 'Outra dúvida sobre o certificado',
    })
    expect(r.novaConversa).toBe(true)
    expect(r.conversaId).not.toBe(conversaId)
    expect((await lerConversa(db, conversaId, aluna)).estado).toBe('resolvida')
    expect((await lerConversa(db, r.conversaId, aluna)).assunto).toBe(
      'Outra dúvida sobre o certificado',
    )
  })

  it('só olha as conversas da própria aluna', async () => {
    const db = await cenario()
    await mandarNoFio(db, agora, { userId: 'bia', texto: 'Da Bia' })
    const r = await mandarNoFio(db, agora, { userId: 'ana', texto: 'Da Ana' })
    expect(r.novaConversa).toBe(true)
  })

  it('o mesmo envio repetido (clique duplo) é a mesma mensagem', async () => {
    const db = await cenario()
    const entrada = {
      userId: 'ana',
      texto: 'Uma vez só',
      chaveDeEnvio: 'chave-do-envio-1',
    }
    const a = await mandarNoFio(db, agora, entrada)
    const b = await mandarNoFio(db, agora, entrada)
    expect(b.conversaId).toBe(a.conversaId)
    expect(await fioDoAluno(db, 'ana')).toHaveLength(1)
  })

  it('a resposta por e-mail (com o código) continua reabrindo a conversa Resolvida', async () => {
    const db = await cenario()
    const { conversaId } = await mandarNoFio(db, agora, {
      userId: 'ana',
      texto: 'Dúvida',
    })
    const { codigo } = await lerConversa(db, conversaId, aluna)
    avancar(5)
    await resolverConversa(db, agora, conversaId)
    avancar(5)
    await receberEmail(db, agora, {
      autenticado: true,
      de: 'ana@x.test',
      assunto: `Re: Dúvida [Atendimento #${codigo}]`,
      texto: 'Ainda não deu certo.',
    })
    expect((await lerConversa(db, conversaId, aluna)).estado).toBe('aberta')
  })
})

describe('fioDoAluno', () => {
  it('junta as mensagens de todas as conversas, em ordem, com foto e nome de quem escreveu', async () => {
    const db = await cenario()
    const a = await mandarNoFio(db, agora, { userId: 'ana', texto: 'Um' })
    avancar(1)
    await responderComoEquipe(
      db,
      agora,
      { equipeId: 'eq', conversaId: a.conversaId, texto: 'Dois' },
      {},
    )
    avancar(1)
    await resolverConversa(db, agora, a.conversaId)
    avancar(1)
    await mandarNoFio(db, agora, { userId: 'ana', texto: 'Três' })
    // Outra aluna não aparece no fio da Ana.
    await abrirConversa(db, agora, {
      userId: 'bia',
      assunto: 'Da Bia',
      texto: 'Quatro',
    })

    const fio = await fioDoAluno(db, 'ana')
    expect(fio.map((m) => m.texto)).toEqual(['Um', 'Dois', 'Três'])
    expect(fio[1]).toMatchObject({
      autor: 'equipe',
      autorNome: 'Carla',
      autorImagem: '/api/imagens/carla',
    })
    expect(fio[0]).toMatchObject({ autor: 'aluno', autorNome: 'Ana Souza' })
    expect(new Set(fio.map((m) => m.conversaId)).size).toBe(2)
  })

  it('sem conversa nenhuma, o fio é vazio', async () => {
    const db = await cenario()
    expect(await fioDoAluno(db, 'ana')).toEqual([])
  })

  it('não traz conversa excluída', async () => {
    const db = await cenario()
    const { conversaId } = await mandarNoFio(db, agora, {
      userId: 'ana',
      texto: 'Some',
    })
    await excluirConversa(db, agora, conversaId)
    expect(await fioDoAluno(db, 'ana')).toEqual([])
  })
})
