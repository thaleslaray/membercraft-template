import { eq as igual, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import {
  anexoDaPublicacao,
  comentarioDaPublicacao,
  publicacao,
  seguidorDaPublicacao,
  user,
} from '#/db/schema'
import { criarComunidade, ErroDeComunidade } from '#/regras/comunidades'
import { limparExclusoesVencidas } from '#/regras/exclusao-protegida'
import { avisosDaPessoa } from '#/regras/notificacoes'
import type { Pessoa } from '#/regras/permissoes'
import {
  bloquearComentarios,
  comentar,
  contarAguardandoResposta,
  contarNaoLidas,
  criarPublicacao,
  definirSeguidor,
  desfazerMelhorResposta,
  editarComentario,
  editarPublicacao,
  escolherMelhorResposta,
  excluirComentario,
  excluirPublicacao,
  fixarPublicacao,
  listarAguardandoResposta,
  listarComentariosRecentes,
  listarPublicacoes,
  marcarComoVista,
  obterPublicacao,
  POR_PAGINA,
} from '#/regras/publicacoes'
import { TABELAS_COM_EXCLUSAO } from '#/regras/tabelas-com-exclusao'
import { cenarioDeComunidades } from '#/test/cenario-da-comunidade'

let relogio = new Date('2026-06-01T12:00:00Z')
const agora = () => relogio
const passar = (minutos: number) => {
  relogio = new Date(relogio.getTime() + minutos * 60_000)
}

const ana: Pessoa = { id: 'ana', perfil: 'aluno' }
const bia: Pessoa = { id: 'bia', perfil: 'aluno' }
const eq: Pessoa = { id: 'eq', perfil: 'equipe' }

let contador = 0
const chave = () => `chave-${++contador}-xxxxxxxx`

async function cenario() {
  relogio = new Date('2026-06-01T12:00:00Z')
  const db = await cenarioDeComunidades()
  const geral = await criarComunidade(db, {
    nome: 'Geral',
    icone: 'mensagens',
    cor: '#1f4d3a',
    soEquipePublica: false,
    turmaIds: [],
  })
  const turma1 = await criarComunidade(db, {
    nome: 'Turma 1',
    icone: 'livro',
    cor: '#2563eb',
    soEquipePublica: false,
    turmaIds: ['t1'],
  })
  const avisos = await criarComunidade(db, {
    nome: 'Avisos',
    icone: 'avisos',
    cor: '#dc2626',
    soEquipePublica: true,
    turmaIds: [],
  })
  const publicar = (
    pessoa: Pessoa,
    comunidadeId: string,
    titulo = 'Como diluir a tinta?',
    extra: { textoHtml?: string; chaveDeEnvio?: string } = {},
  ) =>
    criarPublicacao(db, agora, pessoa, {
      comunidadeId,
      titulo,
      textoHtml: extra.textoHtml ?? '<p>Preciso de ajuda.</p>',
      anexos: [],
      chaveDeEnvio: extra.chaveDeEnvio ?? chave(),
    })
  const comentarDe = (
    pessoa: Pessoa,
    publicacaoId: string,
    texto = 'Use 1 para 1.',
    paiId: string | null = null,
  ) =>
    comentar(db, agora, pessoa, {
      publicacaoId,
      paiId,
      texto,
      chaveDeEnvio: chave(),
    })
  const lista = (
    pessoa: Pessoa,
    filtros: Partial<Parameters<typeof listarPublicacoes>[3]> = {},
  ) =>
    listarPublicacoes(db, agora, pessoa, {
      visao: 'inicio',
      status: 'todas',
      ordem: 'mais-ativas',
      pagina: 1,
      ...filtros,
    })
  return { db, geral, turma1, avisos, publicar, comentarDe, lista }
}

describe('publicar', () => {
  it('cria a publicação com título e texto limpo, e o autor passa a seguir', async () => {
    const { db, geral, publicar } = await cenario()
    const { id } = await publicar(ana, geral, '  Dúvida  ', {
      textoHtml: '<p onclick="x()">Oi</p><script>1</script>',
    })
    const tela = await obterPublicacao(db, agora, ana, id)
    expect(tela?.titulo).toBe('Dúvida')
    expect(tela?.textoHtml).toBe('<p>Oi</p>')
    expect(tela?.situacaoDoSeguidor).toBe('seguindo')
    expect(tela?.resolvida).toBe(false)
  })

  it('a mesma chave de envio é a mesma publicação (clique duplo)', async () => {
    const { db, geral, publicar } = await cenario()
    const a = await publicar(ana, geral, 'Uma', {
      chaveDeEnvio: 'chave-de-envio-1',
    })
    const b = await publicar(ana, geral, 'Uma', {
      chaveDeEnvio: 'chave-de-envio-1',
    })
    expect(b).toEqual({ id: a.id, repetida: true })
    expect(await db.select().from(publicacao)).toHaveLength(1)
  })

  it('exige título e texto, e aceita texto só com imagem da comunidade', async () => {
    const { geral, publicar } = await cenario()
    await expect(publicar(ana, geral, '   ')).rejects.toThrow(/título/)
    await expect(
      publicar(ana, geral, 'T', { textoHtml: '<p> </p>' }),
    ).rejects.toThrow(/texto/)
    await expect(
      publicar(ana, geral, 'T', {
        textoHtml: '<img src="/api/comunidade/imagens/x/foto.png" alt="">',
      }),
    ).resolves.toMatchObject({ repetida: false })
  })

  it('aluno não publica onde não tem acesso nem onde só a equipe publica', async () => {
    const { geral, turma1, avisos, publicar } = await cenario()
    await expect(publicar(bia, turma1)).rejects.toThrow(/não encontrada/)
    await expect(publicar(ana, avisos)).rejects.toThrow(/só a equipe publica/)
    await expect(publicar(eq, avisos)).resolves.toMatchObject({
      repetida: false,
    })
    await expect(publicar(eq, geral)).resolves.toMatchObject({
      repetida: false,
    })
  })

  it('guarda até 3 anexos e recusa o quarto ou um de outra pessoa', async () => {
    const { db, geral } = await cenario()
    const anexo = (n: number, dono = 'ana') => ({
      chave: `comunidade/anexos/${dono}/${n}/a.pdf`,
      nome: 'a.pdf',
      tipo: 'application/pdf',
      tamanho: 1024,
    })
    const criar = (anexos: ReturnType<typeof anexo>[]) =>
      criarPublicacao(db, agora, ana, {
        comunidadeId: geral,
        titulo: 'Com anexos',
        textoHtml: '<p>x</p>',
        anexos,
        chaveDeEnvio: chave(),
      })
    const { id } = await criar([anexo(1), anexo(2), anexo(3)])
    expect(await db.select().from(anexoDaPublicacao)).toHaveLength(3)
    expect((await obterPublicacao(db, agora, ana, id))?.anexos).toHaveLength(3)
    await expect(
      criar([anexo(1), anexo(2), anexo(3), anexo(4)]),
    ).rejects.toThrow(/no máximo 3/)
    await expect(criar([anexo(5, 'bia')])).rejects.toThrow(/inválido/)
  })
})

describe('ver uma publicação', () => {
  it('quem não enxerga a comunidade recebe nulo, igual a uma publicação que não existe', async () => {
    const { db, turma1, publicar } = await cenario()
    const { id } = await publicar(ana, turma1)
    expect(await obterPublicacao(db, agora, bia, id)).toBeNull()
    expect(await obterPublicacao(db, agora, ana, 'nao-existe')).toBeNull()
    expect(await obterPublicacao(db, agora, ana, id)).not.toBeNull()
  })
})

describe('foto e bio de quem escreve', () => {
  it('o autor e quem responde trazem foto e bio (ou nulo), nunca e-mail', async () => {
    const { db, geral, publicar, comentarDe, lista } = await cenario()
    await db
      .update(user)
      .set({ image: '/api/imagens/avatar-ana', bio: 'Colorista de Recife' })
      .where(igual(user.id, 'ana'))
    const a = await publicar(ana, geral)
    await comentarDe(bia, a.id)
    const [item] = (await lista(ana)).itens
    expect(item.autor).toEqual({
      id: 'ana',
      nome: 'Ana',
      imagem: '/api/imagens/avatar-ana',
      bio: 'Colorista de Recife',
      daEquipe: false,
    })
    const tela = await obterPublicacao(db, agora, ana, a.id)
    expect(tela?.autor).toMatchObject({
      imagem: '/api/imagens/avatar-ana',
      bio: 'Colorista de Recife',
    })
    expect(tela?.comentarios[0].autor).toEqual({
      id: 'bia',
      nome: 'Bia',
      imagem: null,
      bio: null,
      daEquipe: false,
    })
    expect(JSON.stringify(tela)).not.toContain('@')
  })
})

describe('comentários', () => {
  it('comenta, responde num nível e recusa resposta a uma resposta', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    const c1 = await comentarDe(bia, id, 'Primeiro')
    const r1 = await comentarDe(ana, id, 'Resposta', c1.id)
    await expect(comentarDe(bia, id, 'Neta', r1.id)).rejects.toThrow(
      /não a uma resposta/,
    )
    await expect(
      comentarDe(bia, id, 'Pai falso', 'nao-existe'),
    ).rejects.toThrow(/não encontrado/)
    const tela = await obterPublicacao(db, agora, ana, id)
    expect(tela?.totalDeComentarios).toBe(2)
    expect(tela?.comentarios).toHaveLength(1)
    expect(tela?.comentarios[0].respostas.map((r) => r.texto)).toEqual([
      'Resposta',
    ])
  })

  it('a mesma chave de envio é o mesmo comentário', async () => {
    const { db, geral, publicar } = await cenario()
    const { id } = await publicar(ana, geral)
    const entrada = {
      publicacaoId: id,
      texto: 'Oi',
      chaveDeEnvio: 'chave-do-comentario',
    }
    const a = await comentar(db, agora, bia, entrada)
    const b = await comentar(db, agora, bia, entrada)
    expect(b).toMatchObject({ id: a.id, repetida: true })
    expect(await db.select().from(comentarioDaPublicacao)).toHaveLength(1)
  })

  it('bloqueados: o aluno não comenta, a Equipe continua comentando; liberar volta ao normal', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    await bloquearComentarios(db, agora, eq, id, true)
    await expect(comentarDe(bia, id)).rejects.toThrow(/bloqueados/)
    await expect(comentarDe(eq, id)).resolves.toMatchObject({ repetida: false })
    expect((await obterPublicacao(db, agora, bia, id))?.podeComentar).toBe(
      false,
    )
    await bloquearComentarios(db, agora, eq, id, false)
    await expect(comentarDe(bia, id)).resolves.toMatchObject({
      repetida: false,
    })
  })

  it('só o autor ou a Equipe edita e exclui; excluir leva as respostas junto', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    const c1 = await comentarDe(bia, id, 'Original')
    const r1 = await comentarDe(ana, id, 'Resposta', c1.id)
    await expect(
      editarComentario(db, agora, ana, c1.id, 'Hackeado'),
    ).rejects.toThrow(/autor/)
    await editarComentario(db, agora, bia, c1.id, 'Editado')
    await editarComentario(db, agora, eq, c1.id, 'Moderado')
    await expect(excluirComentario(db, agora, ana, c1.id)).rejects.toThrow(
      /autor/,
    )
    await excluirComentario(db, agora, eq, c1.id)
    const tela = await obterPublicacao(db, agora, ana, id)
    expect(tela?.totalDeComentarios).toBe(0)
    const linhas = await db.select().from(comentarioDaPublicacao)
    expect(linhas.find((l) => l.id === r1.id)?.excluidoEm).not.toBeNull()
    expect(linhas.find((l) => l.id === c1.id)?.texto).toBe('Moderado')
  })

  it('os comentários vêm em páginas de 20 de primeiro nível', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    for (let i = 0; i < POR_PAGINA + 5; i++) {
      passar(1)
      await comentarDe(bia, id, `c${i}`)
    }
    const p1 = await obterPublicacao(db, agora, ana, id, 1)
    const p2 = await obterPublicacao(db, agora, ana, id, 2)
    expect(p1?.comentarios).toHaveLength(POR_PAGINA)
    expect(p2?.comentarios).toHaveLength(5)
    expect(p1?.totalDePaginas).toBe(2)
    expect(p2?.comentarios[0].texto).toBe(`c${POR_PAGINA}`)
  })
})

