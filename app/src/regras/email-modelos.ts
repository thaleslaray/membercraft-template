// Registro central dos e-mails da área: para cada um, quando sai, quem recebe, se tem descadastro,
// as variáveis que aceita e o texto padrão (assunto + corpo). O Proprietário pode trocar o texto
// (tabela `texto_de_email`), menos o do código de acesso, que é travado.
//
// Cada fatia de gatilho (#46, #47, #58...) só precisa do `tipo` daqui: pede o e-mail com
// `enfileirarEmail` e passa os valores das variáveis. O texto, a prévia e o descadastro já estão aqui.

import { appConfig } from '#/config/app'
import { escapeHtml, layout } from '#/lib/email-templates'

export type TipoDeEmail =
  | 'codigo'
  | 'curso-liberado'
  | 'cursos-liberados'
  | 'conteudo-liberado'
  | 'resposta-do-atendimento'
  | 'certificado-emitido'
  | 'certificado-mec-liberado'
  | 'troca-de-email'
  | 'acesso-pronto'
  | 'sentimos-sua-falta'
  | 'acesso-expirando'
  | 'resposta-ao-comentario'
  | 'aviso-de-atendimento'
  | 'resumo-diario'

export interface VariavelDeEmail {
  descricao: string
  /** Valor usado na prévia. */
  exemplo: string
}

export interface ModeloDeEmail {
  tipo: TipoDeEmail
  nome: string
  destino: 'aluno' | 'equipe'
  /** Quando sai, em uma frase (aparece na tela de edição). */
  quando: string
  /** Só estes têm link de descadastro no rodapé e interruptor em Minha conta. */
  descadastro: boolean
  /** O texto pode ser editado pelo Proprietário. */
  editavel: boolean
  /** `{{link}}` é um link de entrada de uso único (24 h), gerado na hora do envio. */
  linkDeEntrada: boolean
  variaveis: Record<string, VariavelDeEmail>
  assunto: string
  corpo: string
}

const NOME: VariavelDeEmail = {
  descricao: 'Primeiro nome da pessoa',
  exemplo: 'Marina',
}
const LINK_AREA: VariavelDeEmail = {
  descricao: 'Link para abrir a área',
  exemplo: `${appConfig.url}/`,
}
const LINK_ENTRADA: VariavelDeEmail = {
  descricao:
    'Link de entrada: abre a área sem digitar código (uso único, vale 24 horas)',
  exemplo: `${appConfig.url}/entrar`,
}

const base = {
  destino: 'aluno',
  descadastro: false,
  editavel: true,
  linkDeEntrada: false,
} as const

