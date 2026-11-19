// Lê a planilha de vendas exportada da Voomp (CSV ou XLSX) e a transforma em vendas. Só o que é puro
// mora aqui; comparar com as matrículas é de `conferencia-de-vendas.ts`.
//
// ATENÇÃO: as colunas reais da exportação da Voomp não estão documentadas em lugar nenhum do repo
// (a spec manda conferir na construção). Por isso o mapeamento é por NOME de coluna, com um padrão
// plausível (`APELIDOS`) e a possibilidade de a equipe informar o nome exato de cada coluna na tela.

export class ErroDePlanilha extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDePlanilha'
  }
}

export type Tabela = string[][]

// ---------- CSV ----------

// Aceita BOM, vírgula ou ponto e vírgula (Excel em pt-BR), aspas com "" e quebra de linha dentro
// de aspas. O separador é o que mais aparece fora das aspas na primeira linha.
export function lerCsv(conteudo: string): Tabela {
  const texto = conteudo.replace(/^﻿/, '')
  const primeira = texto.split(/\r?\n/, 1)[0] ?? ''
  const separador = (['\t', ';', ','] as const)
    .map((s) => ({ s, n: primeira.split(s).length }))
    .sort((a, b) => b.n - a.n)[0].s

  const linhas: Tabela = []
  let linha: string[] = []
  let campo = ''
  let dentro = false
  const fecharCampo = () => {
    linha.push(campo)
    campo = ''
  }
  const fecharLinha = () => {
    fecharCampo()
    if (linha.some((c) => c.trim() !== '')) linhas.push(linha)
    linha = []
  }
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (dentro) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else dentro = false
      } else campo += c
    } else if (c === '"') dentro = true
    else if (c === separador) fecharCampo()
    else if (c === '\n') fecharLinha()
    else if (c === '\r') {
      if (texto[i + 1] === '\n') i++
      fecharLinha()
    } else campo += c
  }
  if (campo !== '' || linha.length > 0) fecharLinha()
  return linhas
}

// ---------- XLSX (um zip com XML; só o necessário para ler a primeira aba) ----------

const u16 = (v: DataView, o: number) => v.getUint16(o, true)
const u32 = (v: DataView, o: number) => v.getUint32(o, true)

async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  const fluxo = new Blob([dados as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(fluxo).arrayBuffer())
}

async function lerZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let fim = -1
  for (
    let i = bytes.length - 22;
    i >= Math.max(0, bytes.length - 65_600);
    i--
  ) {
    if (u32(v, i) === 0x06054b50) {
      fim = i
      break
    }
  }
  if (fim < 0) throw new ErroDePlanilha('O arquivo não é um XLSX válido.')
  const total = u16(v, fim + 10)
  let pos = u32(v, fim + 16)
  const arquivos = new Map<string, Uint8Array>()
  const decodificador = new TextDecoder()
  for (let n = 0; n < total; n++) {
    if (u32(v, pos) !== 0x02014b50) {
      throw new ErroDePlanilha('O arquivo não é um XLSX válido.')
    }
    const metodo = u16(v, pos + 10)
    const tamanho = u32(v, pos + 20)
    const nomeLen = u16(v, pos + 28)
    const extraLen = u16(v, pos + 30)
    const comentarioLen = u16(v, pos + 32)
    const local = u32(v, pos + 42)
    const nome = decodificador.decode(
      bytes.subarray(pos + 46, pos + 46 + nomeLen),
    )
    pos += 46 + nomeLen + extraLen + comentarioLen
    if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(nome)) {
      continue
    }
    const inicio = local + 30 + u16(v, local + 26) + u16(v, local + 28)
    const cru = bytes.subarray(inicio, inicio + tamanho)
    if (metodo === 0) arquivos.set(nome, cru)
    else if (metodo === 8) arquivos.set(nome, await inflar(cru))
    else throw new ErroDePlanilha('O XLSX usa uma compressão não suportada.')
  }
  return arquivos
}

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}
const desescapar = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (inteiro, e: string) => {
    if (e[0] === '#') {
      const codigo =
        e[1].toLowerCase() === 'x'
          ? Number.parseInt(e.slice(2), 16)
          : Number.parseInt(e.slice(1), 10)
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteiro
    }
    return ENTIDADES[e.toLowerCase()] ?? inteiro
  })

// Junta todos os <t> de um trecho (texto formatado vem em vários).
function textosDe(trecho: string): string {
  let saida = ''
  for (const m of trecho.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    saida += desescapar(m[1])
  }
  return saida
}