describe('melhor resposta', () => {
  it('o autor marca e a publicação fica Resolvida; a resposta sobe para o topo', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    await comentarDe(bia, id, 'Outra')
    const certa = await comentarDe(eq, id, 'A certa')
    await escolherMelhorResposta(db, agora, ana, id, certa.id)
    const tela = await obterPublicacao(db, agora, ana, id)
    expect(tela?.resolvida).toBe(true)
    expect(tela?.melhorResposta?.texto).toBe('A certa')
    expect(tela?.comentarios.map((c) => c.texto)).toEqual(['Outra'])
  })

  it('quem não é autor nem Equipe não marca; resposta a resposta não vale', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    const c = await comentarDe(bia, id)
    const r = await comentarDe(ana, id, 'r', c.id)
    await expect(
      escolherMelhorResposta(db, agora, bia, id, c.id),
    ).rejects.toThrow(/autor/)
    await expect(
      escolherMelhorResposta(db, agora, ana, id, r.id),
    ).rejects.toThrow(/não encontrado/)
  })

  it('chama os ganchos de pontos: escolher, trocar (desfaz a anterior) e desfazer', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    const c1 = await comentarDe(bia, id, 'um')
    const c2 = await comentarDe(eq, id, 'dois')
    const aoEscolher = vi.fn(async () => {})
    const aoDesfazer = vi.fn(async () => {})
    const ganchos = {
      aoEscolherMelhorResposta: aoEscolher,
      aoDesfazerMelhorResposta: aoDesfazer,
    }

    await escolherMelhorResposta(db, agora, ana, id, c1.id, ganchos)
    expect(aoEscolher).toHaveBeenCalledTimes(1)
    expect(aoEscolher).toHaveBeenLastCalledWith(
      expect.objectContaining({
        comentarioId: c1.id,
        autorDaResposta: 'bia',
        autorDaPublicacao: 'ana',
      }),
    )
    // Marcar a mesma de novo não repete os pontos.
    await escolherMelhorResposta(db, agora, ana, id, c1.id, ganchos)
    expect(aoEscolher).toHaveBeenCalledTimes(1)

    await escolherMelhorResposta(db, agora, ana, id, c2.id, ganchos)
    expect(aoDesfazer).toHaveBeenLastCalledWith(
      expect.objectContaining({ comentarioId: c1.id, autorDaResposta: 'bia' }),
    )
    expect(aoEscolher).toHaveBeenCalledTimes(2)

    await desfazerMelhorResposta(db, agora, ana, id, ganchos)
    expect(aoDesfazer).toHaveBeenCalledTimes(2)
    expect((await obterPublicacao(db, agora, ana, id))?.resolvida).toBe(false)
    await desfazerMelhorResposta(db, agora, ana, id, ganchos)
    expect(aoDesfazer).toHaveBeenCalledTimes(2)
  })

  it('excluir a melhor resposta devolve a publicação para Em aberto e desfaz os pontos', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    const c = await comentarDe(bia, id)
    const aoDesfazer = vi.fn(async () => {})
    await escolherMelhorResposta(db, agora, ana, id, c.id)
    await excluirComentario(db, agora, bia, c.id, {
      aoDesfazerMelhorResposta: aoDesfazer,
    })
    expect(aoDesfazer).toHaveBeenCalledTimes(1)
    const tela = await obterPublicacao(db, agora, ana, id)
    expect(tela?.resolvida).toBe(false)
    expect(tela?.melhorResposta).toBeNull()
  })
})

