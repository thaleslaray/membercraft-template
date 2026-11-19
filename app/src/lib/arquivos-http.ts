// Envio e download de arquivos do R2 pelas rotas de API: o que as rotas de upload e de download
// repetiam. A rota continua dona de QUEM pode e de QUAL chave; aqui fica o resto.
import { env } from 'cloudflare:workers'
import { respostaDeErro } from '#/lib/sessao-http'
import { cabecalhoDeDownload } from '#/regras/arquivos-de-conteudo'

// ---------- Upload ----------

export type ArquivoRecebido =
  | { arquivo: File; formulario: FormData }
  | { erro: Response }

/** Folga para o envelope do formulário (nome, campos, bordas) além do arquivo em si. */
const FOLGA_DO_FORMULARIO = 1024 * 1024

/**
 * Confere o `Content-Length` ANTES de ler o corpo: sem ele, ou acima do teto (arquivo + folga),
 * é 413. Assim um corpo enorme não chega à memória do Worker.
 */
export function respostaSeCorpoGrande(
  request: Request,
  tetoDoArquivo: number,
): Response | null {
  const declarado = Number(request.headers.get('content-length'))
  if (
    !request.headers.has('content-length') ||
    !Number.isFinite(declarado) ||
    declarado > tetoDoArquivo + FOLGA_DO_FORMULARIO
  ) {
    return respostaDeErro(413, 'O arquivo é grande demais.')
  }
  return null
}

/**
 * O arquivo do campo `arquivo` do formulário do pedido, ou a resposta 400 (413 se o corpo passa
 * de `tetoDoArquivo` bytes) a enviar.
 */
export async function receberArquivo(
  request: Request,
  tetoDoArquivo: number,
  mensagem = 'Escolha um arquivo.',
): Promise<ArquivoRecebido> {
  const grande = respostaSeCorpoGrande(request, tetoDoArquivo)
  if (grande) return { erro: grande }
  const formulario = await request.formData().catch(() => null)
  const arquivo = formulario?.get('arquivo')
  if (!formulario || !(arquivo instanceof File)) {
    return { erro: respostaDeErro(400, mensagem) }
  }
  return { arquivo, formulario }
}

/** Guarda o arquivo no R2 com o tipo dele e devolve o tipo gravado. */
export async function guardarNoBucket(
  chave: string,
  arquivo: File,
): Promise<string> {
  const tipo = arquivo.type || 'application/octet-stream'
  await env.BUCKET.put(chave, arquivo.stream(), {
    httpMetadata: { contentType: tipo },
  })
  return tipo
}

// ---------- Download ----------

export interface OpcoesDoDownload {
  /** Texto do 404 (arquivo que não existe ou sumiu do R2). */
  naoEncontrado: string
  /** `Cache-Control` da resposta. */
  cache: string
  /** Tipo a responder; sem ele vale o gravado no R2 (ou `application/octet-stream`). */
  tipo?: string
  /** Tipo de reserva, para o objeto que não guardou o dele no R2. */
  tipoDeReserva?: string
  /** Com nome, a resposta baixa o arquivo (`Content-Disposition` e `Content-Length`). */
  nomeDoDownload?: string
  /** Com `nomeDoDownload`: o navegador abre o arquivo na tela (imagem, PDF) em vez de baixar. */
  naTela?: boolean
  /** Cabeçalhos a mais (por exemplo `x-content-type-options`). */
  cabecalhos?: Record<string, string>
}

/** Serve o objeto do R2, ou a resposta 404 se ele não existe. */
export async function servirDoBucket(
  chave: string,
  opcoes: OpcoesDoDownload,
): Promise<Response> {
  const objeto = await env.BUCKET.get(chave)
  if (!objeto) return respostaDeErro(404, opcoes.naoEncontrado)
  return new Response(objeto.body, {
    headers: {
      'content-type':
        opcoes.tipo ??
        objeto.httpMetadata?.contentType ??
        opcoes.tipoDeReserva ??
        'application/octet-stream',
      'cache-control': opcoes.cache,
      ...(opcoes.nomeDoDownload
        ? {
            'content-length': String(objeto.size),
            'content-disposition': cabecalhoDeDownload(
              opcoes.nomeDoDownload,
              opcoes.naTela,
            ),
          }
        : {}),
      ...opcoes.cabecalhos,
    },
  })
}
