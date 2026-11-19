import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { BotaoExcluir } from '#/components/painel/botao-excluir'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { SecaoDoPainel } from '#/components/painel/secao-do-painel'
import { TabelaDoPainel } from '#/components/painel/tabela'
import { useAcao } from '#/components/painel/use-acao'
import { Input } from '#/components/ui/input'
import { SelectNativo } from '#/components/ui/select-nativo'
import {
  adicionarNaEquipeFn,
  equipeFn,
  removerDaEquipeFn,
  trocarPerfilFn,
} from '#/lib/equipe-fns'
import { rotuloDoPerfil } from '#/regras/permissoes'

// Equipe do Estúdio: só o Proprietário (`gerir-equipe`).
export const Route = createFileRoute('/painel/equipe')({
  loader: () => equipeFn(),
  head: () => ({ meta: [{ title: 'Equipe · Estúdio' }] }),
  component: Equipe,
})

type Perfil = 'equipe' | 'proprietario'

function SeletorDePerfil({
  id,
  nome,
  valor,
  aoMudar,
  desabilitado,
}: {
  id?: string
  nome?: string
  valor: Perfil
  aoMudar: (perfil: Perfil) => void
  desabilitado?: boolean
}) {
  return (
    <SelectNativo
      id={id}
      aria-label={nome ? `Perfil de ${nome}` : undefined}
      value={valor}
      disabled={desabilitado}
      onChange={(e) => aoMudar(e.target.value as Perfil)}
    >
      <option value="equipe">{rotuloDoPerfil('equipe')}</option>
      <option value="proprietario">{rotuloDoPerfil('proprietario')}</option>
    </SelectNativo>
  )
}

function Equipe() {
  const { meuId, pessoas } = Route.useLoaderData()
  const { executar, ocupado, erros } = useAcao()
  const [email, setEmail] = useState('')
  const [perfil, setPerfil] = useState<Perfil>('equipe')

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Equipe"
        contexto="Quem administra a área. A Equipe cuida do dia a dia; o Proprietário também mexe no que é sensível. A área nunca fica sem Proprietário."
      />

      <SecaoDoPainel titulo="Adicionar pessoa">
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault()
            const feito = await executar(
              () => adicionarNaEquipeFn({ data: { email, perfil } }),
              'Pessoa adicionada. Ela entra com o código enviado ao e-mail.',
              {
                validar: () => ({
                  email: email.trim() ? undefined : 'Informe o e-mail.',
                }),
              },
            )
            if (feito) setEmail('')
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <CampoDoPainel rotulo="E-mail" erro={erros.email}>
              <Input
                id="equipe-email"
                type="email"
                autoComplete="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pessoa@exemplo.com"
              />
            </CampoDoPainel>
            <CampoDoPainel rotulo="Perfil">
              <SeletorDePerfil
                id="equipe-perfil"
                valor={perfil}
                aoMudar={setPerfil}
              />
            </CampoDoPainel>
          </div>
          <p className="text-xs text-muted-foreground">
            Quem já é aluno passa a ter também o perfil escolhido, com as
            matrículas de sempre. Quem ainda não tem conta ganha uma.
          </p>
          <AcoesDoFormulario
            salvar="Adicionar"
            ocupado={ocupado}
            alterado={email.trim() !== ''}
            erros={erros}
          />
        </form>
      </SecaoDoPainel>

      <section
        aria-labelledby="pessoas-da-equipe"
        className="flex flex-col gap-3"
      >
        <h2 id="pessoas-da-equipe" className="text-base font-semibold">
          Pessoas da equipe
        </h2>
        <TabelaDoPainel
          rotulo="Pessoas da equipe"
          linhas={pessoas}
          chave={(p) => p.id}
          testIdDaLinha={(p) => `pessoa-${p.email}`}
          colunas={[
            {
              rotulo: 'Pessoa',
              essencial: true,
              className: 'md:min-w-56',
              celula: (p) => (
                <>
                  <div className="font-medium">
                    {p.nome}
                    {p.id === meuId && (
                      <EtiquetaDeEstado className="ml-2">Você</EtiquetaDeEstado>
                    )}
                  </div>
                  <div className="text-muted-foreground [overflow-wrap:anywhere]">
                    {p.email}
                  </div>
                </>
              ),
            },
            {
              rotulo: 'Perfil',
              essencial: true,
              className: 'md:w-52',
              celula: (p) => (
                <SeletorDePerfil
                  nome={p.nome}
                  valor={p.perfil as Perfil}
                  desabilitado={ocupado}
                  aoMudar={(novo) =>
                    executar(
                      () =>
                        trocarPerfilFn({
                          data: { pessoaId: p.id, perfil: novo },
                        }),
                      'Perfil trocado.',
                    )
                  }
                />
              ),
            },
            {
              rotulo: 'Ações',
              rotuloOculto: true,
              essencial: true,
              celula: (p) => (
                <BotaoExcluir
                  rotulo="Remover da equipe"
                  titulo={`Remover ${p.email} da equipe?`}
                  descricao="Ela volta a ser aluna, com as matrículas que tem."
                  acao="Remover"
                  disabled={ocupado}
                  onConfirmado={() =>
                    executar(
                      () => removerDaEquipeFn({ data: { pessoaId: p.id } }),
                      'Pessoa removida da equipe.',
                    )
                  }
                />
              ),
            },
          ]}
        />
      </section>
    </PaginaDoPainel>
  )
}
