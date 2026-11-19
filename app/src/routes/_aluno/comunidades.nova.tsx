import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Voltar } from '#/components/casca/voltar'
import {
  BOTAO_FORTE,
  PAGINA_NA_REGUA,
  TITULO_DA_PAGINA,
} from '#/components/casca-lume/pagina-lume'
import { FormularioDePublicacao } from '#/components/comunidade/formulario-de-publicacao'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { EsqueletoDeNovaPublicacao } from '#/components/vazio/esqueletos'
import { TelaVazia } from '#/components/vazio/tela-vazia'
import { appConfig } from '#/config/app'
import { comunidadesFn, criarPublicacaoFn } from '#/lib/comunidade-fns'
import { exigirComunidadeLigada } from '#/lib/guardas'

// Nova publicação: escolhe a comunidade (só aparecem as em que a pessoa pode publicar) e escreve.
export const Route = createFileRoute('/_aluno/comunidades/nova')({
  beforeLoad: ({ context }) => exigirComunidadeLigada(context),
  head: () => ({ meta: [{ title: `Nova publicação · ${appConfig.name}` }] }),
  validateSearch: (search: Record<string, unknown>): { comunidade?: string } =>
    typeof search.comunidade === 'string' && search.comunidade
      ? { comunidade: search.comunidade }
      : {},
  loader: () => comunidadesFn(),
  pendingComponent: EsqueletoDeNovaPublicacao,
  component: NovaPublicacao,
})

function NovaPublicacao() {
  const { comunidades } = Route.useLoaderData()
  const { comunidade } = Route.useSearch()
  const navegar = useNavigate()
  const possiveis = comunidades.filter((c) => c.podePublicar)
  const [comunidadeId, setComunidadeId] = useState(
    possiveis.find((c) => c.id === comunidade)?.id ?? possiveis[0]?.id ?? '',
  )

  if (possiveis.length === 0) {
    return (
      <main
        className={`flex flex-1 flex-col gap-3 mx-auto w-full max-w-[49rem] px-4 pt-6 pb-8 md:px-8 md:py-14 ${PAGINA_NA_REGUA}`}
      >
        <div className="flex flex-col gap-1">
          <h1
            className={`text-2xl leading-8 font-semibold ${TITULO_DA_PAGINA}`}
          >
            Nova publicação
          </h1>
        </div>
        <TelaVazia
          ilustracao="agulha"
          titulo="Você não pode publicar agora"
          texto="Nenhuma comunidade está aberta para você publicar."
          acao={
            <Button asChild className={BOTAO_FORTE}>
              <Link to="/comunidades">Voltar às comunidades</Link>
            </Button>
          }
        />
      </main>
    )
  }

  return (
    <main
      className={`flex flex-1 flex-col gap-6 mx-auto w-full max-w-[49rem] px-4 pt-6 pb-8 md:px-8 md:py-14 ${PAGINA_NA_REGUA}`}
    >
      <Voltar destino={{ to: '/comunidades' }}>Comunidade</Voltar>
      <div className="flex flex-col gap-1">
        <h1 className={`text-2xl leading-8 font-semibold ${TITULO_DA_PAGINA}`}>
          Nova publicação
        </h1>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="comunidade-da-publicacao">Comunidade</Label>
        <select
          id="comunidade-da-publicacao"
          value={comunidadeId}
          onChange={(e) => setComunidadeId(e.target.value)}
          className="h-9 toque:h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {possiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
      <FormularioDePublicacao
        rotuloDoBotao="Publicar"
        aoCancelar={() => navegar({ to: '/comunidades' })}
        aoEnviar={async (dados) => {
          const { id } = await criarPublicacaoFn({
            data: { comunidadeId, ...dados },
          })
          await navegar({
            to: '/comunidades/publicacoes/$publicacaoId',
            params: { publicacaoId: id },
          })
        }}
      />
    </main>
  )
}
