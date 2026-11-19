import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Server function GET leva os dados no endereço do pedido. Uma lista que cresce com os dados
// (ex.: as 193 aulas da Formação) estoura o limite do endereço, e a página quebra na
// navegação pelo site ("expected content-type header to be set"), embora abra direto pelo
// endereço, onde a função roda no servidor sem pedido HTTP. Lista vai por POST.
describe('server functions GET', () => {
  it('não recebem listas', () => {
    const pasta = join(__dirname)
    const comLista: string[] = []
    for (const arquivo of readdirSync(pasta).filter((f) =>
      f.endsWith('-fns.ts'),
    )) {
      const texto = readFileSync(join(pasta, arquivo), 'utf8')
      const blocos = texto.split(/export const /).slice(1)
      for (const bloco of blocos) {
        const nome = bloco.slice(0, bloco.indexOf(' '))
        const definicao = bloco.slice(0, bloco.indexOf('.handler('))
        if (
          definicao.includes("method: 'GET'") &&
          /z\.array\(/.test(definicao)
        ) {
          comLista.push(`${arquivo}: ${nome}`)
        }
      }
    }
    expect(comLista).toEqual([])
  })
})
