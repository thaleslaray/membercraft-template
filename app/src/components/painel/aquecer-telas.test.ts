import { describe, expect, it } from 'vitest'

import { telasMaisAbertas } from '#/components/painel/aquecer-telas'

const menu = ['/painel/conteudo', '/painel/alunos', '/painel/vendas']

describe('telasMaisAbertas', () => {
  it('escolhe as duas mais abertas, fora a atual', () => {
    expect(
      telasMaisAbertas(
        { '/painel/conteudo': 9, '/painel/alunos': 5, '/painel/vendas': 7 },
        menu,
        '/painel/conteudo',
      ),
    ).toEqual(['/painel/vendas', '/painel/alunos'])
  })

  it('não aquece tela fora do menu do perfil', () => {
    expect(
      telasMaisAbertas(
        { '/painel/equipe': 50, '/painel/alunos': 1 },
        menu,
        undefined,
      ),
    ).toEqual(['/painel/alunos'])
  })

  it('sem visita registrada, não aquece nada', () => {
    expect(telasMaisAbertas({}, menu, undefined)).toEqual([])
  })

  it('no empate vale a ordem do menu', () => {
    expect(
      telasMaisAbertas(
        { '/painel/vendas': 2, '/painel/alunos': 2, '/painel/conteudo': 2 },
        menu,
        undefined,
      ),
    ).toEqual(['/painel/conteudo', '/painel/alunos'])
  })
})
