// Trava, por tela de LEITURA do painel da Equipe, quantas idas ao banco ficam EM FILA (uma esperando a
// anterior). No Worker cada ida em fila custa uma viagem de rede até o D1 (dezenas de ms); a sessão é 1
// ida à parte (`exigirPermissaoNaSessao`), então os DADOS de cada tela têm de sair numa rodada só: no
// máximo 1 em fila. Consultas independentes vão juntas (`db.batch` ou `Promise.all`); quando a segunda
// depende da primeira, vira subconsulta/JOIN. O banco ganha um atraso artificial por ida (veja
// `src/test/idas.ts`): sem ele, "em fila" e "em paralelo" parecem iguais e a regressão passaria.
//
// Cada linha de `TELAS` chama o que a server function chama (as `carregar*` das `*-fns.ts` ou a função
// de regra, quando a server function só repassa). Tela nova no painel entra aqui.
import { beforeAll, describe, expect, it } from 'vitest'
import {
  avisoDeVenda,
  certificado,
  conferenciaDeVendas,
  conversaDeAtendimento,
  envioDeEmail,
  lancamentoDePontos,
  ligacaoDeVenda,
  matricula,
  mensagemDeAtendimento,
  pedidoDoMec,
  progressoDaAula,
  publicacao,
  quiz,
  registroDeAcoes,
  respostaAbertaDoQuiz,
  tentativaDoQuiz,
  user,
} from '#/db/schema'
import { carregarFilaDoAtendimento } from '#/lib/atendimento-fns'
import { carregarPainelDeBanners } from '#/lib/banner-fns'
import { carregarPainelDeComunidades } from '#/lib/comunidade-fns'
import { carregarConferenciaDaTela } from '#/lib/conferencia-fns'
import {
  carregarCursoDoPainel,
  carregarPainelDeConteudo,
} from '#/lib/conteudo-fns'
import { carregarCursoComAba } from '#/lib/curso-abas-fns'
import { carregarResumoDiario } from '#/lib/equipe-fns'
import { carregarPontosDoAlunoNoPainel } from '#/lib/pontos-fns'
import {
  carregarPanorama,
  carregarProgressoDosAlunos,
  carregarQuizzes,
  carregarSatisfacao,
} from '#/lib/relatorios-fns'
import { carregarVendasDaVoomp } from '#/lib/vendas-fns'
import { lerAparencia } from '#/regras/aparencia'
import { lerConversa } from '#/regras/atendimento'
import { avaliarAula, listarAvaliacoes } from '#/regras/avaliacoes'
import { lerAjustes } from '#/regras/avisos-agendados'
import { criarBanner } from '#/regras/banners'
import { certificadosParaAEquipe, lerModelo } from '#/regras/certificados'
import { criarComunidade } from '#/regras/comunidades'
import { lerConfiguracaoDaArea } from '#/regras/configuracao-da-area'
import {
  criarAula,
  criarCurso,
  criarModulo,
  obterAula,
} from '#/regras/conteudo'
import {
  detalheDaEntrega,
  listarEntregas,
  opcoesDeEntregas,
} from '#/regras/entregas-do-painel'
import { historicoDeEmails, listarTextosDeEmail } from '#/regras/envio-de-email'
import { listarEquipe } from '#/regras/equipe'
import { contarFilas, FILAS } from '#/regras/filas'
import { carregarLiberacaoDaHotmart } from '#/regras/liberacao-por-produto'
import { buscarAlunos, criarTurma, perfilDoAluno } from '#/regras/matricula'
import { listarPedidos } from '#/regras/pedido-do-mec'
import {
  listarAguardandoResposta,
  listarComentariosRecentes,
} from '#/regras/publicacoes'
import { obterQuizDoPainel, salvarQuiz } from '#/regras/quiz'
import {
  listarAguardandoCorrecao,
  listarSemTentativas,
} from '#/regras/quiz-correcao'
import { listarAcoesComAutor } from '#/regras/registro-de-acoes'
import { listarTranscricoes } from '#/regras/transcricoes'
import { criarBancoDeTeste } from '#/test/banco'
import { medirIdas } from '#/test/idas'

const D = (texto: string) => new Date(texto)
const hoje = D('2026-06-15T15:00:00Z')
const agora = () => hoje

type Banco = Awaited<ReturnType<typeof criarBancoDeTeste>>

