// O cliente do Better Auth só é carregado no "Sair": a casca entra em toda página e o cliente pesava
// no JavaScript inicial.
export async function sairDaConta() {
  const { authClient } = await import('#/lib/auth-client')
  await authClient.signOut()
  window.location.assign('/')
}
