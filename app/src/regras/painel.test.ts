import { describe, expect, it } from 'vitest'
import {
  abaAtiva,
  areaDaRota,
  ESTADO_DO_AVISO,
  menuAbertoNoCookie,
  paginaNaBusca,
  temErros,
  textoConfere,
} from '#/regras/painel'

describe('regras do painel', () => {
  it('área da rota: painel e estúdio são da equipe; o resto é do aluno', () => {
    expect(areaDaRota('/painel')).toBe('painel')
    expect(areaDaRota('/painel/vendas')).toBe('painel')
    expect(areaDaRota('/estudio/aparencia')).toBe('painel')
    expect(areaDaRota('/')).toBe('aluno')
    expect(areaDaRota('/painelzinho')).toBe('aluno')
    expect(areaDaRota('/aulas/painel')).toBe('aluno')
  })

  it('menu lateral: só abre recolhido com o cookie em false', () => {
    expect(menuAbertoNoCookie(null)).toBe(true)
    expect(menuAbertoNoCookie('')).toBe(true)
    expect(menuAbertoNoCookie('a=1; sidebar_state=false')).toBe(false)
    expect(menuAbertoNoCookie('sidebar_state=true; b=2')).toBe(true)
    expect(menuAbertoNoCookie('outro_sidebar_state=false')).toBe(true)
  })

  it('texto da confirmação confere sem maiúsculas nem espaços das pontas', () => {
    expect(textoConfere(' Ana@Exemplo.com ', 'ana@exemplo.com')).toBe(true)
    expect(textoConfere('ana@exemplo', 'ana@exemplo.com')).toBe(false)
    expect(textoConfere('', '')).toBe(false)
  })

  it('erros do formulário', () => {
    expect(temErros({})).toBe(false)
    expect(temErros(null)).toBe(false)
    expect(temErros({ titulo: undefined })).toBe(false)
    expect(temErros({ titulo: 'Dê um título à aula.' })).toBe(true)
  })

  it('página na busca: a primeira some', () => {
    expect(paginaNaBusca(1)).toBeUndefined()
    expect(paginaNaBusca(0)).toBeUndefined()
    expect(paginaNaBusca(1.5)).toBeUndefined()
    expect(paginaNaBusca(3)).toBe(3)
  })

  it('estado do aviso de venda: erro em perigo, sem turma em atenção, aplicada ok', () => {
    expect(ESTADO_DO_AVISO.com_erro).toEqual({
      rotulo: 'Com erro',
      tom: 'perigo',
    })
    expect(ESTADO_DO_AVISO.sem_turma.tom).toBe('atencao')
    expect(ESTADO_DO_AVISO.aplicada.tom).toBe('ok')
    expect(ESTADO_DO_AVISO.recebida.tom).toBe('neutro')
  })

  it('aba ativa: prefixo, exata, parâmetros e busca', () => {
    const raiz = { para: '/painel/vendas', exata: true }
    expect(abaAtiva(raiz, '/painel/vendas', {})).toBe(true)
    expect(abaAtiva(raiz, '/painel/vendas/produtos', {})).toBe(false)
    expect(
      abaAtiva(
        { para: '/painel/vendas/produtos' },
        '/painel/vendas/produtos/x',
        {},
      ),
    ).toBe(true)
    const doCurso = {
      para: '/painel/conteudo/$cursoId/alunos',
      params: { cursoId: 'c1' },
    }
    expect(abaAtiva(doCurso, '/painel/conteudo/c1/alunos', {})).toBe(true)
    expect(abaAtiva(doCurso, '/painel/conteudo/c2/alunos', {})).toBe(false)
    const comErro = { para: '/painel/vendas', search: { situacao: 'com_erro' } }
    expect(abaAtiva(comErro, '/painel/vendas', { situacao: 'com_erro' })).toBe(
      true,
    )
    expect(abaAtiva(comErro, '/painel/vendas', {})).toBe(false)
  })
})
