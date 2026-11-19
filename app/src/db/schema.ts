import { relations, sql } from 'drizzle-orm'
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .default(false)
    .notNull(),
  image: text('image'),
  // Aluno, Equipe ou Proprietário (GLOSSARY). Quem a venda cria entra como aluno.
  perfil: text('perfil', { enum: ['aluno', 'equipe', 'proprietario'] })
    .default('aluno')
    .notNull(),
  // Versão dos Termos que o aluno aceitou e quando; nulos até o primeiro aceite.
  termosVersao: text('termos_versao'),
  termosAceitoEm: integer('termos_aceito_em', { mode: 'timestamp_ms' }),
  // Minha conta (#64): telefone, fuso horário (nome IANA; nulo = Brasília), bio e o tour de
  // primeiro acesso (nulo = ainda não viu nem pulou).
  telefone: text('telefone'),
  fusoHorario: text('fuso_horario'),
  bio: text('bio'),
  tourVistoEm: integer('tour_visto_em', { mode: 'timestamp_ms' }),
  // Preferência da aluna (#99): a próxima aula começa sozinha após alguns segundos (padrão: sim).
  proximaAulaSozinha: integer('proxima_aula_sozinha', { mode: 'boolean' })
    .default(true)
    .notNull(),
  // Certificados (#55): como o nome sai no certificado e quando o aluno o confirmou (nulo = ainda
  // não confirmou: a 1ª emissão espera).
  nomeNoCertificado: text('nome_no_certificado'),
  nomeConfirmadoEm: integer('nome_confirmado_em', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
})

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // "Entrar como" (Equipe vendo a escola como a aluna): id de quem entrou. Nulo na sessão comum.
    impersonatedBy: text('impersonated_by'),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
)

// Relação que o Better Auth usa para buscar sessão + usuário num JOIN só (`advanced.database.joins`).
// O drizzle-kit ignora `relations`: não muda o SQL nem gera migração.
export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

// Aparência da área (fatia #63): uma linha só, com id fixo `padrao`. Tema, cor da marca e as
// imagens (logo, favicon, fundos) que o Proprietário escolhe no Estúdio. Vazio = padrão do tema.
export const aparencia = sqliteTable('aparencia', {
  id: text('id').primaryKey(),
  tema: text('tema').notNull(),
  // Estilo da área do aluno: 'classica' (casca atual) ou 'lume'.
  casca: text('casca').notNull().default('classica'),
  // Mostrar a aba Comunidade no menu do aluno; desligada, entra "Falar com a equipe" no lugar.
  mostrarComunidade: integer('mostrar_comunidade', { mode: 'boolean' })
    .notNull()
    .default(true),
  corDaMarca: text('cor_da_marca'),
  logoUrl: text('logo_url'),
  faviconUrl: text('favicon_url'),
  fundoDoMenuUrl: text('fundo_do_menu_url'),
  fundoDoLoginUrl: text('fundo_do_login_url'),
  atualizadoEm: integer('atualizado_em', { mode: 'timestamp_ms' }).notNull(),
  atualizadoPor: text('atualizado_por').references(() => user.id, {
    onDelete: 'set null',
  }),
})

// Configuração da área (#64): uma linha só, id fixo `padrao`. Termos de uso, política de privacidade
// e contato de suporte, editados pelo Proprietário. Sem a linha valem os padrões de
// `src/regras/configuracao-da-area.ts`. Mudar `termos_versao` pede novo aceite de todo aluno.
export const configuracaoDaArea = sqliteTable('configuracao_da_area', {
  id: text('id').primaryKey(),
  termosVersao: text('termos_versao').notNull(),
  termosTexto: text('termos_texto').notNull(),
  privacidadeTexto: text('privacidade_texto').notNull(),
  suporteEmail: text('suporte_email').notNull(),
  // Vídeo de boas-vindas da Helena (#101): endereço do player do Vimeo; nulo = sem vídeo, nada aparece.
  boasVindasVimeo: text('boas_vindas_vimeo'),
  // Interruptor "Usar a Voomp" (#146): ligado, a Voomp aparece em Vendas e Produtos mesmo sem aviso ainda.
  voompLigada: integer('voomp_ligada', { mode: 'boolean' })
    .default(false)
    .notNull(),
  atualizadoEm: integer('atualizado_em', { mode: 'timestamp_ms' }).notNull(),
  atualizadoPor: text('atualizado_por').references(() => user.id, {
    onDelete: 'set null',
  }),
})

// Credenciais da API da Hotmart (#129): uma linha só (id `padrao`). Os quatro segredos ficam cifrados
// (AES-GCM, chave em segredo do Worker; ver `src/regras/cifra.ts`) e nunca são devolvidos à tela.
// O token OAuth em uso também fica cifrado aqui, para valer entre os pedidos até expirar.
export const credencialHotmart = sqliteTable('credencial_hotmart', {
  id: text('id').primaryKey(),
  clientIdCifrado: text('client_id_cifrado').notNull(),
  clientSecretCifrado: text('client_secret_cifrado').notNull(),
  basicCifrado: text('basic_cifrado').notNull(),
  hottokCifrado: text('hottok_cifrado').notNull(),
  // Credencial do tipo sandbox: a API vai para sandbox.hotmart.com em vez da produção.
  sandbox: integer('sandbox', { mode: 'boolean' }).notNull().default(false),
  tokenCifrado: text('token_cifrado'),
  tokenExpiraEm: integer('token_expira_em', { mode: 'timestamp_ms' }),
  atualizadoEm: integer('atualizado_em', { mode: 'timestamp_ms' }).notNull(),
  atualizadoPor: text('atualizado_por').references(() => user.id, {
    onDelete: 'set null',
  }),
})

// Conferência diária da Hotmart (#134): uma linha por execução (cron ou botão do Proprietário) com
// a janela consultada, os totais e, em `detalhes` (JSON), cada venda recuperada.
export const conferenciaHotmart = sqliteTable('conferencia_hotmart', {
  id: text('id').primaryKey(),
  origem: text('origem', { enum: ['cron', 'manual'] }).notNull(),
  situacao: text('situacao', { enum: ['ok', 'falhou'] }).notNull(),
  iniciadaEm: integer('iniciada_em', { mode: 'timestamp_ms' }).notNull(),
  concluidaEm: integer('concluida_em', { mode: 'timestamp_ms' }).notNull(),
  janelaInicio: integer('janela_inicio', { mode: 'timestamp_ms' }).notNull(),
  janelaFim: integer('janela_fim', { mode: 'timestamp_ms' }).notNull(),
  consultadas: integer('consultadas').notNull().default(0),
  recuperadas: integer('recuperadas').notNull().default(0),
  jaProcessadas: integer('ja_processadas').notNull().default(0),
  semTurma: integer('sem_turma').notNull().default(0),
  ignoradas: integer('ignoradas').notNull().default(0),
  comErro: integer('com_erro').notNull().default(0),
  erro: text('erro'),
  detalhes: text('detalhes').notNull().default('[]'),
})

