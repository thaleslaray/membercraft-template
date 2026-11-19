import { useRouter } from '@tanstack/react-router'
import { ArrowRight, Check, ChevronLeft } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { appConfig } from '#/config/app'
import { enviarTentativaFn } from '#/lib/quiz-fns'
import { cn } from '#/lib/utils'
import { LIMITE_DO_TEXTO_LIVRE } from '#/regras/entregas'
import { personalizarMensagem } from '#/regras/nome-na-aula'
import type { DetalheDaTentativa, QuizParaOAluno } from '#/regras/quiz'
import {
  chaveDoRascunho,
  lerRascunho,
  mensagensDeAbertura,
  pedeCampoLongo,
  respondida,
  textoDaResposta,
} from '#/regras/quiz-em-conversa'

type Pergunta = QuizParaOAluno['perguntas'][number]

const reduzMovimento = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Quiz em conversa (substitui o formulário externo da "pesquisa inicial"): uma pergunta por vez, a escola
// à esquerda direto no papel e a aluna à direita num balão fino. As respostas seguem o mesmo caminho do
// quiz em lista (`enviarTentativaFn`), então a equipe vê tudo em /painel/entregas.
export function QuizEmConversa({
  aulaId,
  quiz,
  nomeDoAluno,
}: {
  aulaId: string
  quiz: QuizParaOAluno
  nomeDoAluno: string
}) {
  const router = useRouter()
  const perguntas = quiz.perguntas
  const n = perguntas.length
  const abertura = mensagensDeAbertura(quiz.abertura)
  const fecho = mensagensDeAbertura(quiz.fecho)
  const ultima = quiz.ultimaTentativa

  // O rascunho vem do sessionStorage, que o servidor não tem: a tela só começa depois de montar.
  const [pronto, setPronto] = useState(false)
  const [comecou, setComecou] = useState(false)
  const [etapa, setEtapa] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, string[]>>({})
  const [textos, setTextos] = useState<Record<string, string>>({})
  const [erroDoCampo, setErroDoCampo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erroDeEnvio, setErroDeEnvio] = useState<string | null>(null)
  const [enviadaAgora, setEnviadaAgora] = useState(false)
  // Veio da revisão para alterar uma resposta: ao responder, volta para a revisão.
  const [paraARevisao, setParaARevisao] = useState(false)
  const enviada = !!ultima || enviadaAgora

  const controle = useRef<HTMLDivElement>(null)
  const final = useRef<HTMLDivElement>(null)
  const focar = useRef(false)

  const nome = (t: string) => personalizarMensagem(t, nomeDoAluno)

  // biome-ignore lint/correctness/useExhaustiveDependencies: só ao montar
  useEffect(() => {
    let rascunho = null
    try {
      rascunho = lerRascunho(
        sessionStorage.getItem(chaveDoRascunho(quiz.id)),
        perguntas.map((p) => p.id),
      )
    } catch {
      // sessionStorage bloqueado: segue sem rascunho.
    }
    if (rascunho) {
      setComecou(rascunho.comecou)
      setEtapa(rascunho.etapa)
      setRespostas(rascunho.respostas)
      setTextos(rascunho.textos)
    }
    setPronto(true)
  }, [])

  useEffect(() => {
    if (!pronto || enviada) return
    try {
      sessionStorage.setItem(
        chaveDoRascunho(quiz.id),
        JSON.stringify({ comecou, etapa, respostas, textos }),
      )
    } catch {
      // Sem armazenamento: a conversa só não sobrevive à troca de aba.
    }
  }, [pronto, enviada, quiz.id, comecou, etapa, respostas, textos])

  // Sem abertura, a pesquisa começa direto na primeira pergunta.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a abertura não muda durante a conversa
  useEffect(() => {
    if (pronto && !comecou && !enviada && abertura.length === 0)
      setComecou(true)
  }, [pronto, comecou, enviada])

  // O foco vai para a pergunta nova e a conversa rola até ela.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda a cada passo da conversa
  useEffect(() => {
    if (!focar.current) return
    focar.current = false
    const alvo = controle.current?.querySelector<HTMLElement>(
      'textarea, input, button',
    )
    alvo?.focus({ preventScroll: true })
    controle.current?.scrollIntoView({
      block: 'nearest',
      behavior: reduzMovimento() ? 'auto' : 'smooth',
    })
  }, [etapa, comecou])

  useEffect(() => {
    if (enviadaAgora) final.current?.focus()
  }, [enviadaAgora])

  function avancar(para: number) {
    focar.current = true
    setErroDoCampo(false)
    setEtapa(para)
  }

  function seguir() {
    const destino = paraARevisao ? n : etapa + 1
    setParaARevisao(false)
    avancar(destino)
  }

  function escolher(p: Pergunta, id: string) {
    if (p.tipo === 'unica') {
      setRespostas((r) => ({ ...r, [p.id]: [id] }))
      seguir()
      return
    }
    setRespostas((r) => {
      const marcadas = r[p.id] ?? []
      return {
        ...r,
        [p.id]: marcadas.includes(id)
          ? marcadas.filter((x) => x !== id)
          : [...marcadas, id],
      }
    })
  }

  function confirmar(p: Pergunta) {
    if (
      p.obrigatoria &&
      !respondida(p, respostas[p.id] ?? [], textos[p.id] ?? '')
    ) {
      setErroDoCampo(true)
      return
    }
    seguir()
  }

  function pular(p: Pergunta) {
    setRespostas((r) => ({ ...r, [p.id]: [] }))
    setTextos((t) => ({ ...t, [p.id]: '' }))
    seguir()
  }

  async function enviar() {
    if (enviando) return
    setErroDeEnvio(null)
    setEnviando(true)
    try {
      await enviarTentativaFn({ data: { aulaId, respostas, textos } })
      try {
        sessionStorage.removeItem(chaveDoRascunho(quiz.id))
      } catch {
        // nada a limpar
      }
      setEnviadaAgora(true)
      await router.invalidate()
    } catch (erro) {
      setErroDeEnvio(
        erro instanceof Error
          ? erro.message
          : 'Não foi possível enviar. Suas respostas continuam aqui, tente de novo.',
      )
    } finally {
      setEnviando(false)
    }
  }

  const respostaLocal = (p: Pergunta) =>
    textoDaResposta(p, respostas[p.id] ?? [], textos[p.id] ?? '')

  // ---- O palco: uma tela por vez (abertura, cada pergunta, revisão, enviada) ----
  const atual = comecou && etapa < n ? perguntas[etapa] : undefined
  const naRevisao = comecou && etapa >= n
  const tela = enviada
    ? 'enviada'
    : !comecou
      ? 'abertura'
      : naRevisao
        ? 'revisao'
        : `pergunta-${etapa}`
  const feitas = enviada ? n : comecou ? Math.min(etapa, n) : 0
  const respondidas = ultima
    ? ultima.perguntas.map((q) => ({
        id: q.id,
        enunciado: q.enunciado,
        resposta: q.pulada ? null : respostaDaTentativa(q),
      }))
    : perguntas.map((p) => ({
        id: p.id,
        enunciado: p.enunciado,
        resposta: respostaLocal(p),
      }))

  return (
    <section
      aria-label="Pesquisa da aula"
      data-quiz-em-conversa
      className="flex min-h-[26rem] max-w-[42rem] flex-col overflow-hidden rounded-2xl border bg-card shadow-(--shadow-card) lume-cel:min-h-[24rem]"
    >
      {/* Progresso: a barra enche a cada resposta; "Voltar" desfaz um passo. */}
      <div
        role="progressbar"
        aria-label="Andamento da pesquisa"
        aria-valuemin={0}
        aria-valuemax={n}
        aria-valuenow={feitas}
        className="h-1.5 bg-muted"
      >
        <div
          className="h-full bg-brand transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${n ? (feitas / n) * 100 : 0}%` }}
        />
      </div>
      <div className="flex min-h-11 items-center justify-between px-5 pt-3 text-sm text-muted-foreground lume-tela:px-8">
        {comecou && !enviada && etapa > 0 ? (
          <button
            type="button"
            onClick={() => {
              setParaARevisao(false)
              avancar(etapa - 1)
            }}
            className="-ml-2 inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring toque:min-h-11"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Voltar
          </button>
        ) : (
          <span />
        )}
        {atual && (
          <span className="tabular-nums">
            {etapa + 1} de {n}
          </span>
        )}
      </div>

      <div
        ref={controle}
        key={tela}
        aria-live="polite"
        className="rise-in flex flex-1 flex-col justify-center gap-6 px-5 pt-4 pb-8 lume-tela:px-8 lume-tela:pb-10"
      >
        {!pronto ? null : tela === 'abertura' ? (
          <>
            <Remetente />
            <div className="flex flex-col gap-3">
              {abertura.map((t, i) =>
                i === 0 ? (
                  <h2 key={t} className={TITULO_DO_PALCO}>
                    {nome(t)}
                  </h2>
                ) : (
                  <p
                    key={t}
                    className="max-w-[34rem] text-lg leading-relaxed text-foreground"
                  >
                    {nome(t)}
                  </p>
                ),
              )}
            </div>
            <div>
              <button
                type="button"
                className={BOTAO_DO_PALCO}
                onClick={() => {
                  focar.current = true
                  setComecou(true)
                }}
              >
                Vamos lá
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </>
        ) : atual ? (
          <>
            <Remetente />
            <h2 className={TITULO_DO_PALCO}>{nome(atual.enunciado)}</h2>
            <ControleDaPergunta
              pergunta={atual}
              enunciado={nome(atual.enunciado)}
              marcadas={respostas[atual.id] ?? []}
              texto={textos[atual.id] ?? ''}
              erro={erroDoCampo}
              aoEscolher={(id) => escolher(atual, id)}
              aoDigitar={(t) => {
                setErroDoCampo(false)
                setTextos((x) => ({ ...x, [atual.id]: t }))
              }}
              aoConfirmar={() => confirmar(atual)}
              aoPular={() => pular(atual)}
            />
          </>
        ) : tela === 'revisao' ? (
          <>
            <Remetente />
            <h2 className={TITULO_DO_PALCO}>
              {nome('Era isso, {{ first_name }}! Confere as suas respostas?')}
            </h2>
            <ListaDeRespostas
              itens={respondidas.map((r, i) => ({
                ...r,
                enunciado: nome(r.enunciado),
                alterar: () => {
                  setParaARevisao(true)
                  avancar(i)
                },
              }))}
            />
            <div className="flex flex-col items-start gap-3">
              <button
                type="button"
                className={BOTAO_DO_PALCO}
                aria-disabled={enviando || undefined}
                onClick={() => void enviar()}
              >
                {enviando ? 'Enviando…' : 'Enviar pesquisa'}
              </button>
              {erroDeEnvio && (
                <p role="alert" className="text-sm text-destructive">
                  {erroDeEnvio}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              ref={final}
              tabIndex={-1}
              className="flex flex-col gap-3 outline-none"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-success/15 text-success-texto">
                <Check className="size-5" strokeWidth={3} aria-hidden="true" />
              </span>
              {(fecho.length > 0 ? fecho : ['Pesquisa enviada. Obrigada!']).map(
                (t, i) =>
                  i === 0 ? (
                    <h2 key={t} className={TITULO_DO_PALCO}>
                      {nome(t)}
                    </h2>
                  ) : (
                    <p key={t} className="text-lg leading-relaxed">
                      {nome(t)}
                    </p>
                  ),
              )}
            </div>
            <ListaDeRespostas
              itens={respondidas.map((r) => ({
                ...r,
                enunciado: nome(r.enunciado),
              }))}
            />
          </>
        )}
      </div>
    </section>
  )
}

const TITULO_DO_PALCO =
  'max-w-[34rem] font-display text-[clamp(1.375rem,2.4vw,1.875rem)] leading-[1.15] tracking-[-0.02em] text-balance text-foreground [overflow-wrap:anywhere]'

const BOTAO_DO_PALCO =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-base font-semibold whitespace-nowrap text-brand-foreground outline-none transition-colors hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card aria-disabled:cursor-not-allowed aria-disabled:opacity-60'

/** Quem pergunta: a marca da escola, pequena, acima da pergunta. */
function Remetente() {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-foreground"
      >
        {appConfig.marca.nome.charAt(0)}
      </span>
      {appConfig.marca.nome}
    </p>
  )
}

/** Respostas dadas, em lista: a pergunta pequena, a resposta em destaque e, na revisão, "Alterar". */
function ListaDeRespostas({
  itens,
}: {
  itens: {
    id: string
    enunciado: string
    resposta: string | null
    alterar?: () => void
  }[]
}) {
  return (
    <dl className="grid max-w-[34rem] divide-y divide-border border-y border-border">
      {itens.map((r) => (
        <div key={r.id} className="flex items-start gap-3 py-3">
          <div className="min-w-0 flex-1">
            <dt className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {r.enunciado}
            </dt>
            <dd className="mt-0.5 text-base font-semibold whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
              {r.resposta ?? 'Pulou'}
            </dd>
          </div>
          {r.alterar && (
            <button
              type="button"
              onClick={r.alterar}
              aria-label={`Alterar: ${r.enunciado}`}
              className="shrink-0 rounded-full px-2 py-1 text-sm font-medium text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring toque:min-h-11"
            >
              Alterar
            </button>
          )}
        </div>
      ))}
    </dl>
  )
}

function respostaDaTentativa(q: DetalheDaTentativa['perguntas'][number]) {
  if (q.tipo === 'texto_livre') return q.aberta?.texto ?? null
  const marcadas = q.alternativas.filter((a) => a.marcada).map((a) => a.texto)
  return marcadas.length > 0 ? marcadas.join(', ') : null
}

function ControleDaPergunta({
  pergunta,
  enunciado,
  marcadas,
  texto,
  erro,
  aoEscolher,
  aoDigitar,
  aoConfirmar,
  aoPular,
}: {
  pergunta: Pergunta
  enunciado: string
  marcadas: string[]
  texto: string
  erro: boolean
  aoEscolher: (id: string) => void
  aoDigitar: (texto: string) => void
  aoConfirmar: () => void
  aoPular: () => void
}) {
  const pular = !pergunta.obrigatoria && (
    <button
      type="button"
      onClick={aoPular}
      className="rounded-full px-2 text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring toque:min-h-11"
    >
      Pular
    </button>
  )
  const mensagemDeErro = erro && (
    <p id="erro-da-conversa" role="alert" className="text-sm text-destructive">
      {pergunta.tipo === 'texto_livre'
        ? 'Escreva uma resposta para continuar.'
        : 'Escolha uma opção para continuar.'}
    </p>
  )
  const confirmar = (
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" className={BOTAO_DO_PALCO}>
        Continuar
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
      <span className="text-sm text-muted-foreground sem-ponteiro-fino:hidden">
        ou aperte Enter
      </span>
      {pular}
    </div>
  )

  if (pergunta.tipo === 'texto_livre') {
    const longo = pedeCampoLongo(enunciado)
    const comum = {
      'aria-label': `Sua resposta: ${enunciado}`,
      'aria-invalid': erro || undefined,
      'aria-describedby': erro ? 'erro-da-conversa' : undefined,
      maxLength: LIMITE_DO_TEXTO_LIVRE,
      value: texto,
      placeholder: 'Digite sua resposta…',
    }
    // Campo grande, só com o fio de baixo: a resposta é o que importa na tela.
    const campo =
      'rounded-none border-0 border-b-2 border-border bg-transparent px-0 text-xl shadow-none outline-none focus-visible:border-brand focus-visible:ring-0 md:text-xl lume-cel:text-lg'
    return (
      <form
        className="flex max-w-[34rem] flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          aoConfirmar()
        }}
      >
        {longo ? (
          <Textarea
            {...comum}
            rows={3}
            className={cn(campo, 'min-h-24 py-2')}
            onChange={(e) => aoDigitar(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault()
                aoConfirmar()
              }
            }}
          />
        ) : (
          <Input
            {...comum}
            type="text"
            className={cn(campo, 'h-12')}
            onChange={(e) => aoDigitar(e.target.value)}
          />
        )}
        {mensagemDeErro}
        {confirmar}
      </form>
    )
  }

  const unica = pergunta.tipo === 'unica'
  return (
    <form
      className="flex max-w-[34rem] flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        aoConfirmar()
      }}
    >
      <fieldset className="m-0 grid min-w-0 gap-2.5 border-0 p-0">
        <legend className="sr-only">{enunciado}</legend>
        {pergunta.alternativas.map((a, i) => {
          const marcada = marcadas.includes(a.id)
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={marcada}
              onClick={() => aoEscolher(a.id)}
              className={cn(
                'flex min-h-12 w-full items-center gap-3 rounded-xl border-[1.5px] border-border bg-background px-4 py-2.5 text-left text-base font-medium text-foreground outline-none transition-colors hover:border-brand hover:bg-brand/[.06] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                marcada && 'border-brand bg-brand/10',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold',
                  marcada
                    ? 'border-brand bg-brand text-brand-foreground'
                    : 'border-border bg-card text-muted-foreground',
                )}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {a.texto}
              </span>
            </button>
          )
        })}
      </fieldset>
      {mensagemDeErro}
      {unica ? pular : confirmar}
    </form>
  )
}