function colunaDe(ref: string): number {
  let n = 0
  for (const c of ref.replace(/[^A-Za-z]/g, '').toUpperCase()) {
    n = n * 26 + (c.charCodeAt(0) - 64)
  }
  return n - 1
}

export async function lerXlsx(bytes: Uint8Array): Promise<Tabela> {
  const arquivos = await lerZip(bytes)
  const decodificador = new TextDecoder()
  const abas = [...arquivos.keys()]
    .filter((n) => n.startsWith('xl/worksheets/'))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  if (abas.length === 0) throw new ErroDePlanilha('O XLSX não tem nenhuma aba.')
  const compartilhadas: string[] = []
  const xmlCompartilhado = arquivos.get('xl/sharedStrings.xml')
  if (xmlCompartilhado) {
    for (const m of decodificador
      .decode(xmlCompartilhado)
      .matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
      compartilhadas.push(textosDe(m[1]))
    }
  }
  const xml = decodificador.decode(arquivos.get(abas[0]) as Uint8Array)
  const tabela: Tabela = []
  for (const linhaXml of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const linha: string[] = []
    for (const celula of linhaXml[1].matchAll(
      /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const atributos = celula[1]
      const ref = /\br="([A-Za-z]+\d*)"/.exec(atributos)?.[1]
      const tipo = /\bt="(\w+)"/.exec(atributos)?.[1]
      const corpo = celula[2] ?? ''
      let valor = ''
      if (tipo === 'inlineStr') valor = textosDe(corpo)
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1] ?? ''
        valor = tipo === 's' ? (compartilhadas[Number(v)] ?? '') : desescapar(v)
      }
      const coluna = ref ? colunaDe(ref) : linha.length
      while (linha.length < coluna) linha.push('')
      linha[coluna] = valor
    }
    if (linha.some((c) => c.trim() !== '')) tabela.push(linha)
  }
  return tabela
}

// CSV ou XLSX, pela assinatura do arquivo (um XLSX começa com "PK").
export async function lerPlanilha(bytes: Uint8Array): Promise<Tabela> {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return lerXlsx(bytes)
  }
  return lerCsv(new TextDecoder('utf-8').decode(bytes))
}

// ---------- Colunas e vendas ----------

export type Campo =
  | 'vendaId'
  | 'email'
  | 'nome'
  | 'produtoId'
  | 'produtoNome'
  | 'ofertaHash'
  | 'status'

export const ROTULO_DO_CAMPO: Record<Campo, string> = {
  vendaId: 'ID da venda',
  email: 'E-mail',
  nome: 'Nome',
  produtoId: 'ID do produto',
  produtoNome: 'Produto',
  ofertaHash: 'Código da oferta',
  status: 'Status',
}

/** Nome exato de coluna por campo, quando a equipe não quer o padrão. */
export type Mapeamento = Partial<Record<Campo, string>>

// Nomes de cabeçalho que o padrão reconhece (já sem acento, em minúsculas e só letras e números),
// do mais para o menos provável. É um palpite: ajuste quando a exportação real for conferida.
export const APELIDOS: Record<Campo, string[]> = {
  vendaId: [
    'idvenda',
    'iddavenda',
    'codigovenda',
    'codigodavenda',
    'idtransacao',
    'iddatransacao',
    'transacao',
    'codigodatransacao',
    'saleid',
    'id',
  ],
  email: [
    'email',
    'emaildocliente',
    'emaildoaluno',
    'emailcliente',
    'clienteemail',
    'customeremail',
  ],
  nome: ['nome', 'nomedocliente', 'nomecliente', 'cliente', 'nomedoaluno'],
  produtoId: [
    'idproduto',
    'iddoproduto',
    'codigoproduto',
    'codigodoproduto',
    'productid',
  ],
  produtoNome: ['produto', 'nomedoproduto', 'nomeproduto', 'product'],
  ofertaHash: [
    'oferta',
    'codigodaoferta',
    'codigooferta',
    'ofertahash',
    'idoferta',
    'iddaoferta',
    'offerhash',
  ],
  status: [
    'status',
    'statusdavenda',
    'statusdopagamento',
    'statuspagamento',
    'situacao',
    'situacaodavenda',
  ],
}

