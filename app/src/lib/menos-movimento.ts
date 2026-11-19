/** A pessoa pediu menos movimento no aparelho. Sem janela (servidor), falso. */
export function querMenosMovimento(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
