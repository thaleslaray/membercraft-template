import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  CampoDoFio,
  ListaDoFio,
  type Pendente,
  TEMPO_DE_RESPOSTA,
  useAgora,
  useNoFimDoFio,
} from '#/components/atendimento/fio'
import {
  FAIXA_NA_REGUA,
  PAGINA_NA_REGUA,
  TITULO_DA_PAGINA,
} from '#/components/casca-lume/pagina-lume'
import { EsqueletoDoAtendimento } from '#/components/vazio/esqueletos'
import { TelaVazia } from '#/components/vazio/tela-vazia'
import { appConfig } from '#/config/app'
import { fioFn, mandarNoFioFn } from '#/lib/atendimento-fns'
import { useFusoDoAluno } from '#/lib/auth-queries'
import { toast } from '#/lib/toast'

// Atendimento da aluna: uma conversa só com a escola, como no celular. As conversas continuam
// separadas no banco e no painel; aqui aparece o fio com as mensagens de todas, em ordem.
export const Route = createFileRoute('/_aluno/atendimento/')({
  head: () => ({ meta: [{ title: `Atendimento · ${appConfig.name}` }] }),
  loader: () => fioFn(),
  pendingComponent: EsqueletoDoAtendimento,
  component: Fio,
})

function Fio() {
  const { mensagens, cursos } = Route.useLoaderData()
  const router = useRouter()
  const fuso = useFusoDoAluno()
  const agora = useAgora()
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [enviadaRecente, setEnviadaRecente] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(temporizador.current), [])

  useNoFimDoFio(mensagens.length + pendentes.length)

  async function enviar(p: Pendente) {
    setEnviadaRecente(false)
    clearTimeout(temporizador.current)
    try {
      await mandarNoFioFn({
        data: {
          cursoId: p.cursoId,
          texto: p.texto,
          anexos: p.anexos,
          chaveDeEnvio: p.chaveDeEnvio,
        },
      })
      await router.invalidate()
      setPendentes((atuais) =>
        atuais.filter((x) => x.chaveDeEnvio !== p.chaveDeEnvio),
      )
      setEnviadaRecente(true)
      temporizador.current = setTimeout(() => setEnviadaRecente(false), 4000)
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Não deu certo. Tente de novo.',
      )
      setPendentes((atuais) =>
        atuais.map((x) =>
          x.chaveDeEnvio === p.chaveDeEnvio ? { ...x, estado: 'falhou' } : x,
        ),
      )
    }
  }

  function mandar(m: {
    texto: string
    anexos: string[]
    cursoId: string | null
  }) {
    const novo: Pendente = {
      ...m,
      chaveDeEnvio: crypto.randomUUID(),
      estado: 'enviando',
    }
    setPendentes((atuais) => [...atuais, novo])
    void enviar(novo)
  }

  function tentarDeNovo(p: Pendente) {
    const de_novo: Pendente = { ...p, estado: 'enviando' }
    setPendentes((atuais) =>
      atuais.map((x) => (x.chaveDeEnvio === p.chaveDeEnvio ? de_novo : x)),
    )
    void enviar(de_novo)
  }

  const vazio = mensagens.length === 0 && pendentes.length === 0

  return (
    <main
      className={`mx-auto flex w-full max-w-[49rem] flex-1 flex-col px-4 md:px-8 ${PAGINA_NA_REGUA}`}
    >
      <header className="flex flex-col gap-1 pt-6 pb-4 md:pt-10">
        <h1
          className={`text-2xl leading-8 font-semibold tracking-[-0.01em] ${TITULO_DA_PAGINA}`}
        >
          Falar com a equipe
        </h1>
        <p className="text-sm text-muted-foreground">{TEMPO_DE_RESPOSTA}</p>
      </header>

      <div className="flex flex-1 flex-col justify-end pb-4">
        {vazio ? (
          <TelaVazia
            ilustracao="carretel"
            titulo="Nenhuma mensagem ainda"
            texto="Escreva sua dúvida abaixo. A equipe responde por aqui e por e-mail."
          />
        ) : (
          <ListaDoFio
            mensagens={mensagens}
            pendentes={pendentes}
            fuso={fuso}
            agora={agora}
            enviadaRecente={enviadaRecente}
            aoTentarDeNovo={tentarDeNovo}
          />
        )}
      </div>

      {/* Preso ao pé, sobre a conversa; no celular fica acima das abas. */}
      <div
        className={`material-barra sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 px-4 py-3 md:bottom-0 md:-mx-8 md:px-8 ${FAIXA_NA_REGUA}`}
      >
        <CampoDoFio cursos={cursos} aoEnviar={mandar} />
      </div>
    </main>
  )
}
