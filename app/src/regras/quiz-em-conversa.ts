// Quiz "em conversa": a aluna responde uma pergunta por vez, como num chat. Regras puras da tela
// (`components/conteudo/quiz-em-conversa.tsx`): quando a conversa vale, o texto das mensagens e o rascunho.

interface PerguntaMinima {
  id: string
  tipo: string
  outro: boolean
  grupoUmDe: string | null
}

/**
 * Conversa só vale quando o quiz pede e todas as perguntas cabem nela. Arquivo, "Outro:" e grupo
 * "responda um destes" precisam de mais espaço: o quiz cai no formato lista.
 */
export function quizEmConversa(quiz: {
  formato: string
  perguntas: PerguntaMinima[]
}): boolean {
  return (
    quiz.formato === 'conversa' &&
    quiz.perguntas.length > 0 &&
    quiz.perguntas.every(
      (p) => p.tipo !== 'arquivo' && !p.outro && !p.grupoUmDe,
    )
  )
}

/** As mensagens da abertura: uma por linha, sem linha vazia. */
export function mensagensDeAbertura(abertura: string | null): string[] {
  return (abertura ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Enunciado maior que isto pede um campo de várias linhas. */
export const LIMITE_DO_CAMPO_CURTO = 80
export const pedeCampoLongo = (enunciado: string) =>
  enunciado.length > LIMITE_DO_CAMPO_CURTO

/** O que a aluna respondeu, em texto, para o balão. Nulo = sem resposta. */
export function textoDaResposta(
  pergunta: {
    tipo: string
    alternativas: { id: string; texto: string }[]
  },
  marcadas: string[],
  texto: string,
): string | null {
  if (pergunta.tipo === 'texto_livre') return texto.trim() || null
  const escolhidas = pergunta.alternativas
    .filter((a) => marcadas.includes(a.id))
    .map((a) => a.texto.trim())
  return escolhidas.length > 0 ? escolhidas.join(', ') : null
}

/** Escolha única já está respondida ao marcar; as outras pedem o botão. */
export function respondida(
  pergunta: { tipo: string },
  marcadas: string[],
  texto: string,
): boolean {
  return pergunta.tipo === 'texto_livre'
    ? texto.trim().length > 0
    : marcadas.length > 0
}

export interface RascunhoDaConversa {
  comecou: boolean
  /** Índice da pergunta em andamento. */
  etapa: number
  respostas: Record<string, string[]>
  textos: Record<string, string>
}

export const chaveDoRascunho = (quizId: string) => `quiz-conversa:${quizId}`

/** Lê o rascunho guardado; qualquer coisa fora do formato (ou de outra versão do quiz) vira nulo. */
export function lerRascunho(
  bruto: string | null,
  idsDasPerguntas: string[],
): RascunhoDaConversa | null {
  if (!bruto) return null
  try {
    const d = JSON.parse(bruto) as Partial<RascunhoDaConversa>
    if (
      typeof d.comecou !== 'boolean' ||
      !Number.isInteger(d.etapa) ||
      (d.etapa as number) < 0 ||
      (d.etapa as number) > idsDasPerguntas.length ||
      !d.respostas ||
      !d.textos
    ) {
      return null
    }
    const ids = new Set(idsDasPerguntas)
    const respostas: Record<string, string[]> = {}
    for (const [id, v] of Object.entries(d.respostas)) {
      if (
        ids.has(id) &&
        Array.isArray(v) &&
        v.every((x) => typeof x === 'string')
      ) {
        respostas[id] = v
      }
    }
    const textos: Record<string, string> = {}
    for (const [id, v] of Object.entries(d.textos)) {
      if (ids.has(id) && typeof v === 'string') textos[id] = v
    }
    return { comecou: d.comecou, etapa: d.etapa as number, respostas, textos }
  } catch {
    return null
  }
}
