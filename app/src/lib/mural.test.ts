import { describe, expect, it } from 'vitest'
import {
  type ArmazemDeRascunho,
  atualizarDados,
  chaveDoRascunho,
  guardarRascunho,
  inserirNoTopo,
  lerRascunho,
  mesclarPaginas,
} from '#/lib/mural'

const item = (id: string, fixada = false) => ({ id, fixada })

describe('mesclarPaginas', () => {
  it('acrescenta a página nova ao fim, sem repetir o que já está na lista', () => {
    const atuais = [item('a'), item('b')]
    expect(
      mesclarPaginas(atuais, [item('b'), item('c')]).map((i) => i.id),
    ).toEqual(['a', 'b', 'c'])
  })
  it('devolve a mesma lista quando nada é novo', () => {
    const atuais = [item('a')]
    expect(mesclarPaginas(atuais, [item('a')])).toBe(atuais)
  })
})

describe('atualizarDados', () => {
  it('troca os dados dos itens conhecidos e mantém a ordem da tela', () => {
    const atuais = [
      { id: 'a', n: 1 },
      { id: 'b', n: 1 },
    ]
    const r = atualizarDados(atuais, [
      { id: 'b', n: 5 },
      { id: 'a', n: 2 },
      { id: 'z', n: 9 },
    ])
    expect(r).toEqual([
      { id: 'a', n: 2 },
      { id: 'b', n: 5 },
    ])
  })
})

describe('inserirNoTopo', () => {
  it('a publicação nova entra logo depois das fixadas', () => {
    const lista = [item('f1', true), item('f2', true), item('x'), item('y')]
    expect(inserirNoTopo(lista, item('novo')).map((i) => i.id)).toEqual([
      'f1',
      'f2',
      'novo',
      'x',
      'y',
    ])
  })
  it('não duplica quando a publicação já veio do servidor', () => {
    const lista = [item('novo'), item('x')]
    expect(inserirNoTopo(lista, item('novo')).map((i) => i.id)).toEqual([
      'novo',
      'x',
    ])
  })
})

function armazemFalso(): ArmazemDeRascunho & { dados: Map<string, string> } {
  const dados = new Map<string, string>()
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
    removeItem: (k) => void dados.delete(k),
  }
}

const rascunho = (extra: Partial<Parameters<typeof guardarRascunho>[2]>) => ({
  titulo: '',
  textoHtml: '',
  comunidadeId: '',
  ...extra,
})

describe('rascunho do mural', () => {
  it('guarda ao cancelar e devolve na volta, por pessoa', () => {
    const a = armazemFalso()
    guardarRascunho(
      a,
      'ana',
      rascunho({ titulo: 'Oi', textoHtml: '<p>x</p>', comunidadeId: 'c1' }),
    )
    expect(lerRascunho(a, 'ana')).toEqual({
      titulo: 'Oi',
      textoHtml: '<p>x</p>',
      comunidadeId: 'c1',
    })
    expect(lerRascunho(a, 'bia')).toBeNull()
    expect(a.dados.has(chaveDoRascunho('ana'))).toBe(true)
  })
  it('rascunho vazio apaga o que estava guardado', () => {
    const a = armazemFalso()
    guardarRascunho(a, 'ana', rascunho({ titulo: 'Oi' }))
    guardarRascunho(
      a,
      'ana',
      rascunho({ titulo: '  ', textoHtml: '<p><br></p>' }),
    )
    expect(lerRascunho(a, 'ana')).toBeNull()
  })
  it('conteúdo corrompido ou armazenamento que falha viram "sem rascunho"', () => {
    const a = armazemFalso()
    a.dados.set(chaveDoRascunho('ana'), '{quebrado')
    expect(lerRascunho(a, 'ana')).toBeNull()
    const quebrado: ArmazemDeRascunho = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(lerRascunho(quebrado, 'ana')).toBeNull()
    expect(() =>
      guardarRascunho(quebrado, 'ana', rascunho({ titulo: 'a' })),
    ).not.toThrow()
  })
})
