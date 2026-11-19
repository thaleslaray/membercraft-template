import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Angry, Frown, Laugh, Meh, Smile } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { avaliacaoDaAulaQuery } from '#/lib/aula-queries'
import { avaliarAulaFn } from '#/lib/avaliacoes-fns'
import { toast } from '#/lib/toast'

const CARINHAS = [
  { nota: 1, rotulo: 'Muito ruim', icone: Angry },
  { nota: 2, rotulo: 'Ruim', icone: Frown },
  { nota: 3, rotulo: 'Mais ou menos', icone: Meh },
  { nota: 4, rotulo: 'Boa', icone: Smile },
  { nota: 5, rotulo: 'Muito boa', icone: Laugh },
] as const

const NOTA_BAIXA_MAXIMA = 2

// "O que você achou da aula?": cinco carinhas, nota de 1 a 5, que o aluno pode mudar. Com nota 1
// ou 2 abre "O que faltou?", que só a equipe lê. Gravar de novo muda o mesmo registro.
export function AvaliacaoDaAula({ aulaId }: { aulaId: string }) {
  const queryClient = useQueryClient()
  const { queryKey: chave } = avaliacaoDaAulaQuery(aulaId)
  const { data: avaliacao, isPending } = useQuery(avaliacaoDaAulaQuery(aulaId))
  const [nota, setNota] = useState<number | null>(null)
  const [texto, setTexto] = useState('')
  const [gravando, setGravando] = useState(false)

  // Traz o que já foi gravado (e refaz se o aluno trocar de aula).
  useEffect(() => {
    setNota(avaliacao?.nota ?? null)
    setTexto(avaliacao?.oQueFaltou ?? '')
  }, [avaliacao])

  async function gravar(novaNota: number, oQueFaltou: string | null) {
    setGravando(true)
    try {
      await avaliarAulaFn({ data: { aulaId, nota: novaNota, oQueFaltou } })
      await queryClient.invalidateQueries({ queryKey: chave })
      return true
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : 'Não foi possível avaliar.',
      )
      return false
    } finally {
      setGravando(false)
    }
  }

  async function escolher(valor: string) {
    // Clicar na carinha já escolhida desmarca no ToggleGroup; a nota não se apaga.
    const nova = Number(valor)
    if (gravando || isPending || !nova || nova === nota) return
    const anterior = nota
    setNota(nova)
    if (!(await gravar(nova, null))) setNota(anterior)
    else if (nova > NOTA_BAIXA_MAXIMA) toast.success('Obrigada pela avaliação.')
  }

  async function enviarTexto() {
    if (nota === null || gravando || !textoMudou) return
    if (await gravar(nota, texto)) toast.success('Obrigada por contar.')
  }

  const baixa = nota !== null && nota <= NOTA_BAIXA_MAXIMA
  const textoMudou = texto.trim() !== (avaliacao?.oQueFaltou ?? '')

  return (
    // Medidas da área antiga: pergunta centralizada (14 px, 500) e as carinhas numa caixa com borda,
    // botões redondos de 28 px. Vive dentro do cartão da direita da página da aula.
    <section aria-label="Avaliação da aula" className="flex flex-col gap-3">
      <h2 className="text-center text-sm font-medium text-secondary-foreground">
        Como você avalia este conteúdo?
      </h2>
      <ToggleGroup
        type="single"
        value={nota === null ? '' : String(nota)}
        onValueChange={escolher}
        aria-disabled={gravando || isPending}
        aria-label="Nota da aula, de 1 a 5"
        spacing={8}
        className="w-full justify-center rounded-lg border px-4 py-3 max-sm:gap-0 max-sm:px-2 aria-disabled:opacity-50"
      >
        {CARINHAS.map(({ nota: n, rotulo, icone: Icone }) => (
          <ToggleGroupItem
            key={n}
            value={String(n)}
            aria-label={`${n} de 5: ${rotulo}`}
            title={rotulo}
            className="size-7 min-w-0 flex-none rounded-full p-0 max-sm:size-11 text-muted-foreground shadow-none data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
          >
            <Icone className="size-5" />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {nota !== null && (
        <p className="text-center text-xs text-muted-foreground">
          Sua nota: {nota} de 5. Você pode mudar quando quiser.
        </p>
      )}
      {baixa && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`o-que-faltou-${aulaId}`} className="text-sm">
            O que faltou?{' '}
            <span className="text-muted-foreground">(só a equipe lê)</span>
          </label>
          <Textarea
            id={`o-que-faltou-${aulaId}`}
            name="oQueFaltou"
            value={texto}
            maxLength={2000}
            rows={3}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div>
            <Button
              type="button"
              size="sm"
              aria-disabled={gravando || !textoMudou}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={enviarTexto}
            >
              Enviar
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
