// Ambiente de testes: o envio só vai para endereços da lista liberada (`EMAIL_LISTA_LIBERADA`,
// e-mails separados por vírgula). Fora dele (produção, desenvolvimento) não há restrição.
// Sem lista no ambiente de testes, ninguém é liberado.

export function interpretarListaLiberada(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function destinatarioLiberado(
  ambiente: string | undefined,
  lista: string | undefined,
  email: string,
): boolean {
  if (ambiente !== 'teste') return true
  return interpretarListaLiberada(lista).includes(email.trim().toLowerCase())
}
