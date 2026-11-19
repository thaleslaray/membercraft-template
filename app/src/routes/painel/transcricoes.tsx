import { createFileRoute } from '@tanstack/react-router'
import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { VazioDoPainel } from '#/components/painel/estados'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { toast } from '#/lib/toast'
import {
  importarTranscricoesFn,
  transcricoesDoPainelFn,
} from '#/lib/transcricoes-fns'
import type {
  ArquivoIgnorado,
  TranscricaoImportada,
} from '#/regras/transcricoes'

export const Route = createFileRoute('/painel/transcricoes')({
  loader: () => transcricoesDoPainelFn(),
  head: () => ({ meta: [{ title: 'Transcrições · Estúdio' }] }),
  component: Transcricoes,
})

const MOTIVOS: Record<ArquivoIgnorado['motivo'], string> = {
  'sem-id': 'o nome não começa com o ID do Vimeo',
  'sem-aula': 'nenhuma aula usa este vídeo',
  'sem-legenda': 'não achei legendas com tempo no arquivo',
}

// Tamanho máximo do que vai numa chamada (caracteres), para respeitar o limite do corpo.
const LIMITE_DA_LEVA = 800_000

async function lerEmLevas(arquivos: File[]) {
  const levas: { nome: string; conteudo: string }[][] = []
  let atual: { nome: string; conteudo: string }[] = []
  let tamanho = 0
  for (const arquivo of arquivos) {
    const conteudo = await arquivo.text()
    if (
      atual.length > 0 &&
      (tamanho + conteudo.length > LIMITE_DA_LEVA || atual.length >= 50)
    ) {
      levas.push(atual)
      atual = []
      tamanho = 0
    }
    atual.push({ nome: arquivo.name, conteudo })
    tamanho += conteudo.length
  }
  if (atual.length > 0) levas.push(atual)
  return levas
}

function Transcricoes() {
  const transcricoes = Route.useLoaderData()
  const { executar, ocupado } = useAcao()
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [importadas, setImportadas] = useState<TranscricaoImportada[]>([])
  const [ignorados, setIgnorados] = useState<ArquivoIgnorado[]>([])

  async function enviar(lista: FileList | null) {
    const arquivos = lista ? Array.from(lista) : []
    if (arquivos.length === 0) return
    setEnviando(true)
    setImportadas([])
    setIgnorados([])
    try {
      const novas: TranscricaoImportada[] = []
      const sobras: ArquivoIgnorado[] = []
      for (const leva of await lerEmLevas(arquivos)) {
        const r = await importarTranscricoesFn({ data: { arquivos: leva } })
        novas.push(...r.importadas)
        sobras.push(...r.ignorados)
      }
      setImportadas(novas)
      setIgnorados(sobras)
      toast.success(
        `${novas.length} ${novas.length === 1 ? 'transcrição importada' : 'transcrições importadas'}.`,
      )
      await executar(async () => {})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para importar.')
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Transcrições"
        contexto="O texto falado nos vídeos alimenta a busca do aluno e leva ao minuto certo. O aluno não vê o texto."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importar em lote</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Escolha arquivos SRT ou VTT nomeados pelo ID do Vimeo, como{' '}
            <code>123456789.srt</code>. Um arquivo novo do mesmo vídeo substitui
            o anterior.
          </p>
          <input
            ref={entrada}
            type="file"
            multiple
            accept=".srt,.vtt"
            aria-label="Arquivos de transcrição"
            className="sr-only"
            onChange={(e) => enviar(e.target.files)}
          />
          <div>
            <Button
              type="button"
              className="toque:min-h-11"
              disabled={enviando || ocupado}
              onClick={() => entrada.current?.click()}
            >
              <Upload />
              {enviando ? 'Importando…' : 'Escolher arquivos'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(importadas.length > 0 || ignorados.length > 0) && (
        <Card role="region" aria-labelledby="titulo-do-resultado">
          <CardHeader>
            <CardTitle
              id="titulo-do-resultado"
              role="heading"
              aria-level={2}
              className="text-base"
            >
              Resultado da importação
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <section aria-label="Importadas">
              <h3 className="mb-2 text-sm font-medium">
                Importadas ({importadas.length})
              </h3>
              {importadas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma.</p>
              ) : (
                <ul className="flex flex-col divide-y rounded-md border text-sm">
                  {importadas.map((i) => (
                    <li
                      key={i.nome}
                      className="flex flex-wrap gap-x-3 px-3 py-2"
                    >
                      <span className="font-medium">{i.nome}</span>
                      <span className="flex-1 text-muted-foreground">
                        {i.aulas.join(', ')}
                      </span>
                      <span className="text-muted-foreground">
                        {i.trechos} trechos
                        {i.substituiu ? ' · substituiu a anterior' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Arquivos sem aula">
              <h3 className="mb-2 text-sm font-medium">
                Não entraram ({ignorados.length})
              </h3>
              {ignorados.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todos os arquivos acharam aula.
                </p>
              ) : (
                <ul className="flex flex-col divide-y rounded-md border text-sm">
                  {ignorados.map((i) => (
                    <li
                      key={i.nome}
                      className="flex flex-wrap gap-x-3 px-3 py-2"
                    >
                      <span className="font-medium">{i.nome}</span>
                      <span className="text-muted-foreground">
                        {MOTIVOS[i.motivo]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Vídeos com transcrição ({transcricoes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transcricoes.length === 0 ? (
            <VazioDoPainel
              mensagem="Nenhuma transcrição ainda. Use “Importar em lote” acima, com arquivos SRT ou VTT nomeados pelo ID do Vimeo."
              className="p-4 md:p-4"
            />
          ) : (
            <ul className="flex flex-col divide-y rounded-md border text-sm">
              {transcricoes.map((t) => (
                <li
                  key={t.vimeoId}
                  className="flex flex-wrap gap-x-3 px-3 py-2"
                >
                  <span className="font-medium">{t.vimeoId}</span>
                  <span className="flex-1 text-muted-foreground">
                    {t.aulas.length > 0
                      ? t.aulas.join(', ')
                      : 'Sem aula no momento'}
                  </span>
                  <span className="text-muted-foreground">
                    {t.trechos} trechos
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PaginaDoPainel>
  )
}
