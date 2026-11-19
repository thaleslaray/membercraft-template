// Regras do cartão do fim do vídeo (#104) que não dependem da tela: o que o cartão faz conforme a
// próxima aula e a preferência da aluna, e a contagem de 5 s.

/** Tempo da contagem até a próxima aula começar sozinha. */
export const CONTAGEM_MS = 5000

export type ModoDoFimDoVideo =
  /** Próxima liberada e preferência ligada: conta e começa sozinha. */
  | 'contagem'
  /** Próxima liberada, preferência desligada: anuncia, sem contagem. */
  | 'manual'
  /** Próxima com cadeado: mostra o motivo, sem contagem. */
  | 'bloqueada'
  /** Última aula do curso: só a avaliação. */
  | 'sem-proxima'

export function modoDoFimDoVideo(entrada: {
  temProxima: boolean
  liberada: boolean
  tocarSozinha: boolean
}): ModoDoFimDoVideo {
  if (!entrada.temProxima) return 'sem-proxima'
  if (!entrada.liberada) return 'bloqueada'
  return entrada.tocarSozinha ? 'contagem' : 'manual'
}

/** Um passo da contagem: pausada, o tempo não anda. */
export function avancarContagem(
  restanteMs: number,
  passoMs: number,
  pausada: boolean,
) {
  const novo = pausada ? restanteMs : Math.max(0, restanteMs - passoMs)
  return { restanteMs: novo, terminou: novo <= 0 }
}

/** O número que a aluna lê ("em 5 s"): arredonda para cima. */
export function segundosRestantes(restanteMs: number) {
  return Math.max(0, Math.ceil(restanteMs / 1000))
}