// Valores de status que contam como venda paga.
export const STATUS_PAGOS = new Set([
  'pago',
  'paga',
  'aprovado',
  'aprovada',
  'pagamentoaprovado',
  'approved',
  'paid',
  'completo',
  'completa',
  'concluido',
  'concluida',
  'confirmado',
  'confirmada',
  'finalizado',
  'finalizada',
])

export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export interface VendaDaPlanilha {
  /** Número da linha na planilha (a primeira é a do cabeçalho). */
  linha: number
  vendaId: string
  /** Em minúsculas. */
  email: string
  nome: string | null
  produtoId: string | null
  produtoNome: string | null
  ofertaHash: string | null
  /** Sem coluna de status, toda venda conta como paga. */
  paga: boolean
  status: string | null
}

export interface PlanilhaInterpretada {
  /** Coluna da planilha usada em cada campo. */
  colunas: Partial<Record<Campo, string>>
  vendas: VendaDaPlanilha[]
  /** Linhas sem id da venda ou sem e-mail: não dá para conferir. */
  invalidas: number
  /** Linhas repetidas (mesmo id de venda): só a primeira vale. */
  repetidas: number
  totalLinhas: number
}

export function interpretarVendas(
  tabela: Tabela,
  mapeamento: Mapeamento = {},
): PlanilhaInterpretada {
  if (tabela.length < 2) {
    throw new ErroDePlanilha('A planilha não tem linhas de vendas.')
  }
  const cabecalho = tabela[0].map((c) => c.trim())
  const normalizados = cabecalho.map(normalizar)

  const indices: Partial<Record<Campo, number>> = {}
  for (const campo of Object.keys(APELIDOS) as Campo[]) {
    const pedido = mapeamento[campo]?.trim()
    if (pedido) {
      const i = normalizados.indexOf(normalizar(pedido))
      if (i < 0) {
        throw new ErroDePlanilha(
          `Não achei a coluna "${pedido}" (${ROTULO_DO_CAMPO[campo]}). Colunas da planilha: ${cabecalho.join(', ')}.`,
        )
      }
      indices[campo] = i
      continue
    }
    for (const apelido of APELIDOS[campo]) {
      const i = normalizados.indexOf(apelido)
      if (i >= 0) {
        indices[campo] = i
        break
      }
    }
  }

  const faltando: string[] = []
  if (indices.vendaId === undefined) faltando.push(ROTULO_DO_CAMPO.vendaId)
  if (indices.email === undefined) faltando.push(ROTULO_DO_CAMPO.email)
  if (indices.produtoId === undefined && indices.produtoNome === undefined) {
    faltando.push(
      `${ROTULO_DO_CAMPO.produtoId} ou ${ROTULO_DO_CAMPO.produtoNome}`,
    )
  }
  if (faltando.length > 0) {
    throw new ErroDePlanilha(
      `Não achei a coluna de: ${faltando.join('; ')}. Colunas da planilha: ${cabecalho.join(', ')}. Informe o nome exato da coluna em "Colunas da planilha".`,
    )
  }

  const valor = (linha: string[], campo: Campo): string | null => {
    const i = indices[campo]
    if (i === undefined) return null
    const limpo = (linha[i] ?? '').trim()
    return limpo === '' ? null : limpo
  }

  const vendas: VendaDaPlanilha[] = []
  const vistas = new Set<string>()
  let invalidas = 0
  let repetidas = 0
  for (let n = 1; n < tabela.length; n++) {
    const linha = tabela[n]
    const vendaId = valor(linha, 'vendaId')
    const email = valor(linha, 'email')?.toLowerCase() ?? null
    if (!vendaId || !email?.includes('@')) {
      invalidas++
      continue
    }
    if (vistas.has(vendaId)) {
      repetidas++
      continue
    }
    vistas.add(vendaId)
    const status = valor(linha, 'status')
    vendas.push({
      linha: n + 1,
      vendaId,
      email,
      nome: valor(linha, 'nome'),
      produtoId: valor(linha, 'produtoId'),
      produtoNome: valor(linha, 'produtoNome'),
      ofertaHash: valor(linha, 'ofertaHash'),
      status,
      paga: status === null ? true : STATUS_PAGOS.has(normalizar(status)),
    })
  }

  const colunas: Partial<Record<Campo, string>> = {}
  for (const [campo, i] of Object.entries(indices) as [Campo, number][]) {
    colunas[campo] = cabecalho[i]
  }
  return {
    colunas,
    vendas,
    invalidas,
    repetidas,
    totalLinhas: tabela.length - 1,
  }
}
