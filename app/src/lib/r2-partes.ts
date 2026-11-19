// Grava um fluxo de tamanho desconhecido no R2 por upload em partes: o `put` simples exige o tamanho
// de antemão. O R2 pede partes de tamanho igual (menos a última) e de pelo menos 5 MiB.
const TAMANHO_DA_PARTE = 5 * 1024 * 1024

export async function gravarFluxoEmPartes(
  bucket: R2Bucket,
  chave: string,
  fluxo: ReadableStream<Uint8Array>,
): Promise<void> {
  const envio = await bucket.createMultipartUpload(chave)
  try {
    const partes: R2UploadedPart[] = []
    let atual = new Uint8Array(TAMANHO_DA_PARTE)
    let usado = 0
    const enviar = async (bytes: Uint8Array) => {
      partes.push(await envio.uploadPart(partes.length + 1, bytes))
    }
    const leitor = fluxo.getReader()
    for (;;) {
      const { value, done } = await leitor.read()
      if (done) break
      let posicao = 0
      while (posicao < value.length) {
        const n = Math.min(value.length - posicao, TAMANHO_DA_PARTE - usado)
        atual.set(value.subarray(posicao, posicao + n), usado)
        usado += n
        posicao += n
        if (usado === TAMANHO_DA_PARTE) {
          await enviar(atual)
          atual = new Uint8Array(TAMANHO_DA_PARTE)
          usado = 0
        }
      }
    }
    // A última parte pode ser menor; o gzip nunca é vazio, então sempre há ao menos uma parte.
    if (usado > 0 || partes.length === 0) await enviar(atual.subarray(0, usado))
    await envio.complete(partes)
  } catch (erro) {
    await envio.abort().catch(() => undefined)
    throw erro
  }
}