// Um curso com módulo, aulas e quiz; turma com matrículas; e um pouco de tudo o que as telas leem:
// progresso, avaliação, venda da Voomp, pedido do MEC, conversa, quiz aguardando correção, pontos...
async function cenario() {
  const db = await criarBancoDeTeste()
  await db.insert(user).values([
    {
      id: 'ana',
      name: 'Ana',
      email: 'ana@x.test',
      createdAt: D('2026-06-10T12:00:00Z'),
      termosAceitoEm: D('2026-06-10T12:00:00Z'),
    },
    { id: 'bia', name: 'Bia', email: 'bia@x.test' },
    { id: 'eq', name: 'Equipe', email: 'eq@x.test', perfil: 'equipe' },
  ])
  const cursoId = await criarCurso(db, { nome: 'Coloração' })
  await criarCurso(db, { nome: 'Corte' })
  const moduloId = await criarModulo(db, cursoId, { nome: 'Módulo 1' })
  const aulaId = await criarAula(db, moduloId, {
    titulo: 'Raiz',
    video: 'https://vimeo.com/111111111/abc123def4',
  })
  const aula2 = await criarAula(db, moduloId, { titulo: 'Tom' })
  const turmaId = await criarTurma(db, { cursoId, nome: 'Turma A' })
  await db.insert(matricula).values([
    { id: 'm1', userId: 'ana', turmaId, iniciaEm: D('2026-06-01T00:00:00Z') },
    { id: 'm2', userId: 'bia', turmaId, iniciaEm: D('2026-06-01T00:00:00Z') },
  ])
  await db.insert(progressoDaAula).values([
    {
      id: 'p1',
      userId: 'ana',
      aulaId,
      abertaEm: D('2026-06-12T12:00:00Z'),
      concluidaEm: D('2026-06-12T12:30:00Z'),
      tempoTocando: 300,
    },
    {
      id: 'p2',
      userId: 'bia',
      aulaId: aula2,
      abertaEm: D('2026-06-13T12:00:00Z'),
    },
  ])
  await avaliarAula(db, agora, 'ana', aulaId, {
    nota: 3,
    oQueFaltou: 'Mais exemplos',
  })

  // Quiz com uma pergunta aberta e uma tentativa aguardando correção.
  await salvarQuiz(db, aulaId, {
    soQuiz: false,
    obrigatorio: false,
    obrigatorioParaCertificado: true,
    minimoDeAcertos: 70,
    maximoDeTentativas: 1,
    pontos: 100,
    perguntas: [
      {
        tipo: 'texto_livre',
        enunciado: 'Explique',
        imagem: null,
        alternativas: [],
      },
    ],
  } as never)
  const [q] = await db.select().from(quiz)
  await db.insert(tentativaDoQuiz).values({
    id: 'tq1',
    quizId: q.id,
    userId: 'ana',
    numero: 1,
    estado: 'aguardando_correcao',
    perguntas: '[]',
    respostas: '{}',
    acertos: 0,
    total: 1,
    percentual: 0,
    minimoDeAcertos: 70,
    enviadaEm: D('2026-06-14T12:00:00Z'),
  })
  await db
    .insert(respostaAbertaDoQuiz)
    .values({ id: 'r1', tentativaId: 'tq1', perguntaId: 'x', texto: 'ok' })

  // Pontos: avulso, da aula e do quiz (o extrato busca o título da aula citada).
  await db.insert(lancamentoDePontos).values([
    {
      id: 'l1',
      userId: 'ana',
      cursoId,
      origemTipo: 'avulso',
      pontos: 10,
      motivo: 'Bônus',
    },
    {
      id: 'l2',
      userId: 'ana',
      cursoId,
      origemTipo: 'aula',
      origemId: aulaId,
      pontos: 50,
    },
    {
      id: 'l3',
      userId: 'ana',
      cursoId,
      origemTipo: 'quiz',
      origemId: q.id,
      pontos: 100,
    },
  ])

  // Voomp: uma venda sem turma e outra aplicada à turma; ligação do produto.
  await db.insert(avisoDeVenda).values([
    {
      id: 'a1',
      chave: 'c1',
      tipo: 'sale',
      gatilho: 'pago',
      produtoId: 'p1',
      produtoNome: 'Curso',
      email: 'x@x.test',
      nome: 'X',
      corpo: '{}',
      situacao: 'sem_turma',
      recebidoEm: D('2026-06-14T12:00:00Z'),
    },
    {
      id: 'a2',
      chave: 'c2',
      tipo: 'sale',
      gatilho: 'pago',
      produtoId: 'p1',
      produtoNome: 'Curso',
      email: 'y@x.test',
      nome: 'Y',
      corpo: '{}',
      situacao: 'aplicada',
      turmaIds: JSON.stringify([turmaId]),
      recebidoEm: D('2026-06-14T13:00:00Z'),
    },
  ])
  await db
    .insert(ligacaoDeVenda)
    .values({ id: 'lg1', produtoId: 'p1', turmaId })
  const [conf] = [
    {
      id: 'cf1',
      autorId: 'eq',
      arquivoNome: 'vendas.xlsx',
      totalLinhas: 3,
      totalPagas: 2,
      totalMatriculadas: 1,
      totalSemMatricula: 1,
      totalSemTurma: 0,
      criadoEm: D('2026-06-14T12:00:00Z'),
    },
  ]
  await db.insert(conferenciaDeVendas).values(conf)

  // Certificado e pedido do MEC na fila há muito tempo (a fila tem destaque de atrasados).
  await db.insert(certificado).values({
    id: 'ce1',
    userId: 'ana',
    cursoId,
    codigo: 'ABC123',
    nome: 'Ana',
    cursoNome: 'Coloração',
    concluidoEm: D('2026-05-01T12:00:00Z'),
    emitidoEm: D('2026-05-01T12:00:00Z'),
  })
  await db.insert(pedidoDoMec).values({
    id: 'pm1',
    certificadoId: 'ce1',
    userId: 'ana',
    cursoId,
    criadoEm: D('2026-05-01T12:00:00Z'),
    naFilaDesde: D('2026-05-01T12:00:00Z'),
  })

  // Atendimento: uma conversa aberta com mensagem.
  await db.insert(conversaDeAtendimento).values({
    id: 'cv1',
    codigo: 'AT-1',
    userId: 'ana',
    assunto: 'Dúvida',
    ultimaMensagemEm: D('2026-06-14T12:00:00Z'),
  })
  await db.insert(mensagemDeAtendimento).values({
    id: 'ms1',
    conversaId: 'cv1',
    autor: 'aluno',
    autorId: 'ana',
    texto: 'Oi',
    criadoEm: D('2026-06-14T12:00:00Z'),
  })

  await db.insert(envioDeEmail).values({
    id: 'em1',
    userId: 'ana',
    para: 'ana@x.test',
    tipo: 'acesso-pronto',
    criadoEm: D('2026-06-14T12:00:00Z'),
  })
  await db.insert(registroDeAcoes).values({
    id: 'ra1',
    autorId: 'eq',
    acao: 'trocar-perfil',
    criadoEm: D('2026-06-14T12:00:00Z'),
  })

  // Comunidade com uma publicação sem resposta (entra em "Aguardando resposta").
  const comunidadeId = await criarComunidade(db, {
    nome: 'Geral',
    icone: 'mensagens',
    cor: '#1f4d3a',
    soEquipePublica: false,
    turmaIds: [turmaId],
  } as never)
  await db.insert(publicacao).values({
    id: 'pu1',
    comunidadeId,
    autorId: 'ana',
    titulo: 'Dúvida',
    textoHtml: '<p>Oi</p>',
    chaveDeEnvio: 'k1',
    ultimaAtividadeEm: D('2026-06-14T12:00:00Z'),
  })
  await criarBanner(db, {
    titulo: 'Promo',
    imagemComputador: 'banners/a.png',
    publico: 'todos',
    cursoIds: [cursoId],
  } as never)

  return { db, cursoId, moduloId, aulaId, turmaId }
}

