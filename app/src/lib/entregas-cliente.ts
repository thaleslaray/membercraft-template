import { prepararEnvioDeArquivoFn } from '#/lib/quiz-fns'
import type { ArquivoEntregue } from '#/regras/entregas'

// Envio de um arquivo da entrega do quiz, no navegador. Pergunta ao servidor por onde ir
// (`prepararEnvioDeArquivoFn`): URL assinada direto ao R2 no ambiente remoto, ou pelo Worker no dev
// e no e2e local. Usa XMLHttpRequest porque é ele que informa o progresso do envio (até 500 MB).
function enviarComProgresso(
  metodo: 'PUT' | 'POST',
  url: string,
  corpo: XMLHttpRequestBodyInit,
  aoProgredir: (percentual: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(metodo, url)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        aoProgredir(Math.round((e.loaded * 100) / e.total))
    }
    xhr.onerror = () => reject(new Error('Não deu para enviar o arquivo.'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300)
        return resolve(xhr.responseText)
      let mensagem = 'Não deu para enviar o arquivo.'
      try {
        const json = JSON.parse(xhr.responseText) as { erro?: string }
        if (json.erro) mensagem = json.erro
      } catch {
        // Resposta do R2 não é JSON: fica a mensagem padrão.
      }
      reject(new Error(mensagem))
    }
    xhr.send(corpo)
  })
}

export async function enviarArquivoDaEntrega(
  aulaId: string,
  arquivo: File,
  aoProgredir: (percentual: number) => void,
): Promise<ArquivoEntregue> {
  const tipo = arquivo.type || 'application/octet-stream'
  const preparo = await prepararEnvioDeArquivoFn({
    data: { aulaId, nome: arquivo.name, tamanho: arquivo.size },
  })
  if (preparo.modo === 'direto') {
    await enviarComProgresso('PUT', preparo.url, arquivo, aoProgredir)
    return { chave: preparo.chave, nome: arquivo.name, tipo }
  }
  const corpo = new FormData()
  corpo.set('arquivo', arquivo)
  corpo.set('aulaId', aulaId)
  const resposta = await enviarComProgresso(
    'POST',
    '/api/quiz/entregas',
    corpo,
    aoProgredir,
  )
  return JSON.parse(resposta) as ArquivoEntregue
}