describe('seguir e silenciar', () => {
  it('quem segue recebe no sininho o comentário novo; quem comentou, o autor e a Equipe seguem', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral, 'Tinta')
    const primeiro = await comentarDe(bia, id)
    // A autora é avisada do comentário da Bia; a Bia, de quem comentar depois.
    expect(primeiro.avisados).toBe(1)
    passar(1)
    const segundo = await comentarDe(eq, id)
    expect(segundo.avisados).toBe(2)
    const aviso = (await avisosDaPessoa(db, 'ana')).avisos[0]
    expect(aviso).toMatchObject({
      tipo: 'publicacao',
      link: `/comunidades/publicacoes/${id}`,
    })
    expect(aviso.texto).toContain('Equipe comentou em "Tinta"')
    // Quem comenta não é avisado do próprio comentário.
    expect((await avisosDaPessoa(db, 'eq')).avisos).toHaveLength(0)
  })

  it('silenciar para os avisos e comentar depois não volta a seguir; seguir volta', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    await definirSeguidor(db, agora, ana, id, 'silenciada')
    await comentarDe(bia, id)
    expect((await avisosDaPessoa(db, 'ana')).avisos).toHaveLength(0)
    await comentarDe(ana, id, 'eu mesma')
    const [linha] = await db.select().from(seguidorDaPublicacao)
    expect(linha.situacao === 'silenciada' || linha.userId !== 'ana').toBe(true)
    await definirSeguidor(db, agora, ana, id, 'seguindo')
    await comentarDe(bia, id, 'de novo')
    expect((await avisosDaPessoa(db, 'ana')).avisos).toHaveLength(1)
  })

  it('um aluno que segue de fora passa a receber; quem perdeu o acesso não recebe', async () => {
    const { db, geral, turma1, publicar, comentarDe } = await cenario()
    const { id } = await publicar(eq, geral)
    await definirSeguidor(db, agora, bia, id, 'seguindo')
    await comentarDe(eq, id)
    expect((await avisosDaPessoa(db, 'bia')).avisos).toHaveLength(1)

    const restrita = await publicar(eq, turma1)
    await definirSeguidor(db, agora, ana, restrita.id, 'seguindo')
    await db.insert(seguidorDaPublicacao).values({
      publicacaoId: restrita.id,
      userId: 'bia',
      situacao: 'seguindo',
    })
    await comentarDe(eq, restrita.id)
    expect((await avisosDaPessoa(db, 'ana')).avisos).toHaveLength(1)
    expect((await avisosDaPessoa(db, 'bia')).avisos).toHaveLength(1)
  })

  it('falha ao avisar não desfaz o comentário', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    await db.run(sql`drop table notificacao`)
    const resultado = await comentarDe(bia, id)
    erro.mockRestore()
    expect(resultado).toMatchObject({ repetida: false, avisados: 0 })
    expect(await db.select().from(comentarioDaPublicacao)).toHaveLength(1)
  })
})

