import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFRawStream,
} from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { FONTES } from '#/regras/certificado-modelo'
import {
  dataPorExtenso,
  ErroDeImagemDoModelo,
  enderecoDeValidacao,
  gerarPdfDoCertificado,
  matrizDoQr,
} from '#/regras/certificado-pdf'
import { CAMPOS_PADRAO } from '#/regras/certificados'
import { ALLURA_BASE64 } from '#/regras/fontes/allura-base64'

// PNG de 2x1 pixel (proporção 2:1 → página de 842 x 421).
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP8z8Dwn4EBAAkMAgH+Hnm0AAAAAElFTkSuQmCC',
  ),
  (c) => c.charCodeAt(0),
)
const dados = {
  nome: 'Maria da Conceição',
  cursoNome: 'Estilo na prática',
  concluidoEm: new Date('2026-11-07T15:00:00Z'),
  codigo: 'ABCD-2345',
  campos: CAMPOS_PADRAO,
}

// Textos desenhados na página (um `Tj` por linha), lidos do fluxo de conteúdo.
async function linhasDeTexto(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes)
  const conteudo = pdf.getPage(0).node.Contents()
  const fluxos = conteudo instanceof PDFArray ? conteudo.asArray() : [conteudo]
  let total = 0
  for (const f of fluxos) {
    const cru = pdf.context.lookup(f) as PDFRawStream
    total += (
      new TextDecoder('latin1')
        .decode(decodePDFRawStream(cru).decode())
        .match(/Tj/g) ?? []
    ).length
  }
  return total
}

describe('texto longo no PDF', () => {
  it('curso curto fica numa linha; curso enorme quebra em 2 linhas, sem cortar', async () => {
    const gerar = (cursoNome: string) =>
      gerarPdfDoCertificado(
        { ...dados, cursoNome },
        { frente: PNG, verso: null },
        'https://escola.exemplo/validar/ABCD-2345',
      )
    const curto = await linhasDeTexto(await gerar('Estilo na prática'))
    const longo = await linhasDeTexto(
      await gerar(
        'Formação completa em coloração avançada, mechas e técnicas de platinado para salões de alto padrão e muito mais',
      ),
    )
    expect(longo).toBe(curto + 1)
  })
})

describe('PDF do certificado', () => {
  it('gera uma página só com a frente', async () => {
    const bytes = await gerarPdfDoCertificado(
      dados,
      { frente: PNG, verso: null },
      'https://escola.exemplo/validar/ABCD-2345',
    )
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getPage(0).getSize()).toEqual({ width: 842, height: 421 })
  })

  it('gera a segunda página com o verso, só com os campos do verso', async () => {
    const campos = [
      ...CAMPOS_PADRAO,
      { ...CAMPOS_PADRAO[0], lado: 'verso' as const },
    ]
    const bytes = await gerarPdfDoCertificado(
      { ...dados, campos },
      { frente: PNG, verso: PNG },
      'https://escola.exemplo/validar/ABCD-2345',
    )
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
  })

  it('não derruba a geração por caractere que a fonte não desenha', async () => {
    const bytes = await gerarPdfDoCertificado(
      { ...dados, nome: 'Ana 😀 Souza' },
      { frente: PNG, verso: null },
      'https://escola.exemplo/validar/ABCD-2345',
    )
    expect(bytes.length).toBeGreaterThan(500)
  })

  it('recusa imagem que não é PNG nem JPEG', async () => {
    await expect(
      gerarPdfDoCertificado(
        dados,
        { frente: new TextEncoder().encode('GIF89a....'), verso: null },
        'x',
      ),
    ).rejects.toBeInstanceOf(ErroDeImagemDoModelo)
  })

  it('o QR é uma matriz quadrada e o endereço leva o código', () => {
    const m = matrizDoQr(enderecoDeValidacao('https://a.com/', 'ABCD-2345'))
    expect(m.length).toBeGreaterThanOrEqual(21)
    expect(m.every((l) => l.length === m.length)).toBe(true)
    expect(enderecoDeValidacao('https://a.com/', 'ABCD-2345')).toBe(
      'https://a.com/validar/ABCD-2345',
    )
  })

  it('escreve a data por extenso no horário de Brasília', () => {
    expect(dataPorExtenso(new Date('2026-11-07T15:00:00Z'))).toBe(
      '7 de novembro de 2026',
    )
  })

  describe('fonte Allura', () => {
    const comAllura = CAMPOS_PADRAO.map((c) =>
      c.campo === 'nome' ? { ...c, fonte: 'allura' as const } : c,
    )
    const gerar = (campos: typeof CAMPOS_PADRAO) =>
      gerarPdfDoCertificado(
        { ...dados, campos },
        { frente: PNG, verso: null },
        'https://escola.exemplo/validar/ABCD-2345',
      )

    // O PDF guarda os objetos comprimidos: lê os nomes de fonte pelo documento carregado.
    const fontesAllura = async (bytes: Uint8Array) => {
      const doc = await PDFDocument.load(bytes)
      return doc.context
        .enumerateIndirectObjects()
        .map(([, objeto]) => String(objeto))
        .filter(
          (t) => t.includes('/Type0') && /\/BaseFont\s*\/\S*Allura/.test(t),
        )
    }

    it('aceita allura entre as fontes do campo', () => {
      expect(FONTES).toContain('allura')
    })

    it('embute a Allura com o desenho de todas as letras do nome', async () => {
      const bytes = await gerar(comAllura)
      expect(await fontesAllura(bytes)).toHaveLength(1)
      // O subset do fontkit já perdeu o desenho de letras da Allura (o nome saía "i d C i u"):
      // abre a fonte embutida e confere que cada letra do nome tem contorno.
      const doc = await PDFDocument.load(bytes)
      // Descritor da fonte -> FontFile2 (o arquivo TrueType embutido).
      const descritor = doc.context
        .enumerateIndirectObjects()
        .map(([, objeto]) => objeto)
        .find(
          (o): o is PDFDict =>
            o instanceof PDFDict &&
            o.get(PDFName.of('FontFile2')) !== undefined,
        )
      expect(descritor).toBeDefined()
      const arquivo = doc.context.lookup(
        (descritor as PDFDict).get(PDFName.of('FontFile2')),
      ) as PDFRawStream
      const fonte = fontkit.create(
        Buffer.from(decodePDFRawStream(arquivo).decode()),
      )
      for (const letra of 'Maria da Conceição Souza'.replace(/\s/g, '')) {
        const glifo = fonte.glyphForCodePoint(letra.codePointAt(0) as number)
        // Os tipos do fontkit não declaram `commands`, mas o contorno vem nele.
        const { commands } = glifo.path as unknown as { commands: unknown[] }
        expect(commands.length, letra).toBeGreaterThan(0)
      }
    })

    it('não embute a Allura quando nenhum campo a usa', async () => {
      expect(await fontesAllura(await gerar(CAMPOS_PADRAO))).toHaveLength(0)
    })

    it('negrito usa a mesma Allura', async () => {
      const bytes = await gerar(
        comAllura.map((c) =>
          c.campo === 'nome' ? { ...c, negrito: true } : c,
        ),
      )
      expect(await fontesAllura(bytes)).toHaveLength(1)
    })

    it('o base64 do Worker é idêntico ao arquivo que a prévia do editor serve', () => {
      const ttf = readFileSync('public/fontes/Allura-Regular.ttf')
      expect(Buffer.from(ALLURA_BASE64, 'base64').equals(ttf)).toBe(true)
    })
  })
})
