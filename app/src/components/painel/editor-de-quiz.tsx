import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BotaoExcluir } from '#/components/painel/botao-excluir'
import { CampoDeImagem } from '#/components/painel/campo-de-arquivo'
import { CampoDoPainel } from '#/components/painel/formulario'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { SelectNativo } from '#/components/ui/select-nativo'
import { Textarea } from '#/components/ui/textarea'
import { removerQuizFn, salvarQuizFn } from '#/lib/quiz-fns'
import {
  ehAberta,
  ROTULO_DO_TIPO_ACEITO,
  TIPOS_ACEITOS,
} from '#/regras/entregas'
import type { ErrosDoFormulario } from '#/regras/painel'
import type {
  AlternativaDefinida,
  DefinicaoDoQuiz,
  PerguntaDefinida,
} from '#/regras/quiz'

const QUIZ_NOVO: DefinicaoDoQuiz = {
  soQuiz: false,
  obrigatorio: false,
  obrigatorioParaCertificado: false,
  minimoDeAcertos: 70,
  maximoDeTentativas: null,
  pontos: 100,
  semCorrecao: false,
  formato: 'lista',
  abertura: null,
  fecho: null,
  perguntas: [],
}

// Confere os números do quiz antes de enviar (mesmos limites do servidor, em `regras/quiz.ts`).
function validarConfiguracao(q: DefinicaoDoQuiz): ErrosDoFormulario {
  const inteiro = (n: number | null) => n !== null && Number.isInteger(n)
  return {
    minimoDeAcertos:
      inteiro(q.minimoDeAcertos) &&
      q.minimoDeAcertos >= 0 &&
      q.minimoDeAcertos <= 100
        ? undefined
        : 'Informe um número inteiro de 0 a 100.',
    maximoDeTentativas:
      q.maximoDeTentativas === null ||
      (inteiro(q.maximoDeTentativas) &&
        q.maximoDeTentativas >= 1 &&
        q.maximoDeTentativas <= 15)
        ? undefined
        : 'Informe de 1 a 15 tentativas, ou deixe vazio para ilimitadas.',
    pontos:
      inteiro(q.pontos) && q.pontos >= 0
        ? undefined
        : 'Informe um número inteiro, de 0 em diante.',
  }
}

const alternativaNova = (correta = false): AlternativaDefinida => ({
  texto: '',
  correta,
  comentario: '',
})

const perguntaNova = (): PerguntaDefinida => ({
  tipo: 'unica',
  enunciado: '',
  imagem: null,
  alternativas: [alternativaNova(true), alternativaNova()],
})