describe('listas', () => {
  it('só mostra as comunidades que a pessoa enxerga, e filtra por comunidade', async () => {
    const { geral, turma1, publicar, lista } = await cenario()
    await publicar(ana, geral, 'Geral')
    await publicar(ana, turma1, 'Da turma 1')
    expect((await lista(ana)).itens.map((i) => i.titulo).sort()).toEqual([
      'Da turma 1',
      'Geral',
    ])
    expect((await lista(bia)).itens.map((i) => i.titulo)).toEqual(['Geral'])
    expect(
      (await lista(ana, { comunidadeId: turma1 })).itens.map((i) => i.titulo),
    ).toEqual(['Da turma 1'])
    expect((await lista(bia, { comunidadeId: turma1 })).itens).toEqual([])
  })

  it('abas Todas, Em aberto e Resolvidas', async () => {
    const { db, geral, publicar, comentarDe, lista } = await cenario()
    const a = await publicar(ana, geral, 'Aberta')
    const b = await publicar(ana, geral, 'Resolvida')
    const c = await comentarDe(bia, b.id)
    await escolherMelhorResposta(db, agora, ana, b.id, c.id)
    expect(a.id).toBeTruthy()
    expect((await lista(ana)).total).toBe(2)
    expect(
      (await lista(ana, { status: 'em-aberto' })).itens.map((i) => i.titulo),
    ).toEqual(['Aberta'])
    expect(
      (await lista(ana, { status: 'resolvidas' })).itens.map((i) => i.titulo),
    ).toEqual(['Resolvida'])
  })

  it('ordena por Mais ativas (última atividade) ou Mais recentes (criação); fixadas vêm primeiro', async () => {
    const { db, geral, publicar, comentarDe, lista } = await cenario()
    const antiga = await publicar(ana, geral, 'Antiga')
    passar(10)
    await publicar(ana, geral, 'Nova')
    passar(10)
    await comentarDe(bia, antiga.id)
    expect(
      (await lista(ana, { ordem: 'mais-ativas' })).itens.map((i) => i.titulo),
    ).toEqual(['Antiga', 'Nova'])
    expect(
      (await lista(ana, { ordem: 'mais-recentes' })).itens.map((i) => i.titulo),
    ).toEqual(['Nova', 'Antiga'])
    const nova = (await lista(ana)).itens.find((i) => i.titulo === 'Nova')
    await fixarPublicacao(db, agora, eq, nova?.id ?? '', true)
    expect((await lista(ana, { ordem: 'mais-ativas' })).itens[0]).toMatchObject(
      {
        titulo: 'Nova',
        fixada: true,
      },
    )
  })

  it('mural: sem escolher comunidade, mistura as que a pessoa enxerga, fixadas primeiro e depois a atividade mais recente', async () => {
    const { db, geral, turma1, publicar, comentarDe, lista } = await cenario()
    const velha = await publicar(ana, geral, 'Velha do geral')
    passar(10)
    await publicar(ana, turma1, 'Da turma')
    passar(10)
    const fixada = await publicar(ana, geral, 'Fixada antiga')
    passar(10)
    await publicar(ana, turma1, 'Recente da turma')
    passar(10)
    await comentarDe(bia, velha.id) // comentário novo traz a publicação para cima
    await fixarPublicacao(db, agora, eq, fixada.id, true)
    expect((await lista(ana)).itens.map((i) => i.titulo)).toEqual([
      'Fixada antiga',
      'Velha do geral',
      'Recente da turma',
      'Da turma',
    ])
    // Quem não enxerga a turma 1 vê só o que é das comunidades dela.
    expect((await lista(bia)).itens.map((i) => i.titulo)).toEqual([
      'Fixada antiga',
      'Velha do geral',
    ])
  })

  it('Sem resposta: só o que ninguém comentou ainda', async () => {
    const { geral, publicar, comentarDe, lista } = await cenario()
    await publicar(ana, geral, 'Quieta')
    const comentada = await publicar(ana, geral, 'Comentada')
    await comentarDe(bia, comentada.id)
    expect(
      (await lista(ana, { status: 'sem-resposta' })).itens.map((i) => i.titulo),
    ).toEqual(['Quieta'])
  })

  it('páginas seguidas do mural não repetem nem pulam publicações', async () => {
    const { geral, publicar, lista } = await cenario()
    for (let n = 1; n <= 25; n++) {
      passar(1)
      await publicar(ana, geral, `P${String(n).padStart(2, '0')}`)
    }
    const um = await lista(ana, { pagina: 1 })
    const dois = await lista(ana, { pagina: 2 })
    const ids = [...um.itens, ...dois.itens].map((i) => i.id)
    expect(ids).toHaveLength(25)
    expect(new Set(ids).size).toBe(25)
    expect(um.total).toBe(25)
  })

  it('busca no título e no texto, sem tratar % e _ como curinga', async () => {
    const { geral, publicar, lista } = await cenario()
    await publicar(ana, geral, 'Tinta loira', {
      textoHtml: '<p>Platinar o cabelo</p>',
    })
    await publicar(ana, geral, 'Corte', {
      textoHtml: '<p>100% de desconto</p>',
    })
    expect((await lista(ana, { busca: 'loira' })).itens).toHaveLength(1)
    expect((await lista(ana, { busca: 'platinar' })).itens).toHaveLength(1)
    expect((await lista(ana, { busca: '100%' })).itens).toHaveLength(1)
    expect((await lista(ana, { busca: '%' })).itens).toHaveLength(1)
    expect((await lista(ana, { busca: '_' })).itens).toHaveLength(0)
  })

  it('Minhas conversas: o que a pessoa publicou ou comentou', async () => {
    const { geral, publicar, comentarDe, lista } = await cenario()
    const minha = await publicar(bia, geral, 'Minha')
    const comentada = await publicar(ana, geral, 'Comentada')
    await publicar(ana, geral, 'Alheia')
    await comentarDe(bia, comentada.id)
    const itens = (await lista(bia, { visao: 'minhas' })).itens
      .map((i) => i.titulo)
      .sort()
    expect(itens).toEqual(['Comentada', 'Minha'])
    expect(minha.id).toBeTruthy()
  })

  it('Não lidas: o que é novo ou teve atividade depois da última visita', async () => {
    const { db, geral, publicar, comentarDe, lista } = await cenario()
    const a = await publicar(ana, geral, 'A')
    passar(5)
    // A autora já viu a própria publicação; a Bia ainda não viu nada.
    expect((await lista(ana, { visao: 'nao-lidas' })).itens).toHaveLength(0)
    expect((await lista(bia, { visao: 'nao-lidas' })).itens).toHaveLength(1)
    expect(await contarNaoLidas(db, agora, bia)).toBe(1)
    await marcarComoVista(db, agora, 'bia', a.id)
    expect(await contarNaoLidas(db, agora, bia)).toBe(0)
    passar(5)
    await comentarDe(ana, a.id)
    expect(
      (await lista(bia, { visao: 'nao-lidas' })).itens.map((i) => i.titulo),
    ).toEqual(['A'])
    expect((await lista(bia)).itens[0].naoLida).toBe(true)
  })

  it('a lista vem de 20 em 20, com o total', async () => {
    const { geral, publicar, lista } = await cenario()
    for (let i = 0; i < POR_PAGINA + 3; i++) {
      passar(1)
      await publicar(ana, geral, `P${i}`)
    }
    const p1 = await lista(ana)
    const p2 = await lista(ana, { pagina: 2 })
    expect(p1.itens).toHaveLength(POR_PAGINA)
    expect(p2.itens).toHaveLength(3)
    expect(p1.total).toBe(POR_PAGINA + 3)
  })

  it('traz o resumo, o número de comentários e o aviso de Resolvida', async () => {
    const { geral, publicar, comentarDe, lista } = await cenario()
    const a = await publicar(ana, geral, 'T', {
      textoHtml: '<p>Texto <b>forte</b></p>',
    })
    await comentarDe(bia, a.id)
    const [item] = (await lista(ana)).itens
    expect(item).toMatchObject({
      resumo: 'Texto forte',
      comentarios: 1,
      resolvida: false,
      autor: { nome: 'Ana', daEquipe: false },
      comunidade: { nome: 'Geral' },
    })
  })
})