export const MODELOS_DE_EMAIL: readonly ModeloDeEmail[] = [
  {
    ...base,
    tipo: 'codigo',
    nome: 'Código de acesso',
    quando: 'A cada pedido de código na tela de login. O texto é travado.',
    editavel: false,
    variaveis: {
      codigo: { descricao: 'Código de 6 dígitos', exemplo: '123456' },
    },
    assunto: '{{codigo}} é seu código de acesso',
    corpo:
      'Use o código abaixo para entrar. Ele vale por 10 minutos.\n\n{{codigo}}\n\nSe você não pediu este código, ignore este e-mail.',
  },
  {
    ...base,
    tipo: 'curso-liberado',
    nome: 'Curso liberado',
    quando: 'A cada matrícula nova (venda paga ou matrícula manual).',
    linkDeEntrada: true,
    variaveis: {
      nome: NOME,
      curso: { descricao: 'Nome do curso', exemplo: 'Estilo na prática' },
      link: LINK_ENTRADA,
    },
    assunto: 'Seu acesso a {{curso}} está liberado',
    corpo:
      'Oi, {{nome}}!\n\nSeu acesso a {{curso}} está liberado. Clique no link para entrar:\n\n{{link}}\n\nO link vale por 24 horas e só funciona uma vez. Depois, é só pedir um código na tela de login.',
  },
  {
    ...base,
    tipo: 'cursos-liberados',
    nome: 'Cursos liberados',
    quando: 'Quando uma compra libera mais de um curso.',
    linkDeEntrada: true,
    variaveis: {
      nome: NOME,
      cursos: {
        descricao: 'Lista dos cursos liberados, um por linha',
        exemplo: '• Estilo na prática\n• Coloração pessoal',
      },
      link: LINK_ENTRADA,
    },
    assunto: 'Seu acesso está liberado',
    corpo:
      'Oi, {{nome}}!\n\nSua compra liberou estes cursos:\n\n{{cursos}}\n\nClique no link para entrar:\n\n{{link}}\n\nO link vale por 24 horas e só funciona uma vez. Depois, é só pedir um código na tela de login.',
  },
  {
    ...base,
    tipo: 'conteudo-liberado',
    nome: 'Conteúdo liberado',
    quando: 'Quando chega a data de liberação de um módulo ou aula.',
    variaveis: {
      nome: NOME,
      curso: { descricao: 'Nome do curso', exemplo: 'Estilo na prática' },
      conteudo: { descricao: 'Módulo ou aula que abriu', exemplo: 'Módulo 2' },
      link: LINK_AREA,
    },
    assunto: 'Novo conteúdo em {{curso}}',
    corpo:
      'Oi, {{nome}}!\n\n{{conteudo}} de {{curso}} acabou de ser liberado.\n\n{{link}}',
  },
  {
    ...base,
    tipo: 'resposta-do-atendimento',
    nome: 'Resposta do atendimento',
    quando: 'A cada resposta da equipe numa conversa do Atendimento.',
    variaveis: {
      nome: NOME,
      assuntoDaConversa: {
        descricao: 'Assunto da conversa',
        exemplo: 'Não consigo entrar',
      },
      resposta: {
        descricao: 'O texto que a equipe escreveu',
        exemplo: 'Já liberei o seu acesso. Tente entrar de novo.',
      },
      link: LINK_AREA,
    },
    assunto: 'Resposta ao seu atendimento: {{assuntoDaConversa}}',
    corpo:
      'Oi, {{nome}}!\n\nRespondemos à sua conversa "{{assuntoDaConversa}}":\n\n{{resposta}}\n\nPara continuar, responda este e-mail ou abra a conversa na área:\n\n{{link}}',
  },
  {
    ...base,
    tipo: 'certificado-emitido',
    nome: 'Certificado emitido',
    quando: 'Na emissão do certificado.',
    variaveis: {
      nome: NOME,
      curso: { descricao: 'Nome do curso', exemplo: 'Estilo na prática' },
      link: LINK_AREA,
    },
    assunto: 'Seu certificado de {{curso}} está pronto',
    corpo:
      'Parabéns, {{nome}}!\n\nSeu certificado de {{curso}} está pronto para baixar:\n\n{{link}}',
  },
  {
    ...base,
    tipo: 'certificado-mec-liberado',
    nome: 'Certificado do MEC liberado',
    quando: 'Quando a equipe marca o Pedido do MEC como liberado.',
    variaveis: {
      nome: NOME,
      curso: { descricao: 'Nome do curso', exemplo: 'Formação' },
      link: LINK_AREA,
    },
    assunto: 'Seu certificado do MEC foi liberado',
    corpo:
      'Oi, {{nome}}!\n\nSeu certificado do MEC de {{curso}} foi liberado.\n\n{{link}}',
  },
  {
    ...base,
    tipo: 'troca-de-email',
    nome: 'Troca de e-mail',
    quando:
      'Quando a equipe troca o e-mail do aluno. Vai ao endereço antigo e ao novo.',
    variaveis: {
      nome: NOME,
      emailAntigo: {
        descricao: 'E-mail de antes',
        exemplo: 'marina@exemplo.com',
      },
      emailNovo: {
        descricao: 'E-mail de agora',
        exemplo: 'marina.silva@exemplo.com',
      },
    },
    assunto: 'O e-mail da sua conta foi trocado',
    corpo:
      'Oi, {{nome}}!\n\nO e-mail da sua conta mudou de {{emailAntigo}} para {{emailNovo}}. Daqui em diante, entre com {{emailNovo}}.\n\nSe você não pediu esta troca, responda este e-mail.',
  },
  {
    ...base,
    tipo: 'acesso-pronto',
    nome: 'Seu acesso está pronto',
    quando:
      '3 dias depois da matrícula, se o aluno nunca entrou. Também sai no "Reenviar link de acesso".',
    linkDeEntrada: true,
    variaveis: { nome: NOME, link: LINK_ENTRADA },
    assunto: 'Seu acesso está pronto',
    corpo:
      'Oi, {{nome}}!\n\nSeu acesso à área está pronto. Clique no link para entrar:\n\n{{link}}\n\nO link vale por 24 horas e só funciona uma vez. Depois, é só pedir um código na tela de login.',
  },
  {
    ...base,
    tipo: 'sentimos-sua-falta',
    nome: 'Sentimos sua falta',
    quando: '14 dias sem acessar.',
    descadastro: true,
    variaveis: {
      nome: NOME,
      dias: { descricao: 'Dias sem acessar', exemplo: '14' },
      link: LINK_AREA,
    },
    assunto: 'Sentimos sua falta, {{nome}}',
    corpo:
      'Oi, {{nome}}!\n\nFaz {{dias}} dias que você não aparece por aqui. Seus cursos estão esperando:\n\n{{link}}',
  },
  {
    ...base,
    tipo: 'acesso-expirando',
    nome: 'Acesso expirando',
    quando: '7 dias antes de a matrícula expirar.',
    descadastro: true,
    variaveis: {
      nome: NOME,
      curso: { descricao: 'Nome do curso', exemplo: 'Estilo na prática' },
      data: { descricao: 'Data em que o acesso expira', exemplo: '14/11/2026' },
      link: LINK_AREA,
    },
    assunto: 'Seu acesso a {{curso}} expira em breve',
    corpo:
      'Oi, {{nome}}!\n\nSeu acesso a {{curso}} expira em {{data}}. Aproveite para terminar o que falta:\n\n{{link}}',
  },
  {
    ...base,
    tipo: 'resposta-ao-comentario',
    nome: 'Resposta ao comentário',
    quando:
      'Quando respondem um comentário seu. As respostas de 15 minutos saem juntas num e-mail só.',
    descadastro: true,
    variaveis: {
      nome: NOME,
      quantidade: { descricao: 'Quantas respostas chegaram', exemplo: '2' },
      respostas: {
        descricao: 'Lista das respostas, uma por linha',
        exemplo: 'Ana: Adorei a dica!\nBia: Também uso assim.',
      },
      link: LINK_AREA,
    },
    assunto: 'Responderam o seu comentário',
    corpo:
      'Oi, {{nome}}!\n\nVocê recebeu {{quantidade}} resposta(s) ao seu comentário:\n\n{{respostas}}\n\n{{link}}',
  },
  {
    ...base,
    tipo: 'aviso-de-atendimento',
    nome: 'Aviso de Atendimento (equipe)',
    destino: 'equipe',
    quando:
      'Conversa nova ou mensagem de aluno no Atendimento, agrupado em 15 minutos. O botão de desligar fica na fila do Atendimento, no painel.',
    variaveis: {
      nome: NOME,
      quantidade: { descricao: 'Quantas mensagens novas', exemplo: '3' },
      link: LINK_AREA,
    },
    assunto: '{{quantidade}} mensagem(ns) nova(s) no Atendimento',
    corpo:
      'Oi, {{nome}}!\n\nChegaram {{quantidade}} mensagem(ns) nova(s) no Atendimento:\n\n{{link}}',
  },
  {
    ...base,
    tipo: 'resumo-diario',
    nome: 'Resumo diário (equipe)',
    destino: 'equipe',
    quando:
      'Todo dia às 8h (Brasília), só quando há pendências. Cada pessoa da equipe desliga o seu em Resumo diário, no Estúdio.',
    variaveis: {
      nome: NOME,
      resumo: {
        descricao: 'Pendências de cada fila, uma por linha',
        exemplo: 'Atendimentos abertos: 2\nAguardando correção: 5',
      },
      link: LINK_AREA,
    },
    assunto: 'Resumo do dia: o que está esperando',
    corpo:
      'Bom dia, {{nome}}!\n\nO que está esperando hoje:\n\n{{resumo}}\n\n{{link}}',
  },
]

