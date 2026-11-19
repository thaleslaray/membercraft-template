import { readFileSync } from 'node:fs'

// Avisos da Voomp para os testes. Os dados de pessoas são fictícios; o formato segue o que o #21
// capturou (ver o comentário de `src/regras/voomp.ts` e o relatório da fatia #43 sobre campos supostos).
export type NomeDeFixture =
  | 'sale-paid-botao-de-teste'
  | 'sale-paid-real'
  | 'sale-refunded'
  | 'sale-chargedback'
  | 'sale-waiting-payment-boleto'
  | 'contract-paid'

/** O corpo do aviso como a Voomp o manda (texto JSON), com ajustes opcionais por cima. */
export function corpoDaFixture(
  nome: NomeDeFixture,
  // biome-ignore lint/suspicious/noExplicitAny: o teste mexe em qualquer campo do aviso
  ajustes: (aviso: Record<string, any>) => void = () => {},
): string {
  const caminho = new URL(`./${nome}.json`, import.meta.url)
  const aviso = JSON.parse(readFileSync(caminho, 'utf8'))
  ajustes(aviso)
  return JSON.stringify(aviso)
}
