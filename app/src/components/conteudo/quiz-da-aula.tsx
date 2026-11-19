import { useRouter } from '@tanstack/react-router'
import {
  CheckCircle2,
  CircleX,
  Clock,
  Download,
  Minus,
  Paperclip,
  Square,
  SquareCheck,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { QuizEmConversa } from '#/components/conteudo/quiz-em-conversa'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { enviarArquivoDaEntrega } from '#/lib/entregas-cliente'
import { urlDaImagem } from '#/lib/imagens'
import { enviarTentativaFn } from '#/lib/quiz-fns'
import { formatarTamanho } from '#/lib/tamanho'
import { toast } from '#/lib/toast'
import {
  ACCEPT_DO_TIPO,
  type ArquivoEntregue,
  arquivoAceito,
  ehTipoAceito,
  erroDeTipoDeArquivo,
  ID_DO_OUTRO,
  LIMITE_DO_TEXTO_LIVRE,
  MAXIMO_DE_ARQUIVOS,
  perguntasSemResposta,
  TEXTO_DO_GRUPO,
  textoDeAjudaDoArquivo,
} from '#/regras/entregas'
import type { DetalheDaTentativa, QuizParaOAluno } from '#/regras/quiz'
import { quizEmConversa } from '#/regras/quiz-em-conversa'

// Quiz da aula (#51 e #52): as perguntas (escolha, texto livre e envio de arquivo), o envio e o
// resultado. Componente próprio, que a página da aula só encaixa embaixo do conteúdo (ou no lugar
// dele, na aula do tipo quiz). Com pergunta aberta o resultado vem depois da correção da equipe.
export function QuizDaAula({
  aulaId,
  quiz,
  nomeDoAluno = '',
}: {
  aulaId: string
  quiz: QuizParaOAluno
  nomeDoAluno?: string
}) {
  // Quiz em conversa (pesquisa) tem tela própria; se alguma pergunta não cabe nela, cai na lista.
  if (quizEmConversa(quiz)) {
    return (
      <QuizEmConversa aulaId={aulaId} quiz={quiz} nomeDoAluno={nomeDoAluno} />
    )
  }
  return <QuizEmLista aulaId={aulaId} quiz={quiz} />
}

function QuizEmLista({
  aulaId,
  quiz,
}: {
  aulaId: string
  quiz: QuizParaOAluno
}) {
  const router = useRouter()
  const [respostas, setRespostas] = useState<Record<string, string[]>>({})
  const [textos, setTextos] = useState<Record<string, string>>({})
  // Recusa do tipo de arquivo, por pergunta.
  const [erroDeTipo, setErroDeTipo] = useState<Record<string, string>>({})
  const [arquivos, setArquivos] = useState<Record<string, ArquivoEntregue[]>>(
    {},
  )
  // Progresso (0 a 100) do arquivo que está subindo, por pergunta.
  const [subindo, setSubindo] = useState<Record<string, number>>({})
  const [enviando, setEnviando] = useState(false)
  // Perguntas que ficaram sem resposta na última tentativa de envio.
  const [semResposta, setSemResposta] = useState<string[]>([])
  const formulario = useRef<HTMLFormElement>(null)
  const resultado = useRef<HTMLElement>(null)
  // Só leva o foco ao resultado depois de um envio nosso, não ao abrir a aula.
  const focarResultado = useRef(false)
  const ultima = quiz.ultimaTentativa

  // O formulário some (ou troca) depois do envio: sem isso o foco cairia no body.
  useEffect(() => {
    if (focarResultado.current && ultima) {
      focarResultado.current = false
      resultado.current?.focus()
    }
  }, [ultima])

  async function anexar(
    perguntaId: string,
    aceita: string | undefined,
    escolhidos: FileList | null,
  ) {
    const novos = Array.from(escolhidos ?? [])
    setErroDeTipo((e) => ({ ...e, [perguntaId]: '' }))
    const errado = novos.find((f) => !arquivoAceito(aceita, f.type, f.name))
    if (errado) {
      setErroDeTipo((e) => ({
        ...e,
        [perguntaId]: erroDeTipoDeArquivo(aceita),
      }))
      return
    }
    const atuais = arquivos[perguntaId] ?? []
    if (atuais.length + novos.length > MAXIMO_DE_ARQUIVOS) {
      toast.error(`Envie até ${MAXIMO_DE_ARQUIVOS} arquivos por pergunta.`)
      return
    }
    for (const arquivo of novos) {
      setSubindo((s) => ({ ...s, [perguntaId]: 0 }))
      try {
        const enviado = await enviarArquivoDaEntrega(aulaId, arquivo, (p) =>
          setSubindo((s) => ({ ...s, [perguntaId]: p })),
        )
        setArquivos((a) => ({
          ...a,
          [perguntaId]: [...(a[perguntaId] ?? []), enviado],
        }))
      } catch (erro) {
        toast.error(
          erro instanceof Error
            ? erro.message
            : 'Não deu para enviar o arquivo.',
        )
      } finally {
        setSubindo((s) => {
          const { [perguntaId]: _, ...resto } = s
          return resto
        })
      }
    }
  }

  function marcar(perguntaId: string, alternativaId: string, unica: boolean) {
    setRespostas((atual) => {
      const marcadas = atual[perguntaId] ?? []
      if (unica) return { ...atual, [perguntaId]: [alternativaId] }
      return {
        ...atual,
        [perguntaId]: marcadas.includes(alternativaId)
          ? marcadas.filter((a) => a !== alternativaId)
          : [...marcadas, alternativaId],
      }
    })
  }

  function respondida(p: QuizParaOAluno['perguntas'][number]) {
    if (p.tipo === 'texto_livre') return !!(textos[p.id] ?? '').trim()
    if (p.tipo === 'arquivo') return (arquivos[p.id] ?? []).length > 0
    const marcadas = respostas[p.id] ?? []
    // "Outro" marcado sem o texto ainda não é resposta.
    if (marcadas.includes(ID_DO_OUTRO) && !(textos[p.id] ?? '').trim()) {
      return marcadas.length > 1
    }
    return marcadas.length > 0
  }

  async function enviar() {
    // aria-disabled não bloqueia o clique: o guard faz o papel do disabled sem tirar o foco do botão.
    if (enviando || subindoAlgum) return
    const ids = new Set(
      perguntasSemResposta(quiz.perguntas, (id) =>
        respondida(
          quiz.perguntas.find(
            (p) => p.id === id,
          ) as (typeof quiz.perguntas)[number],
        ),
      ),
    )
    // Opcional com "Outro" marcado e sem texto também precisa de ajuste.
    for (const p of quiz.perguntas) {
      if (
        (respostas[p.id] ?? []).includes(ID_DO_OUTRO) &&
        !(textos[p.id] ?? '').trim()
      ) {
        ids.add(p.id)
      }
    }
    const faltando = quiz.perguntas.filter((p) => ids.has(p.id))
    if (faltando.length === 0 && !quiz.perguntas.some(respondida)) {
      toast.error('Responda pelo menos uma pergunta.')
      return
    }
    if (faltando.length > 0) {
      setSemResposta(faltando.map((p) => p.id))
      const id = faltando[0]?.id
      const primeiro = formulario.current?.querySelector<HTMLElement>(
        `[data-pergunta="${id}"] textarea, [data-pergunta="${id}"] input:not([tabindex="-1"]), [data-pergunta="${id}"] button`,
      )
      primeiro?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      primeiro?.focus({ preventScroll: true })
      return
    }
    setSemResposta([])
    setEnviando(true)
    try {
      const resultado = await enviarTentativaFn({
        data: { aulaId, respostas, textos, arquivos },
      })
      setRespostas({})
      setTextos({})
      setArquivos({})
      if (resultado.estado === 'aprovada') {
        toast.success('Aprovado no exercício')
      } else if (resultado.estado === 'aguardando_correcao') {
        toast.success(
          'Entrega enviada. A equipe vai corrigir e você será avisado.',
        )
      } else {
        toast.error('Você não atingiu o mínimo de acertos.')
      }
      focarResultado.current = true
      await router.invalidate()
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : 'Não foi possível enviar.',
      )
    } finally {
      setEnviando(false)
    }
  }

  const subindoAlgum = Object.keys(subindo).length > 0
  const pendentes = quiz.perguntas.filter(
    (p) => semResposta.includes(p.id) && !respondida(p),
  ).length

  return (
    <Card role="region" aria-label="Exercício da aula">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            data-slot="card-title"
            className="text-base leading-none font-semibold"
          >
            Quiz
          </h2>
          {quiz.aprovado && <Badge>Aprovado</Badge>}
          {quiz.aguardandoCorrecao && (
            <Badge variant="secondary">Aguardando correção</Badge>
          )}
          {(quiz.obrigatorio || quiz.soQuiz) && !quiz.aprovado && (
            <Badge variant="outline">Obrigatório para concluir a aula</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Mínimo de {quiz.minimoDeAcertos}% de acertos para ser aprovado.{' '}
          {quiz.perguntas.some((p) => p.corrigidaPelaEquipe) &&
            (quiz.semCorrecao
              ? 'As respostas abertas são aceitas ao enviar. '
              : 'As respostas abertas (texto, arquivo e escolhas sem gabarito) são corrigidas pela equipe. ')}
          {quiz.restantes === null
            ? 'Tentativas ilimitadas.'
            : `${quiz.restantes} ${quiz.restantes === 1 ? 'tentativa restante' : 'tentativas restantes'} de ${quiz.maximoDeTentativas}.`}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {ultima && (
          <ResultadoDaTentativa
            ref={resultado}
            tentativa={ultima}
            quiz={quiz}
          />
        )}

        {quiz.podeEnviar && (
          <form
            ref={formulario}
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              void enviar()
            }}
          >
            {ultima && (
              <h3 className="text-sm font-semibold">Nova tentativa</h3>
            )}
            {quiz.perguntas.map((p, i) => {
              const unica = p.tipo === 'unica'
              const imagem = urlDaImagem(p.imagem)
              const idDoErro = `erro-pergunta-${p.id}`
              const mostrarErro = semResposta.includes(p.id) && !respondida(p)
              return (
                <fieldset
                  key={p.id}
                  data-pergunta={p.id}
                  aria-describedby={mostrarErro ? idDoErro : undefined}
                  className="flex flex-col gap-3"
                >
                  <legend className="text-sm font-medium">
                    {i + 1}. {p.enunciado}
                    {!p.obrigatoria && !p.grupoUmDe && (
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        (opcional)
                      </span>
                    )}
                  </legend>
                  {p.grupoUmDe && (
                    <p className="text-xs font-medium text-foreground">
                      {TEXTO_DO_GRUPO}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {p.tipo === 'texto_livre'
                      ? 'Escreva a sua resposta.'
                      : p.tipo === 'arquivo'
                        ? textoDeAjudaDoArquivo(p.aceita)
                        : unica
                          ? 'Escolha uma alternativa.'
                          : p.corrigidaPelaEquipe
                            ? 'Marque todas que se aplicam.'
                            : 'Escolha todas as alternativas corretas.'}
                  </p>
                  {erroDeTipo[p.id] && (
                    <p role="alert" className="text-sm text-destructive">
                      {erroDeTipo[p.id]}
                    </p>
                  )}
                  {mostrarErro && (
                    <p id={idDoErro} className="text-sm text-destructive">
                      {p.grupoUmDe
                        ? `${TEXTO_DO_GRUPO}.`
                        : (respostas[p.id] ?? []).includes(ID_DO_OUTRO)
                          ? 'Escreva o texto de "Outro".'
                          : p.tipo === 'arquivo'
                            ? 'Envie o arquivo.'
                            : 'Responda esta pergunta.'}
                    </p>
                  )}
                  {imagem && (
                    <img
                      src={imagem}
                      alt={`Imagem da pergunta ${i + 1}`}
                      className="max-h-64 max-w-full rounded-md border object-contain"
                    />
                  )}
                  {p.tipo === 'texto_livre' && (
                    <Textarea
                      aria-label={`Resposta da pergunta ${i + 1}`}
                      aria-invalid={mostrarErro ? true : undefined}
                      rows={4}
                      maxLength={LIMITE_DO_TEXTO_LIVRE}
                      value={textos[p.id] ?? ''}
                      onChange={(e) =>
                        setTextos((t) => ({ ...t, [p.id]: e.target.value }))
                      }
                    />
                  )}
                  {p.tipo === 'arquivo' && (
                    <CampoDeArquivos
                      rotulo={`Arquivos da pergunta ${i + 1}`}
                      enviados={arquivos[p.id] ?? []}
                      progresso={subindo[p.id]}
                      accept={
                        ACCEPT_DO_TIPO[
                          ehTipoAceito(p.aceita) ? p.aceita : 'qualquer'
                        ]
                      }
                      onEscolher={(f) => anexar(p.id, p.aceita, f)}
                      onRemover={(chave) =>
                        setArquivos((a) => ({
                          ...a,
                          [p.id]: (a[p.id] ?? []).filter(
                            (x) => x.chave !== chave,
                          ),
                        }))
                      }
                    />
                  )}
                  {/* Com imagem em todas as alternativas, elas viram cartões lado a lado: a imagem é a
                      resposta, então aparece grande, e as opções se comparam de relance. */}
                  {p.alternativas.length > 0 &&
                  p.alternativas.every((a) => a.imagem) ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {p.alternativas.map((a) => (
                        <label
                          key={a.id}
                          className="flex cursor-pointer flex-col overflow-hidden rounded-md border text-sm hover:bg-accent has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary"
                        >
                          {/* A imagem vai de borda a borda do cartão: é ela que a aluna compara. */}
                          <img
                            src={urlDaImagem(a.imagem) ?? ''}
                            alt=""
                            loading="lazy"
                            className="max-h-[30rem] w-full object-contain"
                          />
                          <span className="flex items-start gap-2.5 p-3">
                            <input
                              type={unica ? 'radio' : 'checkbox'}
                              name={p.id}
                              aria-invalid={mostrarErro ? true : undefined}
                              className="mt-0.5 size-4 shrink-0 accent-primary"
                              checked={(respostas[p.id] ?? []).includes(a.id)}
                              onChange={() => marcar(p.id, a.id, unica)}
                            />
                            <span className="[overflow-wrap:anywhere]">
                              {a.texto}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    p.alternativas.map((a) => (
                      <label
                        key={a.id}
                        className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm hover:bg-accent has-[:checked]:border-primary"
                      >
                        <input
                          type={unica ? 'radio' : 'checkbox'}
                          name={p.id}
                          aria-invalid={mostrarErro ? true : undefined}
                          className="mt-0.5 size-4 accent-primary"
                          checked={(respostas[p.id] ?? []).includes(a.id)}
                          onChange={() => marcar(p.id, a.id, unica)}
                        />
                        <span className="flex flex-col gap-2">
                          {urlDaImagem(a.imagem) && (
                            <img
                              src={urlDaImagem(a.imagem) ?? ''}
                              alt=""
                              className="max-h-40 max-w-full rounded-md border object-contain"
                            />
                          )}
                          {a.texto}
                        </span>
                      </label>
                    ))
                  )}
                  {p.outro && (
                    <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm hover:bg-accent has-[:checked]:border-primary">
                      <input
                        type={unica ? 'radio' : 'checkbox'}
                        name={p.id}
                        aria-label="Outro"
                        aria-invalid={mostrarErro ? true : undefined}
                        className="size-4 accent-primary"
                        checked={(respostas[p.id] ?? []).includes(ID_DO_OUTRO)}
                        onChange={() => marcar(p.id, ID_DO_OUTRO, unica)}
                      />
                      <span className="shrink-0">Outro:</span>
                      <Input
                        aria-label={`Texto de Outro na pergunta ${i + 1}`}
                        maxLength={LIMITE_DO_TEXTO_LIVRE}
                        value={textos[p.id] ?? ''}
                        onFocus={() => {
                          if (!(respostas[p.id] ?? []).includes(ID_DO_OUTRO)) {
                            marcar(p.id, ID_DO_OUTRO, unica)
                          }
                        }}
                        onChange={(e) =>
                          setTextos((t) => ({ ...t, [p.id]: e.target.value }))
                        }
                      />
                    </label>
                  )}
                </fieldset>
              )
            })}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                aria-disabled={enviando || subindoAlgum || undefined}
              >
                {enviando ? 'Enviando…' : 'Enviar respostas'}
              </Button>
              {pendentes > 0 && (
                <p role="alert" className="text-sm text-destructive">
                  {pendentes === 1
                    ? 'Falta 1 pergunta'
                    : `Faltam ${pendentes} perguntas`}
                </p>
              )}
            </div>
          </form>
        )}

        {!quiz.podeEnviar && !quiz.aprovado && !quiz.aguardandoCorrecao && (
          <p className="text-sm text-muted-foreground">
            Suas tentativas acabaram. Fale com a equipe se precisar de outra
            chance.
          </p>
        )}
        {quiz.aguardandoCorrecao && (
          <p className="text-sm text-muted-foreground">
            A equipe vai corrigir sua entrega. Você não pode enviar de novo
            enquanto ela estiver aguardando correção.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ResultadoDaTentativa({
  tentativa,
  quiz,
  ref,
}: {
  tentativa: DetalheDaTentativa
  quiz: QuizParaOAluno
  ref?: React.Ref<HTMLElement>
}) {
  const aprovada = tentativa.estado === 'aprovada'
  const aguardando = tentativa.estado === 'aguardando_correcao'
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label={`Resultado da tentativa ${tentativa.numero}`}
      className="flex flex-col gap-4 rounded-md border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        {aprovada ? (
          <CheckCircle2 className="size-5 text-primary" aria-hidden />
        ) : aguardando ? (
          <Clock className="size-5 text-muted-foreground" aria-hidden />
        ) : (
          <CircleX className="size-5 text-destructive" aria-hidden />
        )}
        <h3 className="text-sm font-semibold">
          Tentativa {tentativa.numero}:{' '}
          {aprovada
            ? 'aprovado'
            : tentativa.estado === 'reprovada'
              ? 'não aprovado'
              : 'aguardando correção'}
        </h3>
        {!aguardando && (
          <span className="text-sm text-muted-foreground">
            {tentativa.acertos} de {tentativa.total} acertos (
            {tentativa.percentual}%)
          </span>
        )}
      </div>
      {!quiz.revelar && tentativa.estado === 'reprovada' && (
        <p className="text-xs text-muted-foreground">
          A resposta certa aparece quando você for aprovado ou as tentativas
          acabarem.
        </p>
      )}
      <ol className="flex flex-col gap-4">
        {tentativa.perguntas.map((p, i) => (
          <li key={p.id} className="flex flex-col gap-2 text-sm">
            <div className="flex items-start gap-2 font-medium">
              {p.pulada ? (
                <Minus
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-label="Não respondida"
                />
              ) : p.acertou === null ? (
                <Clock
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-label="Aguardando correção"
                />
              ) : p.acertou ? (
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-label="Acertou"
                />
              ) : (
                <CircleX
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-label="Errou"
                />
              )}
              <span>
                {i + 1}. {p.enunciado}
              </span>
            </div>
            {p.pulada && (
              <p className="pl-6 text-xs text-muted-foreground">
                Não respondida.
              </p>
            )}
            {p.aberta && (
              <RespostaEntregue
                aberta={p.aberta}
                rotulo={p.outro ? 'Outro: ' : ''}
              />
            )}
            <ul className="flex flex-col gap-1 pl-6">
              {p.alternativas.map((a) => (
                <li key={a.id} className="flex flex-col">
                  <span
                    className={
                      a.correta
                        ? 'font-medium text-primary'
                        : a.marcada
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                    }
                  >
                    {a.marcada ? (
                      <SquareCheck
                        className="mr-1 inline size-4 align-text-bottom"
                        aria-hidden
                      />
                    ) : (
                      <Square
                        className="mr-1 inline size-4 align-text-bottom"
                        aria-hidden
                      />
                    )}
                    <span className="sr-only">
                      {a.marcada ? 'Marcada: ' : 'Não marcada: '}
                    </span>
                    {a.texto}
                    {a.correta && ' - resposta correta'}
                  </span>
                  {a.comentario && (
                    <span className="text-xs text-muted-foreground">
                      {a.comentario}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}

function CampoDeArquivos({
  rotulo,
  accept,
  enviados,
  progresso,
  onEscolher,
  onRemover,
}: {
  rotulo: string
  accept: string | undefined
  enviados: ArquivoEntregue[]
  progresso: number | undefined
  onEscolher: (arquivos: FileList | null) => void
  onRemover: (chave: string) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const subindo = progresso !== undefined
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={entrada}
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        className="sr-only"
        aria-label={rotulo}
        onChange={(e) => {
          onEscolher(e.target.files)
          e.target.value = ''
        }}
      />
      {enviados.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {enviados.map((a) => (
            <li key={a.chave} className="flex items-center gap-2">
              <Paperclip className="size-4 text-muted-foreground" aria-hidden />
              <span>{a.nome}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover ${a.nome}`}
                onClick={() => onRemover(a.chave)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={subindo || enviados.length >= MAXIMO_DE_ARQUIVOS}
          onClick={() => entrada.current?.click()}
        >
          <Paperclip />
          {subindo ? 'Enviando…' : 'Escolher arquivo'}
        </Button>
        {subindo && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {progresso}%
          </span>
        )}
      </div>
    </div>
  )
}

function RespostaEntregue({
  aberta,
  rotulo = '',
}: {
  aberta: NonNullable<DetalheDaTentativa['perguntas'][number]['aberta']>
  /** Antes do texto (ex.: "Outro: " na escolha com "Outro"). */
  rotulo?: string
}) {
  return (
    <div className="flex flex-col gap-1 pl-6">
      {aberta.texto && (
        <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3">
          {rotulo}
          {aberta.texto}
        </p>
      )}
      {aberta.arquivos.length > 0 && (
        <ul className="flex flex-col gap-1">
          {aberta.arquivos.map((a) => (
            <li key={a.id}>
              <a
                href={`/api/entregas/${a.id}`}
                download
                className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline"
              >
                <Download className="size-4" aria-hidden />
                {a.nome}
                <span className="text-xs text-muted-foreground">
                  ({formatarTamanho(a.tamanho)})
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {aberta.situacao === 'pendente' && (
        <p className="text-xs text-muted-foreground">Aguardando correção.</p>
      )}
      {aberta.comentario && (
        <p className="text-xs text-muted-foreground">
          Comentário da equipe: {aberta.comentario}
        </p>
      )}
    </div>
  )
}