/** Primeiro nome para o "Oi, {{nome}}"; conta criada só com o e-mail ainda não tem nome. */
export function primeiroNome(nome: string | null | undefined): string {
  return nome?.trim().split(/\s+/)[0] || 'aluno(a)'
}

/** Uma compra com 1 curso usa o modelo de sempre; com 2 ou mais, um e-mail só com a lista. */
export function tipoDoEmailDeLiberacao(
  quantidadeDeCursos: number,
): 'curso-liberado' | 'cursos-liberados' {
  return quantidadeDeCursos > 1 ? 'cursos-liberados' : 'curso-liberado'
}

/** Valor de `{{cursos}}`: uma linha por curso, começando com "• ". */
export function listaDeCursos(nomes: readonly string[]): string {
  return nomes.map((n) => `• ${n}`).join('\n')
}

export class ErroDeEmail extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeEmail'
  }
}

export function modeloDe(tipo: string): ModeloDeEmail {
  const achado = MODELOS_DE_EMAIL.find((m) => m.tipo === tipo)
  if (!achado) throw new ErroDeEmail(`E-mail desconhecido: ${tipo}.`)
  return achado
}

export interface TextoDeEmail {
  assunto: string
  corpo: string
}

// ---------- Variáveis ----------

const VARIAVEL = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g

export function variaveisUsadas(texto: string): string[] {
  return [...new Set([...texto.matchAll(VARIAVEL)].map((m) => m[1] as string))]
}