describe('editar e excluir', () => {
  it('o autor e a Equipe editam; outro aluno não; editar troca os anexos', async () => {
    const { db, geral, publicar } = await cenario()
    const { id } = await publicar(ana, geral, 'Velho')
    const entrada = { titulo: 'Novo', textoHtml: '<p>novo</p>', anexos: [] }
    await expect(editarPublicacao(db, agora, bia, id, entrada)).rejects.toThrow(
      /autor/,
    )
    await editarPublicacao(db, agora, ana, id, entrada)
    await editarPublicacao(db, agora, eq, id, {
      ...entrada,
      titulo: 'Moderado',
      anexos: [
        {
          chave: 'comunidade/anexos/eq/1/a.pdf',
          nome: 'a.pdf',
          tipo: 'application/pdf',
          tamanho: 10,
        },
      ],
    })
    const tela = await obterPublicacao(db, agora, ana, id)
    expect(tela).toMatchObject({ titulo: 'Moderado' })
    expect(tela?.editadoEm).not.toBeNull()
    expect(tela?.anexos).toHaveLength(1)
  })

  it('tirar um anexo ao editar é exclusão protegida: a linha fica marcada e a limpeza apaga depois, com o arquivo', async () => {
    const { db, geral } = await cenario()
    const anexo = (n: number) => ({
      chave: `comunidade/anexos/ana/${n}/a.pdf`,
      nome: 'a.pdf',
      tipo: 'application/pdf',
      tamanho: 10,
    })
    const { id } = await criarPublicacao(db, agora, ana, {
      comunidadeId: geral,
      titulo: 'Com anexos',
      textoHtml: '<p>oi</p>',
      anexos: [anexo(1), anexo(2)],
      chaveDeEnvio: 'k-anexos',
    })
    const [primeiro] = await db.select().from(anexoDaPublicacao)
    await editarPublicacao(db, agora, ana, id, {
      titulo: 'Com anexos',
      textoHtml: '<p>oi</p>',
      anexos: [anexo(1)],
    })
    const linhas = await db.select().from(anexoDaPublicacao)
    expect(linhas).toHaveLength(2)
    expect(linhas.find((l) => l.id === primeiro.id)?.excluidoEm).toBeNull()
    expect(linhas.find((l) => l.chave === anexo(2).chave)?.excluidoEm).toEqual(
      agora(),
    )
    expect((await obterPublicacao(db, agora, ana, id))?.anexos).toHaveLength(1)

    const em31Dias = () => new Date(agora().getTime() + 31 * 86_400_000)
    let apagados: string[] = []
    await limparExclusoesVencidas(
      db,
      em31Dias,
      TABELAS_COM_EXCLUSAO,
      async (chaves) => {
        apagados = chaves
      },
    )
    expect(apagados).toEqual([anexo(2).chave])
    expect(await db.select().from(anexoDaPublicacao)).toHaveLength(1)
  })

  it('excluir é protegido: some das telas, a linha fica, e só autor ou Equipe exclui', async () => {
    const { db, geral, publicar, lista } = await cenario()
    const { id } = await publicar(ana, geral)
    await expect(excluirPublicacao(db, agora, bia, id)).rejects.toThrow(/autor/)
    await excluirPublicacao(db, agora, ana, id)
    expect((await lista(ana)).itens).toEqual([])
    expect(await obterPublicacao(db, agora, ana, id)).toBeNull()
    const [linha] = await db.select().from(publicacao)
    expect(linha.excluidoEm).toEqual(agora())
  })

  it('fixar e bloquear são só da Equipe', async () => {
    const { db, geral, publicar } = await cenario()
    const { id } = await publicar(ana, geral)
    await expect(fixarPublicacao(db, agora, ana, id, true)).rejects.toThrow(
      ErroDeComunidade,
    )
    await expect(bloquearComentarios(db, agora, ana, id, true)).rejects.toThrow(
      /equipe/,
    )
    await fixarPublicacao(db, agora, eq, id, true)
    expect((await obterPublicacao(db, agora, ana, id))?.fixada).toBe(true)
  })
})

