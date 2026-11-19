// URL pré-assinada de upload para o R2 (teste 3: arquivo grande direto do navegador para o R2,
// sem passar pelo Worker). A URL vale 15 min e fixa o tamanho do corpo. Usa a API S3 do R2 com aws4fetch.
// SÓ FUNCIONA REMOTO: o R2 local do `npm run dev` não expõe endpoint S3 com essas credenciais, e o
// bucket remoto precisa de CORS liberando PUT da origem do site.
import { AwsClient } from 'aws4fetch'

export interface ConfigR2 {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export async function urlAssinadaUpload(
  cfg: ConfigR2,
  key: string,
  tamanho: number,
  expiraSeg = 900,
): Promise<string> {
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
  const url = new URL(
    `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${encodeURI(key)}`,
  )
  url.searchParams.set('X-Amz-Expires', String(expiraSeg))
  // `Content-Length` entra nos headers assinados (`allHeaders`): o R2 recusa corpo de outro tamanho.
  const signed = await client.sign(
    new Request(url, {
      method: 'PUT',
      headers: { 'content-length': String(tamanho) },
    }),
    { aws: { signQuery: true, allHeaders: true } },
  )
  return signed.url
}

/** Chave segura: sem `..`, sem barra inicial, até 200 caracteres. */
export function chaveValida(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 200 &&
    !key.startsWith('/') &&
    !key.split('/').some((p) => p === '..' || p === '') &&
    /^[\w./ -]+$/.test(key)
  )
}
