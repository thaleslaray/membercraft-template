// PDF do certificado (#55): desenha os campos do modelo sobre a imagem da frente (e do verso, se
// houver) com `pdf-lib`, que roda em Worker. Não toca banco nem R2: recebe as imagens prontas.
// O QR aponta para a página pública de validação.

import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  rgb,
  StandardFonts,
} from 'pdf-lib'
import {
  type CampoDoModelo,
  type Fonte,
  LARGURA_DA_PAGINA,
} from '#/regras/certificado-modelo'
import { enderecoDeValidacao, matrizDoQr } from '#/regras/certificado-qr'
import {
  ajustarTextoDoCampo,
  ENTRELINHA,
  larguraDisponivelDoCampo,
} from '#/regras/certificado-texto'
import type { DadosDoPdf } from '#/regras/certificados'
import { ALLURA_BASE64 } from '#/regras/fontes/allura-base64'

export { enderecoDeValidacao, matrizDoQr }

export class ErroDeImagemDoModelo extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeImagemDoModelo'
  }
}

export interface ImagensDoModelo {
  frente: Uint8Array
  verso: Uint8Array | null
}

/** "7 de novembro de 2026", no horário de Brasília. */
export function dataPorExtenso(data: Date): string {
  return data.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

const E_PNG = (b: Uint8Array) =>
  b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e
const E_JPEG = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8

async function embutir(pdf: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  if (E_PNG(bytes)) return pdf.embedPng(bytes)
  if (E_JPEG(bytes)) return pdf.embedJpg(bytes)
  throw new ErroDeImagemDoModelo(
    'A imagem do modelo precisa ser PNG ou JPEG para virar PDF.',
  )
}

function corDe(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

type Fontes = Record<`${Fonte}:${'normal' | 'negrito'}`, PDFFont>

async function carregarFontes(
  pdf: PDFDocument,
  usaAllura: boolean,
): Promise<Fontes> {
  // A Allura só entra no PDF quando algum campo a usa, e entra INTEIRA: com `subset: true` o
  // fontkit perde o desenho da maioria das letras dela ("Maria da Conceição Souza" saía
  // "i d C i u"). Comprimida, a fonte inteira acrescenta cerca de 100 KB ao PDF.
  let allura: PDFFont | undefined
  if (usaAllura) {
    pdf.registerFontkit(fontkit)
    allura = await pdf.embedFont(
      Uint8Array.from(atob(ALLURA_BASE64), (ch) => ch.charCodeAt(0)),
      { subset: false },
    )
  }
  const [h, hb, t, tb, c, cb] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.TimesRoman),
    pdf.embedFont(StandardFonts.TimesRomanBold),
    pdf.embedFont(StandardFonts.Courier),
    pdf.embedFont(StandardFonts.CourierBold),
  ])
  return {
    'helvetica:normal': h,
    'helvetica:negrito': hb,
    'times:normal': t,
    'times:negrito': tb,
    'courier:normal': c,
    'courier:negrito': cb,
    // Allura não tem negrito: "Negrito" usa a mesma fonte.
    'allura:normal': allura ?? h,
    'allura:negrito': allura ?? h,
  }
}

/** As fontes padrão do PDF só desenham Latin-1: o resto vira "?" em vez de derrubar a geração. */
function textoDesenhavel(texto: string, fonte: PDFFont): string {
  const aceitos = new Set(fonte.getCharacterSet())
  return Array.from(texto.normalize('NFC'), (c) =>
    aceitos.has(c.codePointAt(0) ?? 0) ? c : '?',
  ).join('')
}

function valorDoCampo(
  campo: CampoDoModelo,
  dados: Pick<DadosDoPdf, 'nome' | 'cursoNome' | 'concluidoEm' | 'codigo'>,
): string {
  switch (campo.campo) {
    case 'nome':
      return dados.nome
    case 'curso':
      return dados.cursoNome
    case 'data':
      return dataPorExtenso(dados.concluidoEm)
    case 'codigo':
      return dados.codigo
    default:
      return ''
  }
}

function desenharQr(
  pagina: PDFPage,
  campo: CampoDoModelo,
  texto: string,
  largura: number,
  altura: number,
) {
  const matriz = matrizDoQr(texto)
  const margem = 1
  const modulos = matriz.length + margem * 2
  const lado = campo.tamanho
  const passo = lado / modulos
  const esquerda = campo.x * largura - lado / 2
  const topo = altura - campo.y * altura + lado / 2
  pagina.drawRectangle({
    x: esquerda,
    y: topo - lado,
    width: lado,
    height: lado,
    color: rgb(1, 1, 1),
  })
  const cor = corDe(campo.cor)
  matriz.forEach((linha, l) => {
    linha.forEach((escuro, c) => {
      if (!escuro) return
      pagina.drawRectangle({
        x: esquerda + (c + margem) * passo,
        y: topo - (l + margem + 1) * passo,
        width: passo + 0.2,
        height: passo + 0.2,
        color: cor,
      })
    })
  })
}

/** Gera o PDF: uma página com a frente e, se houver verso, uma segunda. */
export async function gerarPdfDoCertificado(
  dados: Pick<
    DadosDoPdf,
    'nome' | 'cursoNome' | 'concluidoEm' | 'codigo' | 'campos'
  >,
  imagens: ImagensDoModelo,
  urlDeValidacao: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const fontes = await carregarFontes(
    pdf,
    dados.campos.some((c) => c.fonte === 'allura'),
  )
  const lados: { lado: 'frente' | 'verso'; bytes: Uint8Array }[] = [
    { lado: 'frente', bytes: imagens.frente },
  ]
  if (imagens.verso) lados.push({ lado: 'verso', bytes: imagens.verso })

  for (const { lado, bytes } of lados) {
    const imagem = await embutir(pdf, bytes)
    const largura = LARGURA_DA_PAGINA
    const altura = (imagem.height / imagem.width) * largura
    const pagina = pdf.addPage([largura, altura])
    pagina.drawImage(imagem, { x: 0, y: 0, width: largura, height: altura })
    for (const campo of dados.campos.filter((c) => c.lado === lado)) {
      if (campo.campo === 'qr') {
        desenharQr(pagina, campo, urlDeValidacao, largura, altura)
        continue
      }
      const fonte =
        fontes[
          `${campo.fonte}:${campo.negrito ? 'negrito' : 'normal'}` as keyof Fontes
        ]
      const texto = textoDesenhavel(valorDoCampo(campo, dados), fonte)
      if (!texto) continue
      const { linhas, tamanho } = ajustarTextoDoCampo(
        texto,
        campo.tamanho,
        larguraDisponivelDoCampo(campo),
        (t, tam) => fonte.widthOfTextAtSize(t, tam),
      )
      const ancora = campo.x * largura
      // `y` é o centro do bloco: a linha de base da primeira linha fica um pouco abaixo dele
      // (e mais acima quanto mais linhas houver).
      const passo = tamanho * ENTRELINHA
      const topoDoBloco =
        altura - campo.y * altura + ((linhas.length - 1) * passo) / 2
      linhas.forEach((linha, i) => {
        const larguraDaLinha = fonte.widthOfTextAtSize(linha, tamanho)
        const x =
          campo.alinhamento === 'centro'
            ? ancora - larguraDaLinha / 2
            : campo.alinhamento === 'direita'
              ? ancora - larguraDaLinha
              : ancora
        pagina.drawText(linha, {
          x,
          y: topoDoBloco - i * passo - tamanho * 0.35,
          size: tamanho,
          font: fonte,
          color: corDe(campo.cor),
        })
      })
    }
  }
  return pdf.save()
}