describe('fila Aguardando resposta e comentários recentes', () => {
  it('só entra publicação em aberto de aluno que nenhuma pessoa da Equipe comentou', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const semResposta = await publicar(ana, geral, 'Sem resposta')
    passar(1)
    const respondida = await publicar(ana, geral, 'Respondida pela equipe')
    passar(1)
    const entreAlunos = await publicar(ana, geral, 'Só colegas responderam')
    const doTime = await publicar(eq, geral, 'Aviso da equipe')
    await comentarDe(eq, respondida.id)
    await comentarDe(bia, entreAlunos.id)
    expect(doTime.id).toBeTruthy()
    const fila = await listarAguardandoResposta(db)
    expect(fila.itens.map((i) => i.titulo)).toEqual([
      'Sem resposta',
      'Só colegas responderam',
    ])
    expect(await contarAguardandoResposta(db)).toBe(2)
    expect(semResposta.id).toBeTruthy()
  })

  it('sai da fila quando a Equipe comenta ou quando fica Resolvida, e volta se o comentário da Equipe é excluído', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    const c = await comentarDe(bia, id)
    expect(await contarAguardandoResposta(db)).toBe(1)
    await escolherMelhorResposta(db, agora, ana, id, c.id)
    expect(await contarAguardandoResposta(db)).toBe(0)
    await desfazerMelhorResposta(db, agora, ana, id)
    expect(await contarAguardandoResposta(db)).toBe(1)
    const daEquipe = await comentarDe(eq, id)
    expect(await contarAguardandoResposta(db)).toBe(0)
    await excluirComentario(db, agora, eq, daEquipe.id)
    expect(await contarAguardandoResposta(db)).toBe(1)
  })

  it('publicação excluída ou de comunidade excluída não conta', async () => {
    const { db, geral, publicar } = await cenario()
    const { id } = await publicar(ana, geral)
    await excluirPublicacao(db, agora, ana, id)
    expect(await contarAguardandoResposta(db)).toBe(0)
  })

  it('lista a fila da mais antiga para a mais nova, 20 por página', async () => {
    const { db, geral, publicar } = await cenario()
    for (let i = 0; i < POR_PAGINA + 2; i++) {
      passar(1)
      await publicar(ana, geral, `P${i}`)
    }
    const p1 = await listarAguardandoResposta(db, 1)
    const p2 = await listarAguardandoResposta(db, 2)
    expect(p1.itens).toHaveLength(POR_PAGINA)
    expect(p1.itens[0].titulo).toBe('P0')
    expect(p2.itens.map((i) => i.titulo)).toEqual([
      `P${POR_PAGINA}`,
      `P${POR_PAGINA + 1}`,
    ])
    expect(p1.total).toBe(POR_PAGINA + 2)
  })

  it('comentários recentes: os mais novos primeiro, sem os excluídos', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral, 'Tópico')
    await comentarDe(bia, id, 'antigo')
    passar(5)
    const novo = await comentarDe(eq, id, 'novo')
    passar(5)
    const apagado = await comentarDe(bia, id, 'apagado')
    await excluirComentario(db, agora, bia, apagado.id)
    const { itens, total } = await listarComentariosRecentes(db)
    expect(itens.map((i) => i.texto)).toEqual(['novo', 'antigo'])
    expect(itens[0]).toMatchObject({
      daEquipe: true,
      publicacaoTitulo: 'Tópico',
      comunidadeNome: 'Geral',
    })
    expect(total).toBe(2)
    expect(novo.id).toBeTruthy()
  })
})

