import { type OndeGuardar, useValorQueCresce } from '#/hooks/use-valor-que-cresce'

/**
 * Número que conta até `valor` (#108). O que anima fica `aria-hidden`; o leitor de tela lê só o valor
 * final, num `sr-only`. `formatar` põe pontuação e sinal (o mesmo para os dois).
 */
export function NumeroQueCresce({
  valor,
  onde,
  formatar = (n) => n.toLocaleString('pt-BR'),
}: {
  valor: number
  onde?: OndeGuardar
  formatar?: (n: number) => string
}) {
  const exibido = useValorQueCresce(valor, onde)
  return (
    <>
      <span aria-hidden="true">{formatar(exibido)}</span>
      <span className="sr-only">{formatar(valor)}</span>
    </>
  )
}
