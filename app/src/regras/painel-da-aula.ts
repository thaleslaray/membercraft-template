// Painéis da tela da aula: só um aparece por vez (cartão do fim do vídeo, celebração de marco ou
// avaliação). O marco que a conclusão aos 90% fechou em silêncio fica pendente até o vídeo terminar.
// Puro e sem React, para a rota só despachar eventos.

export type Painel = 'assistindo' | 'fim' | 'celebracao' | 'avaliando'

export type EstadoDoPainel<C> = {
  painel: Painel
  // O que a celebração mostra; só vale com painel 'celebracao'.
  celebracao: C | null
  // Marco fechado em silêncio, à espera do fim do vídeo.
  pendente: C | null
}

export type EventoDoPainel<C> =
  // O vídeo chegou ao fim: celebra o marco pendente ou mostra o cartão da próxima aula.
  | { tipo: 'terminou' }
  // A aula foi concluída. Em silêncio (90% do vídeo) o marco fica pendente; pelo botão, abre na hora.
  | { tipo: 'concluiu'; marco: C | null; silencioso: boolean }
  | { tipo: 'abrirAvaliacao' }
  | { tipo: 'fechar' }
  | { tipo: 'trocouDeAula' }

export function painelInicial<C>(): EstadoDoPainel<C> {
  return { painel: 'assistindo', celebracao: null, pendente: null }
}

export function reduzirPainel<C>(
  estado: EstadoDoPainel<C>,
  evento: EventoDoPainel<C>,
): EstadoDoPainel<C> {
  switch (evento.tipo) {
    case 'terminou':
      if (estado.pendente) {
        return {
          painel: 'celebracao',
          celebracao: estado.pendente,
          pendente: null,
        }
      }
      return { ...estado, painel: 'fim', celebracao: null }
    case 'concluiu':
      if (evento.silencioso) return { ...estado, pendente: evento.marco }
      if (evento.marco) {
        return { ...estado, painel: 'celebracao', celebracao: evento.marco }
      }
      return estado
    case 'abrirAvaliacao':
      return { ...estado, painel: 'avaliando', celebracao: null }
    case 'fechar':
      return { ...estado, painel: 'assistindo', celebracao: null }
    case 'trocouDeAula':
      return painelInicial()
  }
}