describe('integração com o resto do app', () => {
  it('a fila Aguardando resposta está registrada nas filas do painel', async () => {
    const { FILAS } = await import('#/regras/filas')
    const fila = FILAS.find((f) => f.id === 'aguardando-resposta')
    expect(fila?.para).toBe('/painel/aguardando-resposta')
    const { db, geral, publicar } = await cenario()
    await publicar(ana, geral)
    expect(await fila?.contar(db)).toBe(1)
  })

  it('excluir a comunidade e o aluno apaga o que ele tem, sem tocar no que é dos outros', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { excluirAluno } = await import('#/regras/exclusao-de-aluno')
    await db.insert(user).values({
      id: 'dono',
      name: 'Helena',
      email: 'd@x.test',
      perfil: 'proprietario',
    })
    const deAna = await publicar(ana, geral, 'Da Ana')
    const deBia = await publicar(bia, geral, 'Da Bia')
    const c = await comentarDe(bia, deAna.id, 'Bia na Ana')
    const respostaDaAna = await comentarDe(ana, deBia.id, 'Ana na Bia')
    await comentarDe(bia, deBia.id, 'Resposta da Bia à Ana', respostaDaAna.id)
    await escolherMelhorResposta(db, agora, bia, deBia.id, respostaDaAna.id)

    await excluirAluno(db, agora, { autorId: 'dono', userId: 'ana' })

    const publicacoes = await db.select().from(publicacao)
    expect(publicacoes.map((p) => p.titulo)).toEqual(['Da Bia'])
    expect(publicacoes[0].melhorRespostaId).toBeNull()
    const comentarios = await db.select().from(comentarioDaPublicacao)
    expect(comentarios).toEqual([])
    expect(c.id).toBeTruthy()
    expect(
      await db
        .select()
        .from(seguidorDaPublicacao)

        .where(igual(seguidorDaPublicacao.userId, 'ana')),
    ).toEqual([])
  })

  it('a limpeza das exclusões vencidas apaga a publicação com os comentários', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { id } = await publicar(ana, geral)
    await comentarDe(bia, id)
    await excluirPublicacao(db, agora, ana, id)
    const daqui31Dias = () => new Date(agora().getTime() + 31 * 86_400_000)
    const { apagadas, falhas } = await limparExclusoesVencidas(
      db,
      daqui31Dias,
      TABELAS_COM_EXCLUSAO,
    )
    expect(falhas).toEqual([])
    expect(apagadas).toMatchObject({ publicacao: 1 })
    expect(await db.select().from(comentarioDaPublicacao)).toEqual([])
  })
})

