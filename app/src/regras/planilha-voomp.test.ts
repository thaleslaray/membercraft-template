import { readFileSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  ErroDePlanilha,
  interpretarVendas,
  lerCsv,
  lerPlanilha,
  lerXlsx,
} from '#/regras/planilha-voomp'

const fixture = (nome: string) =>
  new Uint8Array(readFileSync(`src/test/fixtures/planilha/${nome}`))

// Monta um XLSX mínimo (zip com deflate) só com o que o leitor usa.
function montarXlsx(
  abas: Record<string, string>,
  compartilhadas?: string,
  comprimir = true,
): Uint8Array {
  const arquivos: Record<string, string> = {}
  for (const [nome, xml] of Object.entries(abas)) {
    arquivos[`xl/worksheets/${nome}.xml`] = xml
  }
  if (compartilhadas) arquivos['xl/sharedStrings.xml'] = compartilhadas
  const partes: Buffer[] = []
  const central: Buffer[] = []
  let deslocamento = 0
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const cru = Buffer.from(conteudo)
    const dados = comprimir ? deflateRawSync(cru) : cru
    const nomeBuf = Buffer.from(nome)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(comprimir ? 8 : 0, 8)
    local.writeUInt32LE(dados.length, 18)
    local.writeUInt32LE(cru.length, 22)
    local.writeUInt16LE(nomeBuf.length, 26)
    partes.push(local, nomeBuf, dados)
    const entrada = Buffer.alloc(46)
    entrada.writeUInt32LE(0x02014b50, 0)
    entrada.writeUInt16LE(comprimir ? 8 : 0, 10)
    entrada.writeUInt32LE(dados.length, 20)
    entrada.writeUInt32LE(cru.length, 24)
    entrada.writeUInt16LE(nomeBuf.length, 28)
    entrada.writeUInt32LE(deslocamento, 42)
    central.push(entrada, nomeBuf)
    deslocamento += local.length + nomeBuf.length + dados.length
  }
  const diretorio = Buffer.concat(central)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(Object.keys(arquivos).length, 10)
  fim.writeUInt32LE(diretorio.length, 12)
  fim.writeUInt32LE(deslocamento, 16)
  return new Uint8Array(Buffer.concat([...partes, diretorio, fim]))
}