// Editor do quiz da aula (#51): configurações, perguntas, alternativas, a correta e o comentário.
// Salvar regrava tudo; as tentativas dos alunos guardam a própria cópia.
export function EditorDeQuiz({
  aulaId,
  inicial,
}: {
  aulaId: string
  inicial: DefinicaoDoQuiz | null
}) {
  const { executar, ocupado, erros } = useAcao()
  const [quiz, setQuiz] = useState<DefinicaoDoQuiz>(inicial ?? QUIZ_NOVO)
  const [existe, setExiste] = useState(inicial !== null)

  const mudar = (parcial: Partial<DefinicaoDoQuiz>) =>
    setQuiz((q) => ({ ...q, ...parcial }))
  const mudarPergunta = (i: number, parcial: Partial<PerguntaDefinida>) =>
    setQuiz((q) => ({
      ...q,
      perguntas: q.perguntas.map((p, j) =>
        j === i ? { ...p, ...parcial } : p,
      ),
    }))
  const mudarAlternativa = (
    i: number,
    k: number,
    parcial: Partial<AlternativaDefinida>,
  ) =>
    setQuiz((q) => ({
      ...q,
      perguntas: q.perguntas.map((p, j) =>
        j === i
          ? {
              ...p,
              alternativas: p.alternativas.map((a, m) =>
                m === k ? { ...a, ...parcial } : a,
              ),
            }
          : p,
      ),
    }))

  // Na pergunta de escolha única, marcar uma correta desmarca as outras.
  function marcarCorreta(i: number, k: number, marcada: boolean) {
    setQuiz((q) => ({
      ...q,
      perguntas: q.perguntas.map((p, j) => {
        if (j !== i) return p
        return {
          ...p,
          // "Outro" só existe sem alternativa correta.
          outro: marcada ? false : p.outro,
          alternativas: p.alternativas.map((a, m) => ({
            ...a,
            correta:
              p.tipo === 'unica' ? m === k : m === k ? marcada : a.correta,
          })),
        }
      }),
    }))
  }

  // Sem gabarito: nenhuma alternativa correta (a Equipe corrige). Ao desligar, a primeira vira a correta.
  function semGabarito(i: number, ligado: boolean) {
    setQuiz((q) => ({
      ...q,
      perguntas: q.perguntas.map((p, j) =>
        j !== i
          ? p
          : {
              ...p,
              outro: ligado ? p.outro : false,
              alternativas: p.alternativas.map((a, m) => ({
                ...a,
                correta: ligado ? false : m === 0,
              })),
            },
      ),
    }))
  }

  function trocarTipo(i: number, tipo: string) {
    setQuiz((q) => ({
      ...q,
      perguntas: q.perguntas.map((p, j) => {
        if (j !== i) return p
        // Pergunta aberta (texto livre, arquivo) não tem alternativas.
        if (ehAberta(tipo)) return { ...p, tipo, alternativas: [] }
        // Ao voltar para uma pergunta de escolha, garante ao menos 2 alternativas.
        const base =
          p.alternativas.length >= 2
            ? p.alternativas
            : [alternativaNova(true), alternativaNova()]
        // Ao voltar para única, só a primeira correta fica.
        let achou = false
        const alternativas =
          tipo === 'unica'
            ? base.map((a) => {
                const correta = a.correta && !achou
                if (a.correta) achou = true
                return { ...a, correta }
              })
            : base
        return { ...p, tipo, alternativas }
      }),
    }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Exercício</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void executar(
              async () => {
                await salvarQuizFn({
                  data: {
                    aulaId,
                    ...quiz,
                    perguntas: quiz.perguntas.map((p) => ({
                      ...p,
                      alternativas: p.alternativas.map((a) => ({
                        ...a,
                        comentario: a.comentario || null,
                      })),
                    })),
                  },
                })
                setExiste(true)
              },
              'Exercício salvo.',
              { validar: () => validarConfiguracao(quiz) },
            )
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <CampoDoPainel
              rotulo="Mínimo de acertos (%)"
              erro={erros.minimoDeAcertos}
            >
              <Input
                id="quiz-minimo"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={quiz.minimoDeAcertos}
                onChange={(e) =>
                  mudar({ minimoDeAcertos: Number(e.target.value) })
                }
              />
            </CampoDoPainel>
            <CampoDoPainel
              rotulo="Tentativas (1 a 15)"
              ajuda="Deixe vazio para tentativas ilimitadas."
              erro={erros.maximoDeTentativas}
            >
              <Input
                id="quiz-tentativas"
                type="number"
                inputMode="numeric"
                min={1}
                max={15}
                placeholder="Ilimitadas"
                value={quiz.maximoDeTentativas ?? ''}
                onChange={(e) =>
                  mudar({
                    maximoDeTentativas:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </CampoDoPainel>
            <CampoDoPainel rotulo="Pontos na aprovação" erro={erros.pontos}>
              <Input
                id="quiz-pontos"
                type="number"
                inputMode="numeric"
                min={0}
                value={quiz.pontos}
                onChange={(e) => mudar({ pontos: Number(e.target.value) })}
              />
            </CampoDoPainel>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={quiz.soQuiz}
                onChange={(e) => mudar({ soQuiz: e.target.checked })}
              />
              Aula do tipo exercício (o exercício é a própria aula; a aprovação
              é sempre exigida para concluir)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={quiz.obrigatorio}
                onChange={(e) => mudar({ obrigatorio: e.target.checked })}
              />
              Obrigatório: a aula só conclui com aprovação
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={quiz.obrigatorioParaCertificado}
                onChange={(e) =>
                  mudar({ obrigatorioParaCertificado: e.target.checked })
                }
              />
              Obrigatório para o certificado
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={quiz.semCorrecao ?? false}
                onChange={(e) => mudar({ semCorrecao: e.target.checked })}
              />
              Sem correção: as respostas de texto e de arquivo são aceitas ao
              enviar, sem passar pela fila da equipe
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoDoPainel
              rotulo="Formato"
              ajuda="Lista: todas as perguntas na página. Conversa: uma pergunta por vez, como num chat."
            >
              <SelectNativo
                id="quiz-formato"
                value={quiz.formato ?? 'lista'}
                onChange={(e) =>
                  mudar({
                    formato:
                      e.target.value === 'conversa' ? 'conversa' : 'lista',
                  })
                }
              >
                <option value="lista">Lista</option>
                <option value="conversa">Conversa</option>
              </SelectNativo>
            </CampoDoPainel>
          </div>
          {quiz.formato === 'conversa' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoDoPainel
                rotulo="Abertura da conversa"
                ajuda="Uma mensagem por linha, antes da primeira pergunta. Use {{ first_name }} para o primeiro nome."
              >
                <Textarea
                  id="quiz-abertura"
                  rows={4}
                  value={quiz.abertura ?? ''}
                  onChange={(e) => mudar({ abertura: e.target.value })}
                />
              </CampoDoPainel>
              <CampoDoPainel
                rotulo="Mensagem final"
                ajuda="Aparece depois que a aluna envia."
              >
                <Textarea
                  id="quiz-fecho"
                  rows={4}
                  value={quiz.fecho ?? ''}
                  onChange={(e) => mudar({ fecho: e.target.value })}
                />
              </CampoDoPainel>
            </div>
          )}

          {quiz.perguntas.map((p, i) => (
            <fieldset
              // biome-ignore lint/suspicious/noArrayIndexKey: perguntas ainda não têm id na edição
              key={i}
              className="flex flex-col gap-3 rounded-md border p-4"
            >
              <legend className="px-1 text-sm font-medium">
                Pergunta {i + 1}
              </legend>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`p${i}-enunciado`}>Enunciado</Label>
                <Textarea
                  id={`p${i}-enunciado`}
                  value={p.enunciado}
                  rows={2}
                  onChange={(e) =>
                    mudarPergunta(i, { enunciado: e.target.value })
                  }
                />
              </div>
              <CampoDeImagem
                rotulo={`Imagem da pergunta ${i + 1}`}
                valor={p.imagem ?? null}
                onChange={(chave) => mudarPergunta(i, { imagem: chave })}
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor={`p${i}-tipo`}>Tipo</Label>
                <SelectNativo
                  id={`p${i}-tipo`}
                  value={p.tipo}
                  onChange={(e) => trocarTipo(i, e.target.value)}
                >
                  <option value="unica">Escolha única</option>
                  <option value="multipla">Múltipla escolha (exata)</option>
                  <option value="texto_livre">Texto livre</option>
                  <option value="arquivo">Envio de arquivo</option>
                </SelectNativo>
                {p.tipo === 'arquivo' && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`p${i}-aceita`}>
                      Tipo de arquivo aceito
                    </Label>
                    <SelectNativo
                      id={`p${i}-aceita`}
                      value={p.aceita ?? 'qualquer'}
                      onChange={(e) =>
                        mudarPergunta(i, { aceita: e.target.value })
                      }
                    >
                      {TIPOS_ACEITOS.map((t) => (
                        <option key={t} value={t}>
                          {ROTULO_DO_TIPO_ACEITO[t]}
                        </option>
                      ))}
                    </SelectNativo>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={p.obrigatoria ?? true}
                    onChange={(e) =>
                      mudarPergunta(i, { obrigatoria: e.target.checked })
                    }
                  />
                  Obrigatória
                </label>
                {p.grupoUmDe && (
                  <p className="text-xs text-muted-foreground">
                    Esta pergunta faz parte de um grupo: a aluna responde pelo
                    menos uma das perguntas do grupo.
                  </p>
                )}
                {!ehAberta(p.tipo) && (
                  <div className="flex flex-col gap-1 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={p.alternativas.every((a) => !a.correta)}
                        onChange={(e) => semGabarito(i, e.target.checked)}
                      />
                      Sem alternativa correta: a equipe corrige a escolha
                    </label>
                    {p.alternativas.every((a) => !a.correta) && (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={p.outro ?? false}
                          onChange={(e) =>
                            mudarPergunta(i, { outro: e.target.checked })
                          }
                        />
                        Incluir a alternativa "Outro:" com campo de texto
                      </label>
                    )}
                  </div>
                )}
                {ehAberta(p.tipo) && (
                  <p className="text-xs text-muted-foreground">
                    {p.tipo === 'arquivo'
                      ? 'O aluno envia até 3 arquivos de até 500 MB (fotos, PDFs, áudios, vídeos).'
                      : 'O aluno escreve a resposta.'}{' '}
                    {quiz.semCorrecao
                      ? 'Aceita ao enviar.'
                      : 'A equipe corrige na fila "Aguardando correção".'}
                  </p>
                )}
              </div>
              <ul className="flex flex-col gap-3">
                {p.alternativas.map((a, k) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: alternativas ainda não têm id na edição
                    key={k}
                    className="flex flex-col gap-2 rounded-md bg-muted/40 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type={p.tipo === 'unica' ? 'radio' : 'checkbox'}
                        name={`p${i}-correta`}
                        className="size-4 accent-primary"
                        aria-label={`Alternativa ${k + 1} da pergunta ${i + 1} é correta`}
                        checked={a.correta}
                        onChange={(e) => marcarCorreta(i, k, e.target.checked)}
                      />
                      <Input
                        aria-label={`Texto da alternativa ${k + 1} da pergunta ${i + 1}`}
                        placeholder={`Alternativa ${k + 1}`}
                        value={a.texto}
                        onChange={(e) =>
                          mudarAlternativa(i, k, { texto: e.target.value })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="toque:size-11"
                        aria-label={`Remover alternativa ${k + 1} da pergunta ${i + 1}`}
                        disabled={p.alternativas.length <= 2}
                        onClick={() =>
                          mudarPergunta(i, {
                            alternativas: p.alternativas.filter(
                              (_, m) => m !== k,
                            ),
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <Input
                      aria-label={`Comentário da alternativa ${k + 1} da pergunta ${i + 1}`}
                      placeholder="Comentário para quem marcar esta alternativa (opcional)"
                      value={a.comentario ?? ''}
                      onChange={(e) =>
                        mudarAlternativa(i, k, { comentario: e.target.value })
                      }
                    />
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {!ehAberta(p.tipo) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      mudarPergunta(i, {
                        alternativas: [...p.alternativas, alternativaNova()],
                      })
                    }
                  >
                    <Plus />
                    Alternativa
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setQuiz((q) => ({
                      ...q,
                      perguntas: q.perguntas.filter((_, j) => j !== i),
                    }))
                  }
                >
                  <Trash2 />
                  Remover pergunta
                </Button>
              </div>
            </fieldset>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setQuiz((q) => ({
                  ...q,
                  perguntas: [...q.perguntas, perguntaNova()],
                }))
              }
            >
              <Plus />
              Pergunta
            </Button>
            <Button type="submit" disabled={ocupado}>
              Salvar exercício
            </Button>
            {existe && (
              <BotaoExcluir
                rotulo="Remover exercício"
                titulo="Remover o exercício desta aula?"
                descricao="As perguntas e as alternativas saem da aula. Exercício que já tem tentativas de alunos não pode ser removido."
                acao="Remover"
                disabled={ocupado}
                onConfirmado={() =>
                  executar(async () => {
                    await removerQuizFn({ data: { aulaId } })
                    setQuiz(QUIZ_NOVO)
                    setExiste(false)
                  }, 'Exercício removido.')
                }
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Salvar não altera as tentativas já enviadas: elas guardam as
            perguntas do momento.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