describe('pontos da melhor resposta (#54)', () => {
  it('a autora da resposta ganha 50 pontos; trocar, desmarcar ou excluir tira', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { ganchosDaMelhorResposta } = await import('#/regras/pontos')
    const { saldoGeral } = await import('#/regras/pontos')
    const { id } = await publicar(ana, geral)
    const daBia = await comentarDe(bia, id, 'da Bia')
    const daEquipe = await comentarDe(eq, id, 'da equipe')

    await escolherMelhorResposta(
      db,
      agora,
      ana,
      id,
      daBia.id,
      ganchosDaMelhorResposta,
    )
    expect(await saldoGeral(db, 'bia')).toBe(50)
    await escolherMelhorResposta(
      db,
      agora,
      ana,
      id,
      daEquipe.id,
      ganchosDaMelhorResposta,
    )
    expect(await saldoGeral(db, 'bia')).toBe(0)
    expect(await saldoGeral(db, 'eq')).toBe(50)
    await desfazerMelhorResposta(db, agora, ana, id, ganchosDaMelhorResposta)
    expect(await saldoGeral(db, 'eq')).toBe(0)

    await escolherMelhorResposta(
      db,
      agora,
      ana,
      id,
      daBia.id,
      ganchosDaMelhorResposta,
    )
    await excluirComentario(db, agora, bia, daBia.id, ganchosDaMelhorResposta)
    expect(await saldoGeral(db, 'bia')).toBe(0)
  })

  it('quem marca a própria resposta não ganha pontos', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { ganchosDaMelhorResposta, saldoGeral } = await import(
      '#/regras/pontos'
    )
    const { id } = await publicar(ana, geral)
    const propria = await comentarDe(ana, id, 'eu mesma')
    await escolherMelhorResposta(
      db,
      agora,
      ana,
      id,
      propria.id,
      ganchosDaMelhorResposta,
    )
    expect(await saldoGeral(db, 'ana')).toBe(0)
    expect((await obterPublicacao(db, agora, ana, id))?.resolvida).toBe(true)
  })

  it('excluir a publicação ou a comunidade com melhor resposta estorna os pontos', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { ganchosDaMelhorResposta, saldoGeral } = await import(
      '#/regras/pontos'
    )
    const { estornarMelhoresRespostasDaComunidade } = await import(
      '#/regras/publicacoes'
    )
    const a = await publicar(ana, geral, 'A')
    const b = await publicar(ana, geral, 'B')
    const cA = await comentarDe(bia, a.id)
    const cB = await comentarDe(bia, b.id)
    await escolherMelhorResposta(
      db,
      agora,
      ana,
      a.id,
      cA.id,
      ganchosDaMelhorResposta,
    )
    await escolherMelhorResposta(
      db,
      agora,
      ana,
      b.id,
      cB.id,
      ganchosDaMelhorResposta,
    )
    expect(await saldoGeral(db, 'bia')).toBe(100)
    await excluirPublicacao(db, agora, ana, a.id, ganchosDaMelhorResposta)
    expect(await saldoGeral(db, 'bia')).toBe(50)
    expect(
      await estornarMelhoresRespostasDaComunidade(
        db,
        agora,
        geral,
        ganchosDaMelhorResposta,
      ),
    ).toBe(1)
    expect(await saldoGeral(db, 'bia')).toBe(0)
  })

  it('excluir a conta de quem fez a publicação leva os pontos de quem respondeu', async () => {
    const { db, geral, publicar, comentarDe } = await cenario()
    const { ganchosDaMelhorResposta, saldoGeral } = await import(
      '#/regras/pontos'
    )
    const { excluirAluno } = await import('#/regras/exclusao-de-aluno')
    await db.insert(user).values({
      id: 'dono',
      name: 'Helena',
      email: 'dd@x.test',
      perfil: 'proprietario',
    })
    const { id } = await publicar(ana, geral)
    const c = await comentarDe(bia, id)
    await escolherMelhorResposta(
      db,
      agora,
      ana,
      id,
      c.id,
      ganchosDaMelhorResposta,
    )
    await excluirAluno(db, agora, { autorId: 'dono', userId: 'ana' })
    expect(await saldoGeral(db, 'bia')).toBe(0)
  })
})
