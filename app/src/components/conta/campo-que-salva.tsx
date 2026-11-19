import { useEffect, useMemo, useRef, useState } from 'react'
import {
  criarSalvadorDeCampo,
  type EstadoDoCampo,
} from '#/lib/salvar-por-campo'
import { cn } from '#/lib/utils'

const TEMPO_DO_SALVO = 2000

/**
 * Liga um campo ao salvar sozinho (#99): `sair` no blur (ou na troca, para select e interruptor),
 * `digitar` no onChange. O "Salvo" some sozinho depois de 2 s.
 */
export function useCampoQueSalva({
  valorSalvo,
  salvar,
}: {
  valorSalvo: string
  salvar: (valor: string) => Promise<void>
}) {
  const [estado, setEstado] = useState<EstadoDoCampo>({ fase: 'parado' })
  // O salvador guarda a base entre renders; a função de salvar mais nova fica numa ref.
  const salvarRef = useRef(salvar)
  salvarRef.current = salvar
  // biome-ignore lint/correctness/useExhaustiveDependencies: a base inicial só vale na montagem; depois o salvador guarda sozinho o último valor salvo.
  const salvador = useMemo(
    () =>
      criarSalvadorDeCampo({
        valorSalvo,
        salvar: (valor) => salvarRef.current(valor),
        aoMudar: setEstado,
      }),
    [],
  )

  useEffect(() => {
    if (estado.fase !== 'salvo') return
    const t = setTimeout(() => setEstado({ fase: 'parado' }), TEMPO_DO_SALVO)
    return () => clearTimeout(t)
  }, [estado])

  return { estado, sair: salvador.sair, digitar: salvador.digitar }
}

/**
 * "Salvando…" e "Salvo" ao lado do campo, esmaecendo (200 ms). O espaço fica reservado para a linha
 * não pular. O erro (com o motivo) é `ErroDoCampo`, logo abaixo do campo.
 */
export function EstadoDoCampoNaTela({
  id,
  estado,
  className,
}: {
  id: string
  estado: EstadoDoCampo
  className?: string
}) {
  const texto =
    estado.fase === 'salvando'
      ? 'Salvando…'
      : estado.fase === 'salvo'
        ? 'Salvo'
        : ''
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid={`estado-${id}`}
      data-fase={estado.fase}
      className={cn(
        'min-w-16 text-right text-xs text-muted-foreground tabular-nums transition-opacity duration-base ease-saida',
        texto ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      {texto}
    </span>
  )
}

export function ErroDoCampo({
  id,
  estado,
}: {
  id: string
  estado: EstadoDoCampo
}) {
  if (estado.fase !== 'erro') return null
  return (
    <p
      id={`erro-${id}`}
      role="alert"
      className="text-sm text-destructive"
      data-testid={`erro-${id}`}
    >
      {estado.erro}
    </p>
  )
}