const SHARED = `<?xml version="1.0"?><sst><si><t>ID da venda</t></si><si><t>E-mail</t></si><si><t>Produto</t></si><si><t>Status</t></si><si><r><t>Ana </t></r><r><t>&amp; Cia</t></r></si><si><t>ana@exemplo.test</t></si><si><t>Curso Acessórios</t></si><si><t>Pago</t></si></sst>`
const ABA = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
<row r="2"><c r="A2"><v>3001</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="inlineStr"><is><t>Pago</t></is></c></row>
<row r="3"><c r="A3"><v>3002</v></c><c r="C3" t="s"><v>4</v></c></row>
</sheetData></worksheet>`

describe('lerCsv', () => {
  it('lê ponto e vírgula, BOM, aspas, aspas duplas e linhas vazias', () => {
    const tabela = lerCsv(
      new TextDecoder().decode(fixture('vendas-voomp-exemplo.csv')),
    )
    expect(tabela[0][0]).toBe('ID da venda')
    expect(tabela[1]).toEqual([
      '1001',
      'Pago',
      'Ana Souza',
      'Ana@Exemplo.test',
      '500',
      'Curso Acessórios',
      '',
      '197,00',
    ])
    expect(tabela[4][2]).toBe('Dani "Dee" Alves')
  })

  it('usa a vírgula quando é o separador e aceita quebra de linha dentro de aspas', () => {
    expect(lerCsv('a,b\n"x\ny",2\n\n')).toEqual([
      ['a', 'b'],
      ['x\ny', '2'],
    ])
  })
})

describe('lerXlsx', () => {
  it('lê a primeira aba: textos compartilhados, formatados, inline, números e células vazias', async () => {
    const tabela = await lerXlsx(montarXlsx({ sheet1: ABA }, SHARED))
    expect(tabela).toEqual([
      ['ID da venda', 'E-mail', 'Produto', 'Status'],
      ['3001', 'ana@exemplo.test', 'Curso Acessórios', 'Pago'],
      ['3002', '', 'Ana & Cia'],
    ])
  })

  it('lê arquivos sem compressão e escolhe a aba de menor número', async () => {
    const tabela = await lerPlanilha(
      montarXlsx(
        { sheet2: '<row><c r="A1"><v>2</v></c></row>', sheet1: ABA },
        SHARED,
        false,
      ),
    )
    expect(tabela[0][0]).toBe('ID da venda')
  })

  it('recusa arquivo que não é XLSX', async () => {
    await expect(lerXlsx(new TextEncoder().encode('PK nada'))).rejects.toThrow(
      ErroDePlanilha,
    )
  })
})

describe('lerPlanilha', () => {
  it('reconhece CSV pelo conteúdo', async () => {
    const tabela = await lerPlanilha(
      fixture('vendas-so-com-nome-do-produto.csv'),
    )
    expect(tabela[0]).toEqual([
      'Transação',
      'Situação',
      'Cliente',
      'Email',
      'Produto',
    ])
  })
})

describe('interpretarVendas', () => {
  const tabela = lerCsv(
    new TextDecoder().decode(fixture('vendas-voomp-exemplo.csv')),
  )

  it('acha as colunas pelo nome padrão e normaliza e-mail em minúsculas', () => {
    const r = interpretarVendas(tabela)
    expect(r.colunas).toMatchObject({
      vendaId: 'ID da venda',
      email: 'E-mail',
      produtoId: 'ID do produto',
      produtoNome: 'Produto',
      ofertaHash: 'Código da oferta',
      status: 'Status',
      nome: 'Nome do cliente',
    })
    expect(r.vendas[0]).toMatchObject({
      vendaId: '1001',
      email: 'ana@exemplo.test',
      produtoId: '500',
      ofertaHash: null,
      paga: true,
      linha: 2,
    })
    expect(r.vendas[1].ofertaHash).toBe('OF1')
  })

  it('separa as não pagas, as repetidas e as sem id ou e-mail', () => {
    const r = interpretarVendas(tabela)
    expect(r.totalLinhas).toBe(7)
    expect(r.vendas.map((v) => v.vendaId)).toEqual([
      '1001',
      '1002',
      '1003',
      '1004',
    ])
    expect(r.vendas.find((v) => v.vendaId === '1003')?.paga).toBe(false)
    expect(r.repetidas).toBe(1)
    expect(r.invalidas).toBe(2)
  })

  it('sem coluna de status, toda venda conta como paga', () => {
    const r = interpretarVendas([
      ['Código da venda', 'E-mail', 'Produto'],
      ['1', 'a@x.test', 'P'],
    ])
    expect(r.vendas[0].paga).toBe(true)
    expect(r.vendas[0].status).toBeNull()
  })

  it('o mapeamento por nome vence o padrão', () => {
    const r = interpretarVendas(
      [
        ['Número', 'Contato', 'Item', 'ID'],
        ['77', 'a@x.test', 'P', 'errado'],
      ],
      { vendaId: 'número', email: 'CONTATO', produtoNome: 'Item' },
    )
    expect(r.vendas[0]).toMatchObject({ vendaId: '77', produtoNome: 'P' })
  })

  it('avisa quais colunas faltam, listando as da planilha', () => {
    expect(() =>
      interpretarVendas([
        ['Coluna A', 'Coluna B'],
        ['1', '2'],
      ]),
    ).toThrow(
      /ID da venda; E-mail; ID do produto ou Produto.*Coluna A, Coluna B/,
    )
  })

  it('recusa um nome de coluna que não existe e planilha vazia', () => {
    expect(() =>
      interpretarVendas(tabela, { email: 'Correio eletrônico' }),
    ).toThrow(/Não achei a coluna "Correio eletrônico"/)
    expect(() => interpretarVendas([['a']])).toThrow(ErroDePlanilha)
  })

  it('reconhece status variados como pago', () => {
    const r = interpretarVendas([
      ['ID', 'E-mail', 'Produto', 'Status'],
      ['1', 'a@x.test', 'P', 'Aprovada'],
      ['2', 'b@x.test', 'P', 'PAID'],
      ['3', 'c@x.test', 'P', 'Aguardando pagamento'],
    ])
    expect(r.vendas.map((v) => v.paga)).toEqual([true, true, false])
  })
})
