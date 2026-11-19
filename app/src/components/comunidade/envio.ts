export interface ArquivoDaComunidade {
  chave: string
  nome: string
  tipo: string
  tamanho: number
}

// Envia um arquivo ao R2 pela rota da comunidade e devolve o que ela respondeu.
export async function enviarParaAComunidade(
  arquivo: File,
  finalidade: 'imagem' | 'anexo',
): Promise<ArquivoDaComunidade> {
  const corpo = new FormData()
  corpo.set('arquivo', arquivo)
  corpo.set('finalidade', finalidade)
  const resposta = await fetch('/api/comunidade/upload', {
    method: 'POST',
    body: corpo,
  })
  const json = (await resposta.json().catch(() => ({}))) as
    | ArquivoDaComunidade
    | { erro?: string }
  if (!resposta.ok || !('chave' in json)) {
    throw new Error(('erro' in json && json.erro) || 'Não deu para enviar.')
  }
  return json
}
