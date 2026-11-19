import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from 'react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { textoConfere } from '#/regras/painel'

export type PedidoDeConfirmacao = {
  /** Pergunta curta, ex.: "Excluir este material?". A explicação vai em `descricao`. */
  titulo: string
  descricao?: string
  /** Texto do botão que confirma, ex.: "Excluir". */
  acao: string
  /** Ação que apaga ou encerra algo: o botão sai na cor de perigo. */
  perigo?: boolean
  /** Texto do botão que desiste; padrão "Cancelar". */
  recusa?: string
  /**
   * Texto que a pessoa precisa digitar para liberar o botão (ex.: o e-mail do aluno a excluir).
   * Confere sem maiúsculas e sem os espaços das pontas.
   */
  exigirTexto?: string
}

type Pedido = PedidoDeConfirmacao
type Confirmar = (pedido: Pedido) => Promise<boolean>

const Contexto = createContext<Confirmar | null>(null)

// Confirmação no visual da área, no lugar do `window.confirm` do navegador. É o ÚNICO caminho para
// confirmar uma ação (P2). Uso:
//   const confirmar = useConfirmar()
//   if (await confirmar({ titulo: 'Excluir este comentário?', acao: 'Excluir', perigo: true })) ...
// Com `perigo`, o foco começa em "Cancelar" (Enter sem querer não apaga nada). Com `exigirTexto`,
// o foco começa no campo e o botão só libera quando o texto confere. Para um botão de excluir
// pronto, use `BotaoExcluir` (`components/painel/botao-excluir.tsx`).
export function ConfirmarProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [digitado, setDigitado] = useState('')
  const idDoCampo = useId()
  const resolver = useRef<((sim: boolean) => void) | null>(null)

  const confirmar = useCallback<Confirmar>(
    (novo) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false)
        resolver.current = resolve
        setDigitado('')
        setPedido(novo)
      }),
    [],
  )

  function responder(sim: boolean) {
    resolver.current?.(sim)
    resolver.current = null
    setPedido(null)
  }

  return (
    <Contexto.Provider value={confirmar}>
      {children}
      <Dialog
        open={pedido !== null}
        onOpenChange={(aberto) => {
          if (!aberto) responder(false)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pedido?.titulo}</DialogTitle>
            {pedido?.descricao ? (
              <DialogDescription>{pedido.descricao}</DialogDescription>
            ) : null}
          </DialogHeader>
          {pedido?.exigirTexto ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={idDoCampo}>
                Digite {pedido.exigirTexto} para confirmar
              </Label>
              <Input
                id={idDoCampo}
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => responder(false)}
              autoFocus={!!pedido?.perigo && !pedido.exigirTexto}
            >
              {pedido?.recusa ?? 'Cancelar'}
            </Button>
            <Button
              variant={pedido?.perigo ? 'destructive' : 'default'}
              onClick={() => responder(true)}
              disabled={
                !!pedido?.exigirTexto &&
                !textoConfere(digitado, pedido.exigirTexto)
              }
              autoFocus={!pedido?.perigo && !pedido?.exigirTexto}
            >
              {pedido?.acao}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Contexto.Provider>
  )
}

export function useConfirmar(): Confirmar {
  const confirmar = useContext(Contexto)
  if (!confirmar) {
    throw new Error('useConfirmar precisa do ConfirmarProvider na raiz.')
  }
  return confirmar
}
