/**
 * Campos e ações de formulário do painel (P4 e P4b).
 *
 *   const { executar, ocupado, erros } = useAcao()
 *   <form onSubmit={(e) => { e.preventDefault(); executar(salvar, 'Aula salva.', { validar }) }} noValidate>
 *     <CampoDoPainel rotulo="Título" ajuda="Até 200 caracteres." erro={erros.titulo}>
 *       <Input value={titulo} onChange={...} maxLength={200} />
 *     </CampoDoPainel>
 *     <AcoesDoFormulario
 *       salvar="Salvar aula"            // texto do botão principal, sempre "Salvar X"
 *       ocupado={ocupado}               // desliga o botão só durante o envio
 *       alterado={mudou}                // avisa ao sair da tela sem salvar (e ao fechar a aba)
 *       erros={erros}                   // muda → foco no primeiro campo com erro
 *       onCancelar={() => desfazer()}   // opcional: botão "Cancelar" ao lado do salvar
 *     />
 *   </form>
 *
 * `CampoDoPainel` recebe UM campo como filho e liga nele `id`, `aria-describedby` (ajuda e erro) e
 * `aria-invalid`. Se o filho já tiver `id`, ele vale. O erro aparece embaixo do campo, em
 * `--destructive`, e o que foi digitado fica como está.
 * `AcoesDoFormulario` fica no fim do formulário, sempre no mesmo lugar: salvar à esquerda e
 * cancelar ao lado. O botão de salvar nunca fica desligado por validação: a conferência acontece
 * ao enviar e mostra o erro no campo.
 */
import { useBlocker } from '@tanstack/react-router'
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from 'react'
import { useConfirmar } from '#/components/confirmar'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { cn } from '#/lib/utils'
import type { ErrosDoFormulario } from '#/regras/painel'

type PropsDoCampo = {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}

export function CampoDoPainel({
  rotulo,
  ajuda,
  erro,
  className,
  children,
}: {
  rotulo: ReactNode
  ajuda?: ReactNode
  erro?: string
  className?: string
  children: ReactElement<PropsDoCampo>
}) {
  const base = useId()
  const filho = Children.only(children)
  const id = (isValidElement(filho) && filho.props.id) || `${base}-campo`
  const idAjuda = `${base}-ajuda`
  const idErro = `${base}-erro`
  const descrito =
    [ajuda ? idAjuda : null, erro ? idErro : null].filter(Boolean).join(' ') ||
    undefined
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <Label htmlFor={id}>{rotulo}</Label>
      {cloneElement(filho, {
        id,
        'aria-describedby': descrito,
        'aria-invalid': erro ? true : undefined,
      })}
      {ajuda ? (
        <p id={idAjuda} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      ) : null}
      {erro ? (
        <p id={idErro} className="text-sm font-medium text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  )
}

export function AcoesDoFormulario({
  salvar,
  ocupado = false,
  alterado = false,
  erros,
  onCancelar,
  cancelar = 'Cancelar',
  secundario,
  className,
}: {
  salvar: string
  ocupado?: boolean
  alterado?: boolean
  erros?: ErrosDoFormulario
  onCancelar?: () => void
  cancelar?: string
  /** Botão de salvar neutro: para ações de apoio na mesma tela da ação principal (vinho). */
  secundario?: boolean
  className?: string
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const confirmar = useConfirmar()

  // Foco no primeiro campo com erro, sempre que os erros mudam.
  useEffect(() => {
    if (!erros || !Object.values(erros).some(Boolean)) return
    const form = caixa.current?.closest('form')
    form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [erros])

  // Sair da tela com alteração não salva pergunta antes; fechar a aba usa o aviso do navegador.
  useBlocker({
    shouldBlockFn: async () => {
      if (!alterado || ocupado) return false
      const sair = await confirmar({
        titulo: 'Sair sem salvar?',
        descricao: 'O que você mudou nesta tela ainda não foi salvo.',
        acao: 'Sair sem salvar',
        recusa: 'Continuar editando',
        perigo: true,
      })
      return !sair
    },
    enableBeforeUnload: () => alterado && !ocupado,
  })

  return (
    <div
      ref={caixa}
      className={cn('flex flex-wrap items-center gap-3 pt-2', className)}
    >
      <Button
        type="submit"
        variant={secundario ? 'outline' : undefined}
        disabled={ocupado}
        className="toque:min-h-11"
      >
        {ocupado ? 'Salvando…' : salvar}
      </Button>
      {onCancelar ? (
        <Button
          type="button"
          variant="outline"
          disabled={ocupado}
          onClick={onCancelar}
          className="toque:min-h-11"
        >
          {cancelar}
        </Button>
      ) : null}
      {alterado && !ocupado ? (
        <span role="status" className="text-xs text-muted-foreground">
          Alterações não salvas
        </span>
      ) : null}
    </div>
  )
}

/** Mensagem de erro de um bloco inteiro (não de um campo), dentro do formulário. */
export function ErroDoFormulario({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {children}
    </p>
  )
}