// ---- Conteúdo (#38) ----
// Tudo o que a equipe cadastra pode ser excluído de forma protegida (`excluido_em`, ver
// `src/regras/exclusao-protegida.ts`). `ordem` é a posição dentro do pai, começando em 1.
const criadoEm = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull()
const excluidoEm = () => integer('excluido_em', { mode: 'timestamp_ms' })
// Id do item na Memberkit, só nos que vieram do script de importação (#40); nulo nos cadastrados
// aqui. É a chave que deixa o script rodar de novo sem duplicar (único entre os não nulos).
const origemMemberkit = () => integer('origem_memberkit')

export const categoria = sqliteTable(
  'categoria',
  {
    id: text('id').primaryKey(),
    nome: text('nome').notNull(),
    ordem: integer('ordem').notNull(),
    origemMemberkit: origemMemberkit(),
    criadoEm: criadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [uniqueIndex('categoria_origem_idx').on(t.origemMemberkit)],
)

export const curso = sqliteTable(
  'curso',
  {
    id: text('id').primaryKey(),
    categoriaId: text('categoria_id').references(() => categoria.id),
    nome: text('nome').notNull(),
    descricao: text('descricao').notNull().default(''),
    // Carga horária em horas; nula = não informada.
    cargaHoraria: integer('carga_horaria'),
    // Chaves no R2 (nunca URL): a imagem sai pela rota `/api/imagens/...`.
    capaHorizontal: text('capa_horizontal'),
    capaVertical: text('capa_vertical'),
    imagemDestaque: text('imagem_destaque'),
    // Aparece na vitrine (com cadeado) para quem não tem o curso, levando à página de vendas.
    mostrarATodos: integer('mostrar_a_todos', { mode: 'boolean' })
      .default(false)
      .notNull(),
    urlDeVendas: text('url_de_vendas'),
    // Exigências do certificado (#55): todas as aulas concluídas e o mínimo de pontos no curso (0 =
    // sem mínimo). Os quizzes obrigatórios vêm do próprio quiz (`obrigatorioParaCertificado`).
    certificadoTodasAsAulas: integer('certificado_todas_as_aulas', {
      mode: 'boolean',
    })
      .default(true)
      .notNull(),
    certificadoPontosMinimos: integer('certificado_pontos_minimos')
      .default(0)
      .notNull(),
    // Emitir o certificado próprio deste curso abre um Pedido do MEC (#56). Hoje só a Formação.
    geraPedidoDoMec: integer('gera_pedido_do_mec', { mode: 'boolean' })
      .default(false)
      .notNull(),
    ordem: integer('ordem').notNull(),
    origemMemberkit: origemMemberkit(),
    criadoEm: criadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [
    index('curso_categoria_idx').on(t.categoriaId),
    uniqueIndex('curso_origem_idx').on(t.origemMemberkit),
  ],
)

export const modulo = sqliteTable(
  'modulo',
  {
    id: text('id').primaryKey(),
    cursoId: text('curso_id')
      .notNull()
      .references(() => curso.id),
    nome: text('nome').notNull(),
    capa: text('capa'),
    ordem: integer('ordem').notNull(),
    origemMemberkit: origemMemberkit(),
    criadoEm: criadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [
    index('modulo_curso_idx').on(t.cursoId),
    uniqueIndex('modulo_origem_idx').on(t.origemMemberkit),
  ],
)

export const aula = sqliteTable(
  'aula',
  {
    id: text('id').primaryKey(),
    moduloId: text('modulo_id')
      .notNull()
      .references(() => modulo.id),
    titulo: text('titulo').notNull(),
    // Vídeo do Vimeo: id numérico e, nos não listados, o hash da URL.
    vimeoId: text('vimeo_id'),
    vimeoHash: text('vimeo_hash'),
    // Texto da aula em HTML, já limpo por `limparHtml` ao gravar.
    textoHtml: text('texto_html').notNull().default(''),
    miniatura: text('miniatura'),
    ordem: integer('ordem').notNull(),
    origemMemberkit: origemMemberkit(),
    criadoEm: criadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [
    index('aula_modulo_idx').on(t.moduloId),
    uniqueIndex('aula_origem_idx').on(t.origemMemberkit),
  ],
)

export const materialDaAula = sqliteTable(
  'material_da_aula',
  {
    id: text('id').primaryKey(),
    aulaId: text('aula_id')
      .notNull()
      .references(() => aula.id),
    nome: text('nome').notNull(),
    // Chave do arquivo no R2; só baixa por `/api/materiais/:id`, que confere sessão e acesso.
    chave: text('chave').notNull(),
    tipo: text('tipo').notNull(),
    // Bytes do arquivo guardado no R2 (o que se baixou).
    tamanho: integer('tamanho').notNull(),
    // `byte_size` que a Memberkit informou na última importação. A Memberkit entrega imagens
    // recomprimidas (baixa-se menos que o `byte_size`), então a conferência de mudança usa este
    // campo, não `tamanho`. Nulo em material cadastrado à mão ou importado antes dele existir.
    tamanhoOrigem: integer('tamanho_origem'),
    ordem: integer('ordem').notNull(),
    origemMemberkit: origemMemberkit(),
    criadoEm: criadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [
    index('material_aula_idx').on(t.aulaId),
    // O mesmo arquivo da Memberkit pode estar em várias aulas: um material por aula.
    uniqueIndex('material_aula_origem_idx').on(t.aulaId, t.origemMemberkit),
  ],
)

// ---- Turmas e matrículas (#39) ----
// Turma = uma edição de um curso, com prazo de acesso opcional em dias (nulo = vitalício).
export const turma = sqliteTable(
  'turma',
  {
    id: text('id').primaryKey(),
    cursoId: text('curso_id')
      .notNull()
      .references(() => curso.id),
    nome: text('nome').notNull(),
    prazoEmDias: integer('prazo_em_dias'),
    criadoEm: criadoEm(),
  },
  (t) => [index('turma_curso_idx').on(t.cursoId)],
)

// Matrícula = vínculo de um aluno com uma turma. `situacao` guarda só ativa/inativa/expirada que a
// rotina diária já marcou; a situação de verdade vem de `situacaoDaMatricula` (que também olha a
// data). `iniciaEm` é o dia da compra ou da última reativação (base das regras "dias após a compra").
export const matricula = sqliteTable(
  'matricula',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    turmaId: text('turma_id')
      .notNull()
      .references(() => turma.id),
    situacao: text('situacao', { enum: ['ativa', 'expirada', 'inativa'] })
      .default('ativa')
      .notNull(),
    iniciaEm: integer('inicia_em', { mode: 'timestamp_ms' }).notNull(),
    // Nulo = vitalícia.
    expiraEm: integer('expira_em', { mode: 'timestamp_ms' }),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('matricula_aluno_turma_idx').on(t.userId, t.turmaId),
    index('matricula_turma_idx').on(t.turmaId),
    index('matricula_situacao_expira_idx').on(t.situacao, t.expiraEm),
  ],
)

// O que sustenta a matrícula: uma matrícula manual (com autor e observação) ou uma venda paga da
// plataforma (`vendaId` com o gateway na frente, ex.: `voomp:123`, `hotmart:HP123`; preenchido por
// `aplicarVendaPaga`, #43). O estorno tira a venda daqui; a
// matrícula só é inativada se nada mais a sustentar.
export const origemDaMatricula = sqliteTable(
  'origem_da_matricula',
  {
    id: text('id').primaryKey(),
    matriculaId: text('matricula_id')
      .notNull()
      .references(() => matricula.id),
    tipo: text('tipo', { enum: ['manual', 'venda'] }).notNull(),
    vendaId: text('venda_id'),
    autorId: text('autor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    observacao: text('observacao'),
    criadoEm: criadoEm(),
  },
  (t) => [index('origem_matricula_idx').on(t.matriculaId)],
)

// Registro de ações sensíveis: quem da equipe fez o quê (só o Proprietário lê). `detalhe` é JSON.
export const registroDeAcoes = sqliteTable(
  'registro_de_acoes',
  {
    id: text('id').primaryKey(),
    autorId: text('autor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    acao: text('acao').notNull(),
    detalhe: text('detalhe').notNull().default('{}'),
    criadoEm: integer('criado_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('registro_acoes_criado_idx').on(t.criadoEm)],
)

// ---- Banners (#60) ----
// Carrossel no topo da vitrine. `publico`: todos, quem tem matrícula ativa em algum dos cursos
// escolhidos (`com_matricula`) ou quem não tem em nenhum deles (`sem_matricula`). As imagens são
// chaves do R2. `inicio`/`fim` nulos = sem limite. `exibicoes` e `cliques` são contadores.
export const banner = sqliteTable(
  'banner',
  {
    id: text('id').primaryKey(),
    titulo: text('titulo').notNull(),
    imagemComputador: text('imagem_computador').notNull(),
    imagemCelular: text('imagem_celular'),
    link: text('link'),
    publico: text('publico', {
      enum: ['todos', 'com_matricula', 'sem_matricula'],
    })
      .notNull()
      .default('todos'),
    ativo: integer('ativo', { mode: 'boolean' }).default(true).notNull(),
    inicio: integer('inicio', { mode: 'timestamp_ms' }),
    fim: integer('fim', { mode: 'timestamp_ms' }),
    ordem: integer('ordem').notNull(),
    exibicoes: integer('exibicoes').default(0).notNull(),
    cliques: integer('cliques').default(0).notNull(),
    // Chave da importação das capas e banners da área hospedada (`npm run importar:capas`): a posição
    // e o hash da imagem. Deixa a importação rodar de novo sem duplicar (único entre os não nulos).
    origemMemberkit: text('origem_memberkit'),
    criadoEm: criadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [uniqueIndex('banner_origem_idx').on(t.origemMemberkit)],
)

// Cursos escolhidos de um banner com público por matrícula.
export const bannerCurso = sqliteTable(
  'banner_curso',
  {
    bannerId: text('banner_id')
      .notNull()
      .references(() => banner.id, { onDelete: 'cascade' }),
    cursoId: text('curso_id')
      .notNull()
      .references(() => curso.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('banner_curso_idx').on(t.bannerId, t.cursoId),
    index('banner_curso_curso_idx').on(t.cursoId),
  ],
)

// Progresso do aluno numa aula (#41): onde parou no vídeo, até onde chegou, quanto tempo o vídeo
// tocou e quando concluiu. Posições e tempos em segundos. A linha nasce quando o aluno abre a aula.
export const progressoDaAula = sqliteTable(
  'progresso_da_aula',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    aulaId: text('aula_id')
      .notNull()
      .references(() => aula.id, { onDelete: 'cascade' }),
    ultimaPosicao: integer('ultima_posicao').default(0).notNull(),
    maiorPonto: integer('maior_ponto').default(0).notNull(),
    // Duração do vídeo vista pelo player na última gravação; 0 = ainda não informada.
    duracao: integer('duracao').default(0).notNull(),
    tempoTocando: integer('tempo_tocando').default(0).notNull(),
    concluidaEm: integer('concluida_em', { mode: 'timestamp_ms' }),
    // Última abertura da aula (ordena o "Continuar assistindo") e última gravação do player.
    abertaEm: integer('aberta_em', { mode: 'timestamp_ms' }).notNull(),
    gravadaEm: integer('gravada_em', { mode: 'timestamp_ms' }),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('progresso_aluno_aula_idx').on(t.userId, t.aulaId),
    index('progresso_aula_idx').on(t.aulaId),
    // "Colegas assistiram esta semana" (#105): conta as aberturas recentes de uma aula sem varrê-la toda.
    index('progresso_aula_aberta_idx').on(t.aulaId, t.abertaEm),
  ],
)

// ---- Favoritos (#49) ----
// Só aulas são favoritadas (GLOSSARY). Favoritar é gravar o mesmo registro: a chave composta
// (aluno, aula) impede duplicata, então clique duplo ou reenvio não cria linha nova.
export const favorito = sqliteTable(
  'favorito',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    aulaId: text('aula_id')
      .notNull()
      .references(() => aula.id),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('favorito_aluno_aula_idx').on(t.userId, t.aulaId),
    index('favorito_aula_idx').on(t.aulaId),
  ],
)

// Transcrição (#50): o texto falado de um vídeo do Vimeo, com o tempo de cada trecho. Serve só
// para a busca; o aluno não vê o texto. É chave do vídeo (não da aula): quem usa aquele vídeo
// ganha a busca, e trocar o vídeo da aula troca a transcrição junto. Arquivo novo do mesmo
// vídeo apaga os trechos antigos e grava de novo (substituição de verdade, sem `excluidoEm`).
export const transcricao = sqliteTable('transcricao', {
  vimeoId: text('vimeo_id').primaryKey(),
  arquivo: text('arquivo').notNull(),
  criadoEm: criadoEm(),
})

export const trechoDaTranscricao = sqliteTable(
  'trecho_da_transcricao',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vimeoId: text('vimeo_id')
      .notNull()
      .references(() => transcricao.vimeoId, { onDelete: 'cascade' }),
    // Segundo do vídeo em que o trecho começa.
    inicio: integer('inicio').notNull(),
    texto: text('texto').notNull(),
    // Mesmo texto em minúsculas e sem acento, para a busca filtrar no banco.
    textoBusca: text('texto_busca').notNull(),
  },
  (t) => [index('trecho_transcricao_video_idx').on(t.vimeoId, t.inicio)],
)

// ---- Regras de liberação (#42) ----
// Cada linha é a regra de UM módulo ou de UMA aula numa turma (`modulo_id` ou `aula_id`, nunca os
// dois). Sem linha, o item é livre. A regra da aula vale no lugar da do módulo. Os campos usados
// dependem do `tipo`: `libera_em`/`fecha_em` (data), `dias` (dias após a compra), `pontos`
// (pontuação mínima) e `alvo_id` (curso, módulo ou aula que precisa estar concluído).
export const regraDeLiberacao = sqliteTable(
  'regra_de_liberacao',
  {
    id: text('id').primaryKey(),
    turmaId: text('turma_id')
      .notNull()
      .references(() => turma.id),
    moduloId: text('modulo_id').references(() => modulo.id),
    aulaId: text('aula_id').references(() => aula.id),
    tipo: text('tipo', {
      enum: [
        'livre',
        'data',
        'dias_apos_compra',
        'pontuacao_minima',
        'oculto',
        'bloqueado',
        'curso_concluido',
        'modulo_concluido',
        'aula_concluida',
      ],
    }).notNull(),
    liberaEm: integer('libera_em', { mode: 'timestamp_ms' }),
    fechaEm: integer('fecha_em', { mode: 'timestamp_ms' }),
    dias: integer('dias'),
    pontos: integer('pontos'),
    alvoId: text('alvo_id'),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('regra_turma_modulo_idx').on(t.turmaId, t.moduloId),
    uniqueIndex('regra_turma_aula_idx').on(t.turmaId, t.aulaId),
  ],
)

// ---- Quiz (#51) ----
// Um quiz por aula. `soQuiz` = a aula é do tipo quiz (o quiz é a própria aula); senão ele fica
// embaixo do conteúdo. `obrigatorio` trava a conclusão da aula até a aprovação (a aula só quiz
// sempre exige). Mínimo de acertos em %; `maximoDeTentativas` nulo = ilimitado (1 a 15). Pontos
// (#54) dados na primeira aprovação. Salvar o quiz regrava perguntas e alternativas: as tentativas
// antigas guardam a cópia do que o aluno viu, então nada se perde.
export const quiz = sqliteTable(
  'quiz',
  {
    id: text('id').primaryKey(),
    aulaId: text('aula_id')
      .notNull()
      .references(() => aula.id),
    soQuiz: integer('so_quiz', { mode: 'boolean' }).default(false).notNull(),
    obrigatorio: integer('obrigatorio', { mode: 'boolean' })
      .default(false)
      .notNull(),
    obrigatorioParaCertificado: integer('obrigatorio_para_certificado', {
      mode: 'boolean',
    })
      .default(false)
      .notNull(),
    minimoDeAcertos: integer('minimo_de_acertos').default(70).notNull(),
    maximoDeTentativas: integer('maximo_de_tentativas'),
    pontos: integer('pontos').default(100).notNull(),
    // "Sem correção" (#52): as respostas abertas são aceitas ao enviar, sem passar pela fila.
    semCorrecao: integer('sem_correcao', { mode: 'boolean' })
      .default(false)
      .notNull(),
    // Id publicado (`/forms/d/e/<id>`) do Google Form de onde o quiz veio (#53); nulo nos criados
    // aqui. A importação roda de novo sem duplicar por (aula, origem).
    origemGoogleForms: text('origem_google_forms'),
    // Como a aluna responde: `lista` (todas as perguntas na página) ou `conversa` (uma por vez, como num
    // chat). Em conversa, `abertura` são as mensagens antes da 1ª pergunta (uma por linha) e `fecho` a
    // mensagem depois de enviar.
    formato: text('formato').default('lista').notNull(),
    abertura: text('abertura'),
    fecho: text('fecho'),
    criadoEm: criadoEm(),
    // Exclusão protegida: o quiz removido (só sem tentativas) espera 30 dias; um novo quiz da mesma
    // aula pode nascer nesse meio-tempo, por isso a unicidade só vale entre os não excluídos.
    excluidoEm: excluidoEm(),
  },
  (t) => [
    uniqueIndex('quiz_aula_idx').on(t.aulaId).where(sql`excluido_em is null`),
    index('quiz_origem_google_forms_idx').on(t.origemGoogleForms),
  ],
)

// `tipo` é aberto: unica, multipla, texto_livre e arquivo (as duas últimas, da #52, não têm
// alternativas).
export const perguntaDoQuiz = sqliteTable(
  'pergunta_do_quiz',
  {
    id: text('id').primaryKey(),
    quizId: text('quiz_id')
      .notNull()
      .references(() => quiz.id, { onDelete: 'cascade' }),
    tipo: text('tipo').default('unica').notNull(),
    enunciado: text('enunciado').notNull(),
    // Chave da imagem no R2 (como as imagens do conteúdo); nula = sem imagem.
    imagem: text('imagem'),
    // Só na pergunta `arquivo`: qualquer | imagem | pdf | audio | video (`TIPOS_ACEITOS`).
    aceita: text('aceita').default('qualquer').notNull(),
    // Pergunta opcional: pode ficar sem resposta (o "(opcional)" aparece no enunciado).
    obrigatoria: integer('obrigatoria', { mode: 'boolean' })
      .default(true)
      .notNull(),
    // "Responda pelo menos um destes": perguntas do mesmo quiz com o mesmo valor formam um grupo.
    grupoUmDe: text('grupo_um_de'),
    // Escolha sem gabarito com a alternativa "Outro:" e o campo de texto.
    outro: integer('outro', { mode: 'boolean' }).default(false).notNull(),
    ordem: integer('ordem').notNull(),
  },
  (t) => [index('pergunta_quiz_idx').on(t.quizId)],
)

export const alternativaDaPergunta = sqliteTable(
  'alternativa_da_pergunta',
  {
    id: text('id').primaryKey(),
    perguntaId: text('pergunta_id')
      .notNull()
      .references(() => perguntaDoQuiz.id, { onDelete: 'cascade' }),
    texto: text('texto').notNull(),
    correta: integer('correta', { mode: 'boolean' }).default(false).notNull(),
    // Feedback mostrado a quem marcou esta alternativa.
    comentario: text('comentario'),
    // Chave da imagem da alternativa no R2 (vem dos Google Forms, #53); nula = só texto.
    imagem: text('imagem'),
    ordem: integer('ordem').notNull(),
  },
  (t) => [index('alternativa_pergunta_idx').on(t.perguntaId)],
)

// Uma vez em que o aluno enviou o quiz. `perguntas` é a cópia (JSON) do que ele respondeu, com as
// corretas e os comentários, e `respostas` o que marcou (`{ [perguntaId]: alternativaId[] }`).
export const tentativaDoQuiz = sqliteTable(
  'tentativa_do_quiz',
  {
    id: text('id').primaryKey(),
    quizId: text('quiz_id')
      .notNull()
      .references(() => quiz.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    numero: integer('numero').notNull(),
    estado: text('estado', {
      enum: ['aprovada', 'reprovada', 'aguardando_correcao'],
    }).notNull(),
    perguntas: text('perguntas').notNull(),
    respostas: text('respostas').notNull(),
    acertos: integer('acertos').notNull(),
    total: integer('total').notNull(),
    // 0 a 100, arredondado para baixo.
    percentual: integer('percentual').notNull(),
    minimoDeAcertos: integer('minimo_de_acertos').notNull(),
    enviadaEm: integer('enviada_em', { mode: 'timestamp_ms' }).notNull(),
    // Quando a Equipe terminou de corrigir as respostas abertas (nulo = nunca passou pela fila).
    corrigidaEm: integer('corrigida_em', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('tentativa_quiz_aluno_numero_idx').on(
      t.quizId,
      t.userId,
      t.numero,
    ),
    index('tentativa_user_idx').on(t.userId),
  ],
)

// ---- Quiz com entregas (#52) ----
// Resposta de texto livre ou de envio de arquivo. `situacao` é o que a Equipe decidiu na fila
// ("pendente" até lá; "certa" direto quando o quiz é "sem correção"). A pergunta em si vive na cópia
// da tentativa (`perguntaId` é o id dentro dela).
export const respostaAbertaDoQuiz = sqliteTable(
  'resposta_aberta_do_quiz',
  {
    id: text('id').primaryKey(),
    tentativaId: text('tentativa_id')
      .notNull()
      .references(() => tentativaDoQuiz.id),
    perguntaId: text('pergunta_id').notNull(),
    // Só nas perguntas de texto livre.
    texto: text('texto'),
    situacao: text('situacao', { enum: ['pendente', 'certa', 'errada'] })
      .default('pendente')
      .notNull(),
    comentario: text('comentario'),
    corrigidaPorId: text('corrigida_por_id').references(() => user.id),
    corrigidaEm: integer('corrigida_em', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('resposta_aberta_tentativa_pergunta_idx').on(
      t.tentativaId,
      t.perguntaId,
    ),
    index('resposta_aberta_situacao_idx').on(t.situacao),
  ],
)

// Arquivo entregue (até 3 por pergunta, 500 MB cada), guardado no R2 em `chave`.
export const arquivoDaResposta = sqliteTable(
  'arquivo_da_resposta',
  {
    id: text('id').primaryKey(),
    tentativaId: text('tentativa_id')
      .notNull()
      .references(() => tentativaDoQuiz.id),
    perguntaId: text('pergunta_id').notNull(),
    chave: text('chave').notNull(),
    nome: text('nome').notNull(),
    tipo: text('tipo').notNull(),
    tamanho: integer('tamanho').notNull(),
    enviadoEm: integer('enviado_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('arquivo_resposta_tentativa_idx').on(t.tentativaId)],
)

// "Liberar nova tentativa": cada linha soma uma tentativa ao limite do aluno naquele quiz, sem
// apagar as já feitas.
export const liberacaoDeTentativa = sqliteTable(
  'liberacao_de_tentativa',
  {
    id: text('id').primaryKey(),
    quizId: text('quiz_id')
      .notNull()
      .references(() => quiz.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    liberadaPorId: text('liberada_por_id')
      .notNull()
      .references(() => user.id),
    liberadaEm: integer('liberada_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('liberacao_quiz_aluno_idx').on(t.quizId, t.userId)],
)

// ---- Vendas por gateway (Voomp #43; Hotmart #127) ----
// `gateway` diz de qual plataforma veio o aviso/ligação; as linhas antigas são todas da Voomp.
// Cada aviso do webhook, gravado ANTES de responder 200 (a Voomp pode não reenviar). `chave` é a
// idempotência: `<id da venda>:<gatilho>` (ou o hash do corpo, sem venda); um aviso repetido não
// cria linha nova. `corpo` é o JSON cru; as colunas soltas são o que a tela e a ligação usam.
export const GATEWAYS = ['voomp', 'hotmart'] as const
export type Gateway = (typeof GATEWAYS)[number]

export const avisoDeVenda = sqliteTable(
  'aviso_de_venda',
  {
    id: text('id').primaryKey(),
    gateway: text('gateway', { enum: GATEWAYS }).default('voomp').notNull(),
    chave: text('chave').notNull(),
    tipo: text('tipo').notNull(),
    gatilho: text('gatilho').notNull(),
    vendaId: text('venda_id'),
    produtoId: text('produto_id'),
    produtoNome: text('produto_nome'),
    ofertaHash: text('oferta_hash'),
    email: text('email'),
    nome: text('nome'),
    corpo: text('corpo').notNull(),
    // recebida = ainda na fila; aplicada; sem_turma (produto sem ligação); ignorada; com_erro.
    situacao: text('situacao', {
      enum: ['recebida', 'aplicada', 'sem_turma', 'ignorada', 'com_erro'],
    })
      .default('recebida')
      .notNull(),
    motivo: text('motivo'),
    // JSON com os ids das turmas em que o aviso mexeu (aplicada).
    turmaIds: text('turma_ids'),
    repeticoes: integer('repeticoes').default(0).notNull(),
    recebidoEm: integer('recebido_em', { mode: 'timestamp_ms' }).notNull(),
    processadoEm: integer('processado_em', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('aviso_de_venda_chave_idx').on(t.gateway, t.chave),
    index('aviso_de_venda_recebido_idx').on(t.recebidoEm),
    index('aviso_de_venda_venda_idx').on(t.gateway, t.vendaId),
    index('aviso_de_venda_produto_idx').on(t.gateway, t.produtoId),
  ],
)

// Produto do gateway (GLOSSARY) ligado a uma turma. `ofertaHash` vazio = o produto inteiro; preenchido,
// a ligação vale só para aquela oferta e SOMA-se às do produto inteiro. `prazoEmDias` nulo
// = vale o prazo da turma.
export const ligacaoDeVenda = sqliteTable(
  'ligacao_de_venda',
  {
    id: text('id').primaryKey(),
    gateway: text('gateway', { enum: GATEWAYS }).default('voomp').notNull(),
    produtoId: text('produto_id').notNull(),
    ofertaHash: text('oferta_hash').default('').notNull(),
    turmaId: text('turma_id')
      .notNull()
      .references(() => turma.id),
    prazoEmDias: integer('prazo_em_dias'),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('ligacao_de_venda_unica_idx').on(
      t.gateway,
      t.produtoId,
      t.ofertaHash,
      t.turmaId,
    ),
    index('ligacao_de_venda_produto_idx').on(t.gateway, t.produtoId),
  ],
)

// Conferência de vendas (#44): cada vez que a equipe sobe a planilha da Voomp. Guarda quem subiu,
// quando, os totais e as vendas que pediam atenção (`pendentes`, JSON), para matricular com um clique
// sem subir a planilha de novo.
export const conferenciaDeVendas = sqliteTable(
  'conferencia_de_vendas',
  {
    id: text('id').primaryKey(),
    autorId: text('autor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    arquivoNome: text('arquivo_nome').notNull(),
    // JSON: coluna da planilha que foi usada para cada campo.
    mapeamento: text('mapeamento').notNull().default('{}'),
    totalLinhas: integer('total_linhas').notNull(),
    totalPagas: integer('total_pagas').notNull(),
    totalMatriculadas: integer('total_matriculadas').notNull(),
    // Pagas sem matrícula e com turma ligada: o que o clique resolve.
    totalSemMatricula: integer('total_sem_matricula').notNull(),
    // Pagas de produto sem ligação com turma (ou desconhecido): ficam esperando a ligação.
    totalSemTurma: integer('total_sem_turma').notNull(),
    // Matrículas feitas por clique nesta conferência (some a cada clique).
    totalAplicadas: integer('total_aplicadas').default(0).notNull(),
    // JSON: vendas que pedem atenção, com a situação de cada uma.
    pendentes: text('pendentes').notNull().default('[]'),
    criadoEm: integer('criado_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('conferencia_vendas_criado_idx').on(t.criadoEm)],
)

// ---- Avaliação de aula (#48) ----
// A nota de 1 a 5 que o aluno dá a uma aula. Um registro por (aluno, aula): avaliar de novo muda
// a nota, não cria linha. `oQueFaltou` só existe com nota 1 ou 2 e só a equipe lê; entra na fila
// "Avaliações para ler" enquanto `lidaEm` estiver vazio. `criadoEm` é a primeira avaliação; `atualizadaEm`, a última
// mudança.
export const avaliacaoDaAula = sqliteTable(
  'avaliacao_da_aula',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    aulaId: text('aula_id')
      .notNull()
      .references(() => aula.id, { onDelete: 'cascade' }),
    nota: integer('nota').notNull(),
    oQueFaltou: text('o_que_faltou'),
    lidaEm: integer('lida_em', { mode: 'timestamp_ms' }),
    lidaPorId: text('lida_por_id').references(() => user.id),
    atualizadaEm: integer('atualizada_em', { mode: 'timestamp_ms' }).notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('avaliacao_aluno_aula_idx').on(t.userId, t.aulaId),
    index('avaliacao_aula_idx').on(t.aulaId),
  ],
)

// ---- E-mails (#45) ----
// Histórico de envios: uma linha por e-mail pedido, do pedido ao retorno. As variáveis (sem segredo:
// o link de entrada nasce na hora do envio) ficam aqui para o envio poder repetir. `status`:
// na-fila (esperando ou em nova tentativa), enviando (reservado por um consumidor; a varredura
// encerra o que passa de 1 h), enviado, bloqueado (ambiente de testes fora da lista),
// ignorado (o aluno se descadastrou), falhou (esgotou as tentativas), retornou (voltou: bounce ou
// reclamação).
export const envioDeEmail = sqliteTable(
  'envio_de_email',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    para: text('para').notNull(),
    tipo: text('tipo').notNull(),
    variaveis: text('variaveis').notNull().default('{}'),
    assunto: text('assunto'),
    status: text('status', {
      enum: [
        'na-fila',
        'enviando',
        'enviado',
        'bloqueado',
        'ignorado',
        'falhou',
        'retornou',
      ],
    })
      .default('na-fila')
      .notNull(),
    provedor: text('provedor'),
    idDoProvedor: text('id_do_provedor'),
    tentativas: integer('tentativas').default(0).notNull(),
    erro: text('erro'),
    retorno: text('retorno'),
    criadoEm: integer('criado_em', { mode: 'timestamp_ms' }).notNull(),
    enviadoEm: integer('enviado_em', { mode: 'timestamp_ms' }),
    retornoEm: integer('retorno_em', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('envio_email_user_idx').on(t.userId, t.criadoEm),
    index('envio_email_provedor_idx').on(t.idDoProvedor),
  ],
)

// Texto editado pelo Proprietário para um e-mail (assunto e corpo com variáveis `{{nome}}`).
// Sem linha aqui vale o texto padrão do registro (`src/regras/email-modelos.ts`).
export const textoDeEmail = sqliteTable('texto_de_email', {
  tipo: text('tipo').primaryKey(),
  assunto: text('assunto').notNull(),
  corpo: text('corpo').notNull(),
  atualizadoPor: text('atualizado_por').references(() => user.id, {
    onDelete: 'set null',
  }),
  atualizadoEm: integer('atualizado_em', { mode: 'timestamp_ms' }).notNull(),
})

// Tipos de e-mail que o aluno desligou (descadastro por link ou em Minha conta).
export const emailDesligado = sqliteTable(
  'email_desligado',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    desligadoEm: integer('desligado_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tipo] })],
)

// Avisos esperando a janela de agrupamento (15 minutos) para virar um e-mail só.
// Regra em `src/regras/agrupamento.ts`; os gatilhos são das fatias de comentários, Atendimento e certificado.
export const avisoAgrupado = sqliteTable(
  'aviso_agrupado',
  {
    id: text('id').primaryKey(),
    chave: text('chave').notNull(),
    dados: text('dados').notNull().default('{}'),
    criadoEm: integer('criado_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('aviso_agrupado_chave_idx').on(t.chave, t.criadoEm)],
)

// ---- Sininho e avisos agendados (#46) ----

// Aviso do sininho: um por pessoa, com tipo, texto, link e quando foi lido (nulo = não lido).
// Regra em `src/regras/notificacoes.ts`; as outras fatias chamam `notificar`.
export const notificacao = sqliteTable(
  'notificacao',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    texto: text('texto').notNull(),
    // Caminho dentro da área (ex.: `/cursos/abc`); nulo = o aviso não leva a lugar nenhum.
    link: text('link'),
    lidaEm: integer('lida_em', { mode: 'timestamp_ms' }),
    criadoEm: integer('criado_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('notificacao_pessoa_idx').on(t.userId, t.lidaEm, t.criadoEm)],
)

// Aviso agendado que já saiu para a pessoa, para valer "uma vez por ciclo". `ciclo` identifica o
// ciclo (ex.: matrícula + data de expiração); o índice único impede repetir.
export const avisoEnviado = sqliteTable(
  'aviso_enviado',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    ciclo: text('ciclo').notNull(),
    criadoEm: integer('criado_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('aviso_enviado_ciclo_idx').on(t.userId, t.tipo, t.ciclo)],
)

// Ajustes dos avisos agendados que a equipe edita: `chave` -> número de dias. Sem linha vale o
// padrão de `src/regras/avisos-agendados.ts`. `ligado` (padrão ligado) vale para os avisos que a
// equipe pode desligar ("acesso pronto" e "sentimos sua falta").
export const ajusteDeAviso = sqliteTable('ajuste_de_aviso', {
  chave: text('chave').primaryKey(),
  valor: integer('valor').notNull(),
  ligado: integer('ligado', { mode: 'boolean' }).default(true).notNull(),
  atualizadoEm: integer('atualizado_em', { mode: 'timestamp_ms' }).notNull(),
})

// Marcos que as rotinas de aviso guardam entre uma execução e outra (ex.: último instante de
// liberação já processado; última contagem de uma fila). `numero` é ms de época ou uma contagem.
export const estadoDeAviso = sqliteTable('estado_de_aviso', {
  chave: text('chave').primaryKey(),
  numero: integer('numero').notNull(),
  atualizadoEm: integer('atualizado_em', { mode: 'timestamp_ms' }).notNull(),
})
// ---- Atendimento (#58) ----
// Conversa entre um aluno (ou Visitante, sem conta) e a equipe. `userId` nulo = Visitante, que
// responde por e-mail (`visitanteEmail`). `codigo` é o identificador curto que vai no assunto dos
// e-mails ("[Atendimento #K3F9QX]"): responder o e-mail continua a mesma conversa. `estado`: aberta
// (espera a equipe), respondida (espera o aluno), resolvida (a equipe fechou). `ultimaMensagemEm`
// ordena a fila. Exclusão protegida (`excluidoEm`).
export const conversaDeAtendimento = sqliteTable(
  'conversa_de_atendimento',
  {
    id: text('id').primaryKey(),
    codigo: text('codigo').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    visitanteEmail: text('visitante_email'),
    visitanteNome: text('visitante_nome'),
    cursoId: text('curso_id').references(() => curso.id, {
      onDelete: 'set null',
    }),
    assunto: text('assunto').notNull(),
    estado: text('estado', { enum: ['aberta', 'respondida', 'resolvida'] })
      .default('aberta')
      .notNull(),
    // Por onde a conversa nasceu: a área ou um e-mail ao suporte@/help@.
    canal: text('canal', { enum: ['area', 'email'] })
      .default('area')
      .notNull(),
    ultimaMensagemEm: integer('ultima_mensagem_em', {
      mode: 'timestamp_ms',
    }).notNull(),
    resolvidaEm: integer('resolvida_em', { mode: 'timestamp_ms' }),
    criadoEm: criadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [
    uniqueIndex('conversa_codigo_idx').on(t.codigo),
    index('conversa_user_idx').on(t.userId, t.criadoEm),
    index('conversa_visitante_idx').on(t.visitanteEmail),
    index('conversa_estado_idx').on(t.estado, t.ultimaMensagemEm),
  ],
)

// Mensagem da conversa. `autor`: aluno, visitante ou equipe. `anexos` é JSON com as chaves das
// imagens no R2. `origem`: escrita na área ou chegada por e-mail.
export const mensagemDeAtendimento = sqliteTable(
  'mensagem_de_atendimento',
  {
    id: text('id').primaryKey(),
    conversaId: text('conversa_id')
      .notNull()
      .references(() => conversaDeAtendimento.id, { onDelete: 'cascade' }),
    autor: text('autor', { enum: ['aluno', 'visitante', 'equipe'] }).notNull(),
    autorId: text('autor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    texto: text('texto').notNull(),
    anexos: text('anexos').notNull().default('[]'),
    origem: text('origem', { enum: ['area', 'email'] })
      .default('area')
      .notNull(),
    // Chave contra clique duplo, gerada pela tela a cada formulário (nula nas mensagens que chegam
    // por e-mail). Única por autor: o mesmo envio repetido é a mesma mensagem.
    chaveDeEnvio: text('chave_de_envio'),
    criadoEm: integer('criado_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('mensagem_conversa_idx').on(t.conversaId, t.criadoEm),
    uniqueIndex('mensagem_envio_idx').on(t.autorId, t.chaveDeEnvio),
  ],
)

// ---- Comentários nas aulas (#47) ----
// Comentário em texto simples, com resposta de um nível (`paiId` só aponta para comentário sem pai).
// `chaveDeEnvio` é gerada pela tela a cada formulário e protege contra clique duplo (única por
// autor). Exclusão protegida: `excluidoEm`. Regra em `src/regras/comentarios.ts`.
export const comentarioDaAula = sqliteTable(
  'comentario_da_aula',
  {
    id: text('id').primaryKey(),
    aulaId: text('aula_id')
      .notNull()
      .references(() => aula.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    paiId: text('pai_id').references(
      (): AnySQLiteColumn => comentarioDaAula.id,
      {
        onDelete: 'cascade',
      },
    ),
    texto: text('texto').notNull(),
    chaveDeEnvio: text('chave_de_envio'),
    // Só a equipe fixa, e só comentário (não resposta).
    fixadoEm: integer('fixado_em', { mode: 'timestamp_ms' }),
    editadoEm: integer('editado_em', { mode: 'timestamp_ms' }),
    criadoEm: criadoEm(),
    excluidoEm: excluidoEm(),
  },
  (t) => [
    index('comentario_aula_idx').on(t.aulaId, t.criadoEm),
    index('comentario_pai_idx').on(t.paiId),
    index('comentario_autor_idx').on(t.userId),
    uniqueIndex('comentario_chave_idx').on(t.userId, t.chaveDeEnvio),
  ],
)

// Comentários desligados pela equipe numa aula ou num módulo inteiro. Uma linha por alvo; religar
// apaga a linha.
export const comentariosDesligados = sqliteTable(
  'comentarios_desligados',
  {
    alvoTipo: text('alvo_tipo', { enum: ['aula', 'modulo'] }).notNull(),
    alvoId: text('alvo_id').notNull(),
    autorId: text('autor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    desligadoEm: integer('desligado_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.alvoTipo, t.alvoId] })],
)

// ---- Pontos (#54) ----
// Um lançamento por origem: aula concluída, comentário (a origem é a aula, uma vez por aula),
// avaliação, quiz, melhor resposta (origem é o comentário da comunidade) ou avulso (sem origem,
// com motivo e autor da Equipe). `cursoId` nulo = pontos gerais. A origem que some marca
// `estornadoEm` (o lançamento sai dos saldos mas fica no banco); fazer de novo reativa a mesma linha,
// por isso repetir uma ação não pontua duas vezes. Pontos avulsos podem ser negativos.
export const lancamentoDePontos = sqliteTable(
  'lancamento_de_pontos',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    cursoId: text('curso_id').references(() => curso.id),
    origemTipo: text('origem_tipo', {
      enum: [
        'aula',
        'comentario',
        'avaliacao',
        'quiz',
        'melhor-resposta',
        'avulso',
      ],
    }).notNull(),
    // Nulo só no avulso (o índice único trata nulos como diferentes).
    origemId: text('origem_id'),
    pontos: integer('pontos').notNull(),
    motivo: text('motivo'),
    autorId: text('autor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    estornadoEm: integer('estornado_em', { mode: 'timestamp_ms' }),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('lancamento_origem_idx').on(t.userId, t.origemTipo, t.origemId),
    index('lancamento_aluno_idx').on(t.userId, t.cursoId),
    index('lancamento_curso_idx').on(t.cursoId),
  ],
)

// Modelo do curso: imagem da frente e verso opcional (chaves no R2, só PNG ou JPEG) e a posição dos
// campos (JSON, ver `src/regras/certificados.ts`). Só gera certificado com `ativo`.
export const modeloDeCertificado = sqliteTable(
  'modelo_de_certificado',
  {
    id: text('id').primaryKey(),
    cursoId: text('curso_id')
      .notNull()
      .references(() => curso.id),
    ativo: integer('ativo', { mode: 'boolean' }).default(false).notNull(),
    frente: text('frente'),
    verso: text('verso'),
    campos: text('campos').notNull().default('[]'),
    atualizadoEm: integer('atualizado_em', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [uniqueIndex('modelo_certificado_curso_idx').on(t.cursoId)],
)

// Um certificado por aluno e curso. `nome`, `cursoNome` e `concluidoEm` ficam gravados como na
// emissão. O PDF mora no R2 (`pdfChave`); `pdfEstado` diz se ainda está gerando. Revogado = a página
// pública mostra "Revogado" (só o Proprietário revoga, com motivo).
export const certificado = sqliteTable(
  'certificado',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    cursoId: text('curso_id')
      .notNull()
      .references(() => curso.id),
    codigo: text('codigo').notNull(),
    nome: text('nome').notNull(),
    cursoNome: text('curso_nome').notNull(),
    concluidoEm: integer('concluido_em', { mode: 'timestamp_ms' }).notNull(),
    emitidoEm: integer('emitido_em', { mode: 'timestamp_ms' }).notNull(),
    pdfEstado: text('pdf_estado', { enum: ['gerando', 'pronto', 'falhou'] })
      .default('gerando')
      .notNull(),
    pdfChave: text('pdf_chave'),
    pdfGeradoEm: integer('pdf_gerado_em', { mode: 'timestamp_ms' }),
    // Quando o aluno foi avisado (sininho e e-mail); nulo = ainda não.
    avisadoEm: integer('avisado_em', { mode: 'timestamp_ms' }),
    revogadoEm: integer('revogado_em', { mode: 'timestamp_ms' }),
    revogadoMotivo: text('revogado_motivo'),
    revogadoPorId: text('revogado_por_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    uniqueIndex('certificado_codigo_idx').on(t.codigo),
    uniqueIndex('certificado_aluno_curso_idx').on(t.userId, t.cursoId),
    index('certificado_curso_idx').on(t.cursoId),
  ],
)

// ---- Pedido do MEC (#56) ----
// Nasce quando a área emite o certificado próprio de um curso que gera Pedido do MEC (a Formação).
// A equipe libera o certificado na Voomp à mão e marca aqui: Na fila -> Liberado, ou Problema (com
// motivo e uma conversa do Atendimento com a aluna) -> "tentar de novo" volta para Na fila.
// `naFilaDesde` é o início da contagem dos dias úteis (recomeça no "tentar de novo");
// `destacadoEm` marca que o cron já avisou a equipe do atraso (um aviso por espera).
export const pedidoDoMec = sqliteTable(
  'pedido_do_mec',
  {
    id: text('id').primaryKey(),
    certificadoId: text('certificado_id')
      .notNull()
      .references(() => certificado.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    cursoId: text('curso_id')
      .notNull()
      .references(() => curso.id),
    estado: text('estado', { enum: ['na_fila', 'liberado', 'problema'] })
      .default('na_fila')
      .notNull(),
    criadoEm: integer('criado_em', { mode: 'timestamp_ms' }).notNull(),
    naFilaDesde: integer('na_fila_desde', { mode: 'timestamp_ms' }).notNull(),
    destacadoEm: integer('destacado_em', { mode: 'timestamp_ms' }),
    liberadoEm: integer('liberado_em', { mode: 'timestamp_ms' }),
    // Link do certificado do MEC na Voomp, informado ao liberar.
    linkDaVoomp: text('link_da_voomp'),
    problemaMotivo: text('problema_motivo'),
    problemaEm: integer('problema_em', { mode: 'timestamp_ms' }),
    // Conversa do Atendimento aberta com a aluna no "Problema" (sem FK: a conversa pode sair antes).
    conversaId: text('conversa_id'),
  },
  (t) => [
    uniqueIndex('pedido_do_mec_certificado_idx').on(t.certificadoId),
    index('pedido_do_mec_estado_idx').on(t.estado, t.naFilaDesde),
    index('pedido_do_mec_aluno_idx').on(t.userId),
  ],
)

// ---- Comunidades (#59) ----

// Fórum criado pela Equipe. Sem linha em `comunidade_turma` é pública (todo aluno com matrícula
// ativa); com linhas, só quem tem matrícula ativa numa dessas turmas. `soEquipePublica` deixa o
// aluno só comentar. `icone` e `cor` vêm das listas de `src/regras/comunidades.ts`.
export const comunidade = sqliteTable('comunidade', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  descricao: text('descricao'),
  icone: text('icone').notNull(),
  cor: text('cor').notNull(),
  soEquipePublica: integer('so_equipe_publica', { mode: 'boolean' })
    .default(false)
    .notNull(),
  excluidoEm: excluidoEm(),
  criadoEm: criadoEm(),
})

export const comunidadeTurma = sqliteTable(
  'comunidade_turma',
  {
    comunidadeId: text('comunidade_id')
      .notNull()
      .references(() => comunidade.id, { onDelete: 'cascade' }),
    turmaId: text('turma_id')
      .notNull()
      .references(() => turma.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.comunidadeId, t.turmaId] })],
)

// Publicação: o tópico. Resolvida = tem `melhorRespostaId` (sem chave estrangeira de propósito: o
// comentário aponta de volta para a publicação). `chaveDeEnvio` é a chave contra clique duplo:
// o mesmo autor com a mesma chave é a mesma publicação. `ultimaAtividadeEm` ordena "Mais ativas".
export const publicacao = sqliteTable(
  'publicacao',
  {
    id: text('id').primaryKey(),
    comunidadeId: text('comunidade_id')
      .notNull()
      .references(() => comunidade.id, { onDelete: 'cascade' }),
    autorId: text('autor_id')
      .notNull()
      .references(() => user.id),
    titulo: text('titulo').notNull(),
    textoHtml: text('texto_html').notNull(),
    fixada: integer('fixada', { mode: 'boolean' }).default(false).notNull(),
    comentariosBloqueados: integer('comentarios_bloqueados', {
      mode: 'boolean',
    })
      .default(false)
      .notNull(),
    melhorRespostaId: text('melhor_resposta_id'),
    chaveDeEnvio: text('chave_de_envio').notNull(),
    editadaEm: integer('editada_em', { mode: 'timestamp_ms' }),
    ultimaAtividadeEm: integer('ultima_atividade_em', {
      mode: 'timestamp_ms',
    }).notNull(),
    excluidoEm: excluidoEm(),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('publicacao_envio_idx').on(t.autorId, t.chaveDeEnvio),
    index('publicacao_comunidade_idx').on(t.comunidadeId, t.ultimaAtividadeEm),
  ],
)

// Comentário da publicação: texto simples, com resposta de um nível (`paiId` aponta para um
// comentário de primeiro nível da mesma publicação).
export const comentarioDaPublicacao = sqliteTable(
  'comentario_da_publicacao',
  {
    id: text('id').primaryKey(),
    publicacaoId: text('publicacao_id')
      .notNull()
      .references(() => publicacao.id, { onDelete: 'cascade' }),
    autorId: text('autor_id')
      .notNull()
      .references(() => user.id),
    paiId: text('pai_id'),
    texto: text('texto').notNull(),
    chaveDeEnvio: text('chave_de_envio').notNull(),
    editadoEm: integer('editado_em', { mode: 'timestamp_ms' }),
    excluidoEm: excluidoEm(),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('comentario_publicacao_envio_idx').on(
      t.autorId,
      t.chaveDeEnvio,
    ),
    index('comentario_publicacao_idx').on(t.publicacaoId, t.criadoEm),
  ],
)

// Anexo da publicação (até 3, 10 MB cada), guardado no R2.
export const anexoDaPublicacao = sqliteTable(
  'anexo_da_publicacao',
  {
    id: text('id').primaryKey(),
    publicacaoId: text('publicacao_id')
      .notNull()
      .references(() => publicacao.id, { onDelete: 'cascade' }),
    chave: text('chave').notNull(),
    nome: text('nome').notNull(),
    tipo: text('tipo').notNull(),
    tamanho: integer('tamanho').notNull(),
    criadoEm: criadoEm(),
    // Anexo tirado ao editar a publicação: exclusão protegida de 30 dias.
    excluidoEm: excluidoEm(),
  },
  (t) => [index('anexo_publicacao_idx').on(t.publicacaoId)],
)

// Quem segue (recebe no sininho os comentários novos) ou silenciou a publicação. Autor e quem
// comenta passam a seguir sozinhos; silenciar vale até a pessoa voltar a seguir.
export const seguidorDaPublicacao = sqliteTable(
  'seguidor_da_publicacao',
  {
    publicacaoId: text('publicacao_id')
      .notNull()
      .references(() => publicacao.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    situacao: text('situacao', { enum: ['seguindo', 'silenciada'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.publicacaoId, t.userId] })],
)

// Quando a pessoa viu a publicação pela última vez ("Não lidas": atividade depois disso).
export const leituraDaPublicacao = sqliteTable(
  'leitura_da_publicacao',
  {
    publicacaoId: text('publicacao_id')
      .notNull()
      .references(() => publicacao.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    lidaEm: integer('lida_em', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.publicacaoId, t.userId] })],
)
