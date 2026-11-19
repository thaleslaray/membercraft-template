import { readFileSync } from 'node:fs'

// Avisos da Hotmart (webhook 2.0.0) para os testes: vêm das fixtures sanitizadas da skill docs-hotmart,
// com os dados de pessoas trocados por valores fictícios (`aluna<N>@exemplo.test`).
export type NomeDeFixtureHotmart =
  | 'purchase-approved'
  | 'purchase-approved-assinatura'
  | 'purchase-refunded'
  | 'purchase-chargeback'
  | 'purchase-protest'
  | 'purchase-complete'
  | 'purchase-billet-printed'
  | 'purchase-delayed'
  | 'purchase-expired'
  | 'purchase-canceled'
  | 'purchase-out-of-shopping-cart'
  | 'club-first-access'
  | 'subscription-cancellation'

/** O corpo do aviso como a Hotmart o manda (texto JSON), com ajustes opcionais por cima. */
export function corpoDaFixtureHotmart(
  nome: NomeDeFixtureHotmart,
  // biome-ignore lint/suspicious/noExplicitAny: o teste mexe em qualquer campo do aviso
  ajustes: (aviso: Record<string, any>) => void = () => {},
): string {
  const caminho = new URL(`./${nome}.json`, import.meta.url)
  const aviso = JSON.parse(readFileSync(caminho, 'utf8'))
  ajustes(aviso)
  return JSON.stringify(aviso)
}
