// Salvar por campo (#99): cada campo da conta se salva ao sair dele, com "Salvando…", "Salvo" ou o
// erro ao lado. Este módulo é a regra pura (sem React): quando chamar o servidor e em que estado o
// campo fica. O componente só pinta o estado.

export type EstadoDoCampo =
  | { fase: 'parado' }
  | { fase: 'salvando' }
  | { fase: 'salvo' }
  | { fase: 'erro'; erro: string }

const ERRO_PADRAO = 'Não foi possível salvar. Tente de novo.'

export function criarSalvadorDeCampo({
  valorSalvo,
  salvar,
  aoMudar,
}: {
  /** O que já está guardado no servidor: sair do campo sem mudar isso não faz nada. */
  valorSalvo: string
  salvar: (valor: string) => Promise<void>
  aoMudar: (estado: EstadoDoCampo) => void
}) {
  let base = valorSalvo
  // Só o último pedido pinta o resultado: uma resposta antiga não apaga a mais nova.
  let ultimoPedido = 0

  return {
    /** A aluna saiu do campo. */
    async sair(valor: string) {
      if (valor === base) return
      const pedido = ++ultimoPedido
      aoMudar({ fase: 'salvando' })
      try {
        await salvar(valor)
        if (pedido !== ultimoPedido) return
        base = valor
        aoMudar({ fase: 'salvo' })
      } catch (e) {
        if (pedido !== ultimoPedido) return
        aoMudar({
          fase: 'erro',
          erro: e instanceof Error && e.message ? e.message : ERRO_PADRAO,
        })
      }
    },
    /** Digitar nunca trava: só tira o erro e o "Salvo" da frente. */
    digitar() {
      aoMudar({ fase: 'parado' })
    },
  }
}
