/**
 * Botão de excluir do painel (P2): sempre em `--destructive` e sempre com confirmação.
 *
 *   <BotaoExcluir
 *     rotulo={`Excluir ${material.nome}`}           // nome acessível e texto do botão
 *     titulo="Excluir este material?"                // opcional; padrão: "{rotulo}?"
 *     descricao="Os alunos deixam de ver o arquivo." // opcional
 *     exigirTexto={aluno.email}                       // opcional: digitar para liberar
 *     icone                                           // opcional: só a lixeira, rótulo vira aria-label
 *     disabled={ocupado}
 *     onConfirmado={() => executar(() => excluirFn(...), 'Material excluído.')}
 *   />
 *
 * `onConfirmado` só roda depois do "Excluir" da janela. Para outras confirmações (encerrar,
 * revogar, trocar e-mail), use `useConfirmar` de `components/confirmar.tsx` direto.
 */
import { Trash2 } from 'lucide-react'
import { useConfirmar } from '#/components/confirmar'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

export function BotaoExcluir({
  rotulo,
  titulo,
  descricao,
  exigirTexto,
  acao = 'Excluir',
  icone = false,
  disabled,
  className,
  onConfirmado,
}: {
  rotulo: string
  titulo?: string
  descricao?: string
  exigirTexto?: string
  /** Texto do botão que confirma na janela; padrão "Excluir". */
  acao?: string
  icone?: boolean
  disabled?: boolean
  className?: string
  onConfirmado: () => unknown
}) {
  const confirmar = useConfirmar()
  async function pedir() {
    const sim = await confirmar({
      titulo: titulo ?? `${rotulo}?`,
      descricao,
      acao,
      perigo: true,
      exigirTexto,
    })
    if (sim) await onConfirmado()
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size={icone ? 'icon-sm' : 'sm'}
      aria-label={icone ? rotulo : undefined}
      title={icone ? rotulo : undefined}
      disabled={disabled}
      onClick={() => void pedir()}
      className={cn(
        'text-destructive hover:bg-destructive/10 hover:text-destructive toque:min-h-11',
        icone && 'toque:size-11',
        className,
      )}
    >
      <Trash2 aria-hidden="true" />
      {icone ? null : rotulo}
    </Button>
  )
}
