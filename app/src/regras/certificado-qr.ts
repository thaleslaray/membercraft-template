// QR do certificado (#55): a matriz que o PDF desenha e a prévia no navegador também. Fica fora de
// `certificado-pdf.ts` para a tela importar sem trazer o `pdf-lib` junto.

import qrcode from 'qrcode-generator'

/** Matriz do QR (verdadeiro = módulo escuro). */
export function matrizDoQr(texto: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(texto)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, l) =>
    Array.from({ length: n }, (_, c) => qr.isDark(l, c)),
  )
}

/** Endereço público de validação de um código (o que o QR leva). */
export function enderecoDeValidacao(base: string, codigo: string): string {
  return `${base.replace(/\/$/, '')}/validar/${codigo}`
}