/** Confere o texto que o Proprietário digitou: nada vazio, só variáveis do e-mail, link de entrada presente. */
export function validarTexto(
  modelo: ModeloDeEmail,
  texto: TextoDeEmail,
): TextoDeEmail {
  if (!modelo.editavel) {
    throw new ErroDeEmail(
      `O texto de "${modelo.nome}" é travado e não pode ser editado.`,
    )
  }
  const assunto = texto.assunto.trim()
  const corpo = texto.corpo.trim()
  if (!assunto) throw new ErroDeEmail('Escreva o assunto do e-mail.')
  if (assunto.length > 200)
    throw new ErroDeEmail('O assunto pode ter no máximo 200 caracteres.')
  if (!corpo) throw new ErroDeEmail('Escreva o texto do e-mail.')
  if (corpo.length > 5000)
    throw new ErroDeEmail('O texto pode ter no máximo 5.000 caracteres.')
  const desconhecidas = variaveisUsadas(`${assunto}\n${corpo}`).filter(
    (v) => !(v in modelo.variaveis),
  )
  if (desconhecidas.length) {
    throw new ErroDeEmail(
      `Variável desconhecida: ${desconhecidas.map((v) => `{{${v}}}`).join(', ')}. Use só ${Object.keys(
        modelo.variaveis,
      )
        .map((v) => `{{${v}}}`)
        .join(', ')}.`,
    )
  }
  if (variaveisUsadas(assunto).includes('link')) {
    throw new ErroDeEmail('O link não pode ficar no assunto.')
  }
  if (modelo.linkDeEntrada && !variaveisUsadas(corpo).includes('link')) {
    throw new ErroDeEmail(
      'O texto precisa ter {{link}}: é por ele que a pessoa entra.',
    )
  }
  return { assunto, corpo }
}

function substituir(
  texto: string,
  valores: Record<string, string>,
  como: (valor: string, nome: string) => string,
): string {
  return texto.replace(VARIAVEL, (_, nome: string) =>
    como(valores[nome] ?? '', nome),
  )
}

// ---------- Montagem ----------

export interface EmailMontado {
  subject: string
  html: string
  text: string
}

export interface OpcoesDeMontagem {
  /** Link de descadastro do rodapé; só entra nos modelos com `descadastro`. */
  linkDeDescadastro?: string
}

function paragrafosEmHtml(
  corpo: string,
  valores: Record<string, string>,
): string {
  return corpo
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const html = substituir(p, valores, (valor, nome) =>
        nome === 'link' && valor
          ? `<a href="${escapeHtml(valor)}" style="color:#1f2937;font-weight:600">${escapeHtml(valor)}</a>`
          : escapeHtml(valor),
      )
      return `<p style="margin:0 0 16px">${html.replaceAll('\n', '<br>')}</p>`
    })
    .join('\n')
}

/** Monta assunto, HTML e texto: o texto vigente (editado ou padrão) com as variáveis preenchidas. */
export function montarEmail(
  modelo: ModeloDeEmail,
  texto: TextoDeEmail | undefined,
  valores: Record<string, string>,
  opcoes: OpcoesDeMontagem = {},
): EmailMontado {
  const vigente = texto ?? { assunto: modelo.assunto, corpo: modelo.corpo }
  // O assunto e o texto puro levam o valor como está; o HTML escapa.
  const subject = substituir(vigente.assunto, valores, (v) => v)
    .replace(/\s+/g, ' ')
    .trim()
  const rodapeTexto =
    modelo.descadastro && opcoes.linkDeDescadastro
      ? `\n\nNão quer mais receber este e-mail? Desligue aqui: ${opcoes.linkDeDescadastro}`
      : ''
  const text = `${substituir(vigente.corpo, valores, (v) => v).trim()}${rodapeTexto}\n\n${appConfig.name}`
  const rodapeHtml =
    modelo.descadastro && opcoes.linkDeDescadastro
      ? `<br><a href="${escapeHtml(opcoes.linkDeDescadastro)}" style="color:#6b7280">Não quer mais receber este e-mail? Desligue aqui.</a>`
      : ''
  const html = layout({
    title: subject,
    bodyHtml: paragrafosEmHtml(vigente.corpo, valores),
    rodapeHtml,
  })
  return { subject, html, text }
}

/** Prévia: o mesmo caminho do envio, com os valores de exemplo. */
export function previaDoEmail(
  modelo: ModeloDeEmail,
  texto?: TextoDeEmail,
): EmailMontado {
  const exemplos = Object.fromEntries(
    Object.entries(modelo.variaveis).map(([nome, v]) => [nome, v.exemplo]),
  )
  return montarEmail(modelo, texto, exemplos, {
    linkDeDescadastro: `${appConfig.url}/descadastrar`,
  })
}
