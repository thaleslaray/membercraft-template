import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { BotaoExcluir } from '#/components/painel/botao-excluir'
import { BotoesDeOrdem } from '#/components/painel/botoes-de-ordem'
import { VazioDoPainel } from '#/components/painel/estados'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import { FormularioDeNome } from '#/components/painel/formulario-de-nome'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import {
  excluirCategoriaFn,
  excluirCursoFn,
  painelDeConteudoFn,
  reordenarFn,
  salvarCategoriaFn,
  salvarCursoFn,
} from '#/lib/conteudo-fns'
import { moverNaLista } from '#/lib/ordem'
import { LIMITE_DO_NOME, validarNome } from '#/regras/formulario-do-curso'

export const Route = createFileRoute('/painel/conteudo/')({
  loader: () => painelDeConteudoFn(),
  head: () => ({ meta: [{ title: 'Cursos · Estúdio' }] }),
  component: Conteudo,
})

const campoNome = () => 'nome'

function Conteudo() {
  const { categorias, cursos } = Route.useLoaderData()
  const { executar, ocupado } = useAcao()
  const criacaoDeCurso = useAcao()
  const criacaoDeCategoria = useAcao()
  const navegar = useNavigate()
  const [novaCategoria, setNovaCategoria] = useState('')
  const [novoCurso, setNovoCurso] = useState('')

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Cursos"
        contexto="Os cursos e as categorias da vitrine. Abra um curso para cuidar dos módulos e das aulas."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cursos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {cursos.length === 0 && (
            <VazioDoPainel
              mensagem="Nenhum curso ainda. Escreva o nome do primeiro curso aqui embaixo e crie: você já cai na página dele para montar módulos e aulas."
              className="p-4 md:p-4"
            />
          )}
          <ul className="flex flex-col divide-y rounded-md border empty:hidden">
            {cursos.map((c, i) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2"
              >
                <Link
                  to="/painel/conteudo/$cursoId"
                  params={{ cursoId: c.id }}
                  className="min-w-0 flex-1 basis-48 font-medium break-words no-underline hover:underline"
                >
                  {c.nome}
                </Link>
                {c.mostrarATodos && (
                  <EtiquetaDeEstado tom="ok">Visível a todos</EtiquetaDeEstado>
                )}
                <div className="ml-auto flex items-center">
                  <BotoesDeOrdem
                    rotulo={`curso ${c.nome}`}
                    naPrimeira={i === 0}
                    naUltima={i === cursos.length - 1}
                    aoMover={(d) =>
                      executar(() =>
                        reordenarFn({
                          data: {
                            entidade: 'curso',
                            ids: moverNaLista(
                              cursos.map((x) => x.id),
                              c.id,
                              d,
                            ),
                          },
                        }),
                      )
                    }
                  />
                  <BotaoExcluir
                    icone
                    rotulo={`Excluir curso ${c.nome}`}
                    titulo="Excluir este curso?"
                    descricao={`“${c.nome}” sai com todos os módulos e aulas. Dá para desfazer por 30 dias.`}
                    disabled={ocupado}
                    onConfirmado={() =>
                      executar(
                        () => excluirCursoFn({ data: { id: c.id } }),
                        'Curso excluído.',
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
          <FormularioDeNome
            rotulo="Novo curso"
            nomeAcessivel="Nome do novo curso"
            placeholder="Nome do novo curso"
            salvar="Criar curso"
            valor={novoCurso}
            onChange={setNovoCurso}
            erros={criacaoDeCurso.erros}
            ocupado={criacaoDeCurso.ocupado}
            onCancelar={() => {
              setNovoCurso('')
              criacaoDeCurso.limparErros()
            }}
            onEnviar={async () => {
              const id = await criacaoDeCurso.executar(
                () => salvarCursoFn({ data: { nome: novoCurso } }),
                undefined,
                {
                  validar: () => ({
                    nome: validarNome(novoCurso, 'nome do curso'),
                  }),
                  campoDoErro: campoNome,
                },
              )
              if (id) {
                setNovoCurso('')
                navegar({
                  to: '/painel/conteudo/$cursoId',
                  params: { cursoId: id },
                })
              }
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {categorias.length === 0 && (
            <VazioDoPainel
              mensagem="Sem categorias: os cursos aparecem num grupo só. Crie uma para agrupá-los na vitrine."
              className="p-4 md:p-4"
            />
          )}
          <ul className="flex flex-col divide-y rounded-md border empty:hidden">
            {categorias.map((c, i) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2"
              >
                <NomeEditavel
                  valor={c.nome}
                  rotulo={`Nome da categoria ${c.nome}`}
                  aoSalvar={(nome) =>
                    executar(
                      () => salvarCategoriaFn({ data: { id: c.id, nome } }),
                      'Categoria salva.',
                    )
                  }
                />
                <div className="ml-auto flex items-center">
                  <BotoesDeOrdem
                    rotulo={`categoria ${c.nome}`}
                    naPrimeira={i === 0}
                    naUltima={i === categorias.length - 1}
                    aoMover={(d) =>
                      executar(() =>
                        reordenarFn({
                          data: {
                            entidade: 'categoria',
                            ids: moverNaLista(
                              categorias.map((x) => x.id),
                              c.id,
                              d,
                            ),
                          },
                        }),
                      )
                    }
                  />
                  <BotaoExcluir
                    icone
                    rotulo={`Excluir categoria ${c.nome}`}
                    titulo="Excluir esta categoria?"
                    descricao={`Os cursos de “${c.nome}” ficam sem categoria.`}
                    disabled={ocupado}
                    onConfirmado={() =>
                      executar(
                        () => excluirCategoriaFn({ data: { id: c.id } }),
                        'Categoria excluída.',
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
          <FormularioDeNome
            rotulo="Nova categoria"
            nomeAcessivel="Nome da nova categoria"
            placeholder="Nome da nova categoria"
            salvar="Criar categoria"
            valor={novaCategoria}
            onChange={setNovaCategoria}
            erros={criacaoDeCategoria.erros}
            ocupado={criacaoDeCategoria.ocupado}
            onEnviar={async () => {
              const ok = await criacaoDeCategoria.executar(
                () =>
                  salvarCategoriaFn({ data: { nome: novaCategoria } }).then(
                    () => true,
                  ),
                'Categoria criada.',
                {
                  validar: () => ({
                    nome: validarNome(novaCategoria, 'nome da categoria'),
                  }),
                  campoDoErro: campoNome,
                },
              )
              if (ok) setNovaCategoria('')
            }}
          />
        </CardContent>
      </Card>
    </PaginaDoPainel>
  )
}

function NomeEditavel({
  valor,
  rotulo,
  aoSalvar,
}: {
  valor: string
  rotulo: string
  aoSalvar: (nome: string) => void
}) {
  const [nome, setNome] = useState(valor)
  return (
    <Input
      value={nome}
      aria-label={rotulo}
      maxLength={LIMITE_DO_NOME}
      autoComplete="off"
      onChange={(e) => setNome(e.target.value)}
      onBlur={() => {
        if (nome.trim() && nome !== valor) aoSalvar(nome)
        else setNome(valor)
      }}
      className="h-8 min-w-0 flex-1 basis-48 toque:h-11"
    />
  )
}