describe('idas em fila nas telas de leitura do painel', () => {
  let c: Awaited<ReturnType<typeof cenario>>
  let medir: ReturnType<typeof medirIdas>['medir']
  beforeAll(async () => {
    c = await cenario()
    medir = medirIdas(c.db).medir
  })

  // `max` = o máximo de idas em fila dos DADOS da tela (a sessão fica de fora). Todas as telas cabem em 1.
  const periodo = { de: '2026-05-17', ate: '2026-06-15' }
  const telas: [string, (db: Banco) => Promise<unknown>][] = [
    ['conteúdo (lista)', (db) => carregarPainelDeConteudo(db)],
    ['conteúdo (curso)', (db) => carregarCursoDoPainel(db, c.cursoId)],
    [
      'curso (aba conteúdo)',
      (db) => carregarCursoComAba(db, c.cursoId, 'conteudo'),
    ],
    [
      'curso (aba quem compra)',
      (db) => carregarCursoComAba(db, c.cursoId, 'quem-compra'),
    ],
    [
      'curso (aba liberação)',
      (db) => carregarCursoComAba(db, c.cursoId, 'liberacao', c.turmaId),
    ],
    [
      'curso (aba alunos)',
      (db) => carregarCursoComAba(db, c.cursoId, 'alunos'),
    ],
    ['conteúdo (aula)', (db) => obterAula(db, c.aulaId)],
    ['quiz da aula', (db) => obterQuizDoPainel(db, c.aulaId)],
    ['modelo de certificado', (db) => lerModelo(db, c.cursoId)],
    ['alunos (lista)', (db) => buscarAlunos(db, '', 1)],
    ['aluno (perfil)', (db) => perfilDoAluno(db, agora, 'ana')],
    ['aluno (e-mails)', (db) => historicoDeEmails(db, 'ana')],
    ['aluno (pontos)', (db) => carregarPontosDoAlunoNoPainel(db, 'ana')],
    ['aluno (certificados)', (db) => certificadosParaAEquipe(db, 'ana')],
    ['banners', (db) => carregarPainelDeBanners(db)],
    ['comunidades', (db) => carregarPainelDeComunidades(db)],
    [
      'vendas da Voomp (Proprietário)',
      (db) => carregarVendasDaVoomp(db, true, {}),
    ],
    [
      'vendas da Voomp (Equipe)',
      (db) => carregarVendasDaVoomp(db, false, { situacao: 'sem_turma' }),
    ],
    [
      'vendas (filtro por plataforma)',
      (db) => carregarVendasDaVoomp(db, true, { gateway: 'hotmart' }),
    ],
    ['vendas › produtos da Hotmart', (db) => carregarLiberacaoDaHotmart(db)],
    [
      'conferência de vendas',
      (db) => carregarConferenciaDaTela(db, { id: 'cf1' }),
    ],
    [
      'atendimento (fila)',
      (db) => carregarFilaDoAtendimento(db, 'eq', 'aberta'),
    ],
    [
      'atendimento (conversa)',
      (db) => lerConversa(db, 'cv1', { id: 'eq', equipe: true }),
    ],
    ['correção (fila)', (db) => listarAguardandoCorrecao(db)],
    ['correção (sem tentativas)', (db) => listarSemTentativas(db)],
    [
      'entregas (lista filtrada)',
      (db) =>
        listarEntregas(db, { aluno: 'ana', estado: 'aguardando_correcao' }),
    ],
    ['entregas (opções dos filtros)', (db) => opcoesDeEntregas(db)],
    ['entregas (detalhe)', (db) => detalheDaEntrega(db, 'tq1')],
    ['aguardando resposta', (db) => listarAguardandoResposta(db, 1)],
    ['comentários recentes', (db) => listarComentariosRecentes(db, 1)],
    ['avaliações', (db) => listarAvaliacoes(db, 'para-ler')],
    [
      'certificado do MEC',
      (db) => listarPedidos(db, agora, { estado: 'na_fila' }),
    ],
    ['relatórios (panorama)', (db) => carregarPanorama(db, true, periodo)],
    [
      'relatórios (progresso, curso escolhido)',
      (db) => carregarProgressoDosAlunos(db, true, { cursoId: c.cursoId }),
    ],
    ['relatórios (satisfação)', (db) => carregarSatisfacao(db, true, periodo)],
    ['relatórios (quizzes)', (db) => carregarQuizzes(db, true, periodo)],
    ['resumo diário', (db) => carregarResumoDiario(db, 'eq')],
    ['contadores das filas (menu)', (db) => contarFilas(db, FILAS, agora)],
    ['avisos agendados', (db) => lerAjustes(db)],
    ['textos de e-mail', (db) => listarTextosDeEmail(db)],
    ['configurações da área', (db) => lerConfiguracaoDaArea(db)],
    ['aparência', (db) => lerAparencia(db)],
    ['equipe', (db) => listarEquipe(db)],
    ['registro de ações', (db) => listarAcoesComAutor(db, 1)],
    ['transcrições', (db) => listarTranscricoes(db)],
  ]

  it.each(telas)('%s: no máximo 1 ida em fila', async (_nome, tela) => {
    const { emFila, consultas } = await medir(() => tela(c.db))
    expect(emFila, consultas.join(' | ')).toBeLessThanOrEqual(1)
  })

  // O medidor em si: sem isto, um atraso que não pega deixaria todas as telas "verdes" por engano.
  it('o medidor distingue fila, paralelo e batch', async () => {
    const um = () => c.db.select().from(user)
    const fila = await medir(async () => {
      await um()
      await um()
      await um()
    })
    expect(fila).toMatchObject({ idas: 3, emFila: 3 })
    const paralelo = await medir(() => Promise.all([um(), um(), um()]))
    expect(paralelo).toMatchObject({ idas: 3, emFila: 1 })
    const lote = await medir(() => c.db.batch([um(), um(), um()]))
    expect(lote).toMatchObject({ idas: 1, emFila: 1 })
  })

  // As telas que dependem de verdade de uma leitura anterior e ficam com 2 (listadas, não escondidas).
  it('relatórios (progresso) sem curso na busca: o primeiro curso da lista é o escolhido, 2 em fila', async () => {
    const { emFila } = await medir(() =>
      carregarProgressoDosAlunos(c.db, true, {}),
    )
    expect(emFila).toBe(2)
  })
})
