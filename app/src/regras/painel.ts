// Regras puras do painel da equipe: área da rota, menu lateral, confirmação, erros de formulário,
// paginação e o tom das etiquetas de estado. Sem tela nem HTTP; as peças de `components/painel/`
// só chamam daqui.

/** Painel da equipe (`/painel` e `/estudio`) ou área do aluno. Vai em `data-area` no `<html>`. */
export type AreaDaRota = 'painel' | 'aluno'

export function areaDaRota(caminho: string): AreaDaRota {
  return /^\/(painel|estudio)(\/|$)/.test(caminho) ? 'painel' : 'aluno'
}

/** Nome do cookie em que o menu lateral guarda se está aberto (o mesmo do `ui/sidebar`). */
export const COOKIE_DO_MENU = 'sidebar_state'

/** O menu lateral abre recolhido só se o cookie disser `false`; sem cookie, aberto. */
export function menuAbertoNoCookie(
  cabecalho: string | null | undefined,
): boolean {
  if (!cabecalho) return true
  for (const parte of cabecalho.split(';')) {
    const [nome, valor] = parte.trim().split('=')
    if (nome === COOKIE_DO_MENU) return valor !== 'false'
  }
  return true
}

/**
 * Confirmação que exige digitar um texto (ex.: o e-mail do aluno a excluir): confere sem
 * diferenciar maiúsculas e sem os espaços das pontas.
 */
export function textoConfere(digitado: string, exigido: string): boolean {
  const limpo = (t: string) => t.trim().toLocaleLowerCase('pt-BR')
  return limpo(exigido) !== '' && limpo(digitado) === limpo(exigido)
}

/** Erros de um formulário, por nome do campo. Campo sem erro fica de fora (ou `undefined`). */
export type ErrosDoFormulario = Record<string, string | undefined>

export function temErros(erros: ErrosDoFormulario | null | undefined): boolean {
  return !!erros && Object.values(erros).some(Boolean)
}

/** Página na busca da URL: a primeira some (`?pagina=1` vira endereço limpo). */
export function paginaNaBusca(pagina: number): number | undefined {
  return Number.isInteger(pagina) && pagina > 1 ? pagina : undefined
}

/** Tom da etiqueta de estado: neutro, atenção (pendente), perigo (erro, reembolso) ou ok. */
export type TomDeEstado = 'neutro' | 'atencao' | 'perigo' | 'ok'

/** Situação de um aviso de venda: rótulo e tom da etiqueta. */
export const ESTADO_DO_AVISO: Record<
  'recebida' | 'aplicada' | 'sem_turma' | 'ignorada' | 'com_erro',
  { rotulo: string; tom: TomDeEstado }
> = {
  recebida: { rotulo: 'Na fila', tom: 'neutro' },
  aplicada: { rotulo: 'Aplicada', tom: 'ok' },
  sem_turma: { rotulo: 'Sem turma', tom: 'atencao' },
  ignorada: { rotulo: 'Ignorada', tom: 'neutro' },
  com_erro: { rotulo: 'Com erro', tom: 'perigo' },
}

/**
 * A aba do painel está ativa? `para` pode ter parâmetros (`$cursoId`), trocados pelos `params`.
 * `exata` só aceita o endereço exato; com `search`, a busca da URL também precisa bater.
 */
export function abaAtiva(
  aba: {
    para: string
    params?: Record<string, string>
    search?: Record<string, unknown>
    exata?: boolean
  },
  caminho: string,
  busca: Record<string, unknown>,
): boolean {
  const destino = aba.para.replace(/\$(\w+)/g, (_, nome: string) =>
    String(aba.params?.[nome] ?? ''),
  )
  const noCaminho = aba.exata
    ? caminho === destino || caminho === `${destino}/`
    : caminho === destino || caminho.startsWith(`${destino}/`)
  if (!noCaminho) return false
  if (!aba.search) return true
  return Object.entries(aba.search).every(
    ([chave, valor]) => String(busca[chave] ?? '') === String(valor ?? ''),
  )
}
