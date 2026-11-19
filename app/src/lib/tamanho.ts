// "1,5 MB", "320 KB": o tamanho de um arquivo para a tela.
export function formatarTamanho(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
