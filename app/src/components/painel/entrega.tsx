/**
 * O que a aluna entregou, para a Equipe ler (fila de correção, detalhe da entrega e ficha da aluna).
 *
 *   <RespostaDaPergunta pergunta={p} />   // só o conteúdo: texto, arquivos ou alternativas marcadas
 *   <DetalheDaEntrega entrega={e} />      // todas as perguntas, só leitura
 *   <TabelaDeEntregas linhas={...} />     // lista de tentativas, cada uma com link para o detalhe
 *
 * Imagem vira miniatura (abre em outra aba), PDF abre num visualizador recolhível e o resto é link de
 * download. Falta de texto ou de arquivo aparece em destaque: a Equipe precisa saber que nada veio.
 */
import { Link } from '@tanstack/react-router'
import { Download, ExternalLink } from 'lucide-react'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import { type ColunaDaTabela, TabelaDoPainel } from '#/components/painel/tabela'
import { FUSO_DA_ESCOLA, formatarDataHoraNoFuso } from '#/lib/datas'
import { formatarTamanho } from '#/lib/tamanho'
import {
  type EntregaDetalhada,
  ESTADO_DA_ENTREGA,
  formaDoArquivo,
  type LinhaDeEntrega,
  type PerguntaDaEntrega,
} from '#/regras/entregas-do-painel'
import type { ArquivoDaEntrega } from '#/regras/quiz'

export const dataDaEntrega = (d: Date) =>
  formatarDataHoraNoFuso(d, FUSO_DA_ESCOLA)

const TIPO_DA_PERGUNTA: Record<string, string> = {
  texto_livre: 'Texto livre',
  arquivo: 'Envio de arquivo',
  multipla: 'Múltipla escolha',
  unica: 'Escolha única',
}
export const rotuloDoTipo = (tipo: string) => TIPO_DA_PERGUNTA[tipo] ?? tipo

const AUSENTE =
  'w-fit rounded-md border border-warning/50 bg-background px-2 py-1 text-sm font-medium text-foreground'

function ArquivoEntregue({ arquivo }: { arquivo: ArquivoDaEntrega }) {
  const url = `/api/entregas/${arquivo.id}`
  const tamanho = formatarTamanho(arquivo.tamanho)
  const forma = formaDoArquivo(arquivo.tipo)
  if (forma === 'imagem') {
    return (
      <figure className="flex flex-col gap-1">
        <a href={url} target="_blank" rel="noreferrer" className="w-fit">
          <img
            src={url}
            alt={`Imagem enviada: ${arquivo.nome}`}
            loading="lazy"
            className="max-h-72 max-w-full rounded-md border bg-background object-contain"
          />
        </a>
        <figcaption className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {arquivo.nome} ({tamanho})
        </figcaption>
      </figure>
    )
  }
  if (forma === 'pdf') {
    return (
      <div className="flex flex-col gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden />
          Abrir PDF
          <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {arquivo.nome} ({tamanho})
          </span>
        </a>
        <details open className="rounded-md border">
          <summary className="cursor-pointer px-3 py-2 text-sm toque:min-h-11">
            Visualizar {arquivo.nome}
          </summary>
          <iframe
            src={url}
            title={`PDF enviado: ${arquivo.nome}`}
            className="h-[480px] w-full rounded-b-md bg-background"
          />
        </details>
      </div>
    )
  }
  return (
    <a
      href={url}
      download
      className="inline-flex w-fit items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
    >
      <Download className="size-4" aria-hidden />
      <span className="[overflow-wrap:anywhere]">{arquivo.nome}</span>
      <span className="text-xs text-muted-foreground">({tamanho})</span>
    </a>
  )
}

/** O conteúdo da resposta de uma pergunta, pelo tipo dela. */
export function RespostaDaPergunta({
  pergunta: p,
}: {
  pergunta: PerguntaDaEntrega
}) {
  if (p.tipo === 'texto_livre') {
    return p.texto?.trim() ? (
      <p className="rounded-md border bg-background p-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
        {p.texto}
      </p>
    ) : (
      <p className={AUSENTE}>Sem texto</p>
    )
  }
  if (p.tipo === 'arquivo') {
    return p.arquivos.length === 0 ? (
      <p className={AUSENTE}>Nenhum arquivo enviado</p>
    ) : (
      <ul className="flex flex-col gap-3">
        {p.arquivos.map((a) => (
          <li key={a.id}>
            <ArquivoEntregue arquivo={a} />
          </li>
        ))}
      </ul>
    )
  }
  const marcou = p.escolhas.some((e) => e.marcada)
  return (
    <div className="flex flex-col gap-2">
      {!marcou && <p className={AUSENTE}>Nada marcado</p>}
      <ul className="flex flex-col gap-1.5 text-sm">
        {p.escolhas.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-background px-3 py-2"
          >
            <span aria-hidden>{e.marcada ? '●' : '○'}</span>
            <span className={e.marcada ? 'font-medium' : undefined}>
              <span className="sr-only">
                {e.marcada ? 'Marcada: ' : 'Não marcada: '}
              </span>
              {e.texto}
            </span>
            {e.correta && (
              <EtiquetaDeEstado tom="ok" rotulo="Resposta correta" />
            )}
          </li>
        ))}
      </ul>
      {p.texto?.trim() && (
        <p className="rounded-md border bg-background p-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
          <span className="font-medium">Outro: </span>
          {p.texto}
        </p>
      )}
    </div>
  )
}

export function EtiquetaDaSituacao({
  situacao,
}: {
  situacao: PerguntaDaEntrega['situacao']
}) {
  if (situacao === 'certa') return <EtiquetaDeEstado tom="ok" rotulo="Certa" />
  if (situacao === 'errada') {
    return <EtiquetaDeEstado tom="perigo" rotulo="Errada" />
  }
  if (situacao === 'pendente') {
    return <EtiquetaDeEstado tom="atencao" rotulo="Pendente" />
  }
  return null
}

/** Todas as perguntas da tentativa, só leitura. */
export function DetalheDaEntrega({ entrega }: { entrega: EntregaDetalhada }) {
  return (
    <div className="flex flex-col gap-4">
      {entrega.perguntas.map((p) => (
        <section
          key={p.id}
          aria-label={p.enunciado}
          className="flex flex-col gap-3 rounded-md border bg-surface p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
              {p.enunciado}
              <span className="block text-xs font-normal text-muted-foreground">
                {rotuloDoTipo(p.tipo)}
              </span>
            </h3>
            <EtiquetaDaSituacao situacao={p.situacao} />
          </div>
          <RespostaDaPergunta pergunta={p} />
          {p.comentario && (
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              <span className="font-medium text-foreground">Comentário: </span>
              {p.comentario}
            </p>
          )}
        </section>
      ))}
    </div>
  )
}

export const notaDaEntrega = (e: LinhaDeEntrega) =>
  e.estado === 'aguardando_correcao'
    ? '—'
    : `${e.acertos} de ${e.total} (${e.percentual}%)`

/** Lista de tentativas; `mostrarAluna: false` na ficha da própria aluna. */
export function TabelaDeEntregas({
  linhas,
  rotulo = 'Entregas',
  mostrarAluna = true,
  vazio,
}: {
  linhas: LinhaDeEntrega[]
  rotulo?: string
  mostrarAluna?: boolean
  vazio?: React.ReactNode
}) {
  const colunas: ColunaDaTabela<LinhaDeEntrega>[] = [
    ...(mostrarAluna
      ? [
          {
            rotulo: 'Aluna',
            essencial: true,
            celula: (e: LinhaDeEntrega) => (
              <>
                <span className="block font-medium">
                  {e.alunoNome || 'Sem nome'}
                </span>
                <span className="block text-muted-foreground [overflow-wrap:anywhere]">
                  {e.alunoEmail}
                </span>
              </>
            ),
          },
        ]
      : []),
    {
      rotulo: 'Exercício',
      essencial: true,
      celula: (e) => (
        <Link
          to="/painel/entregas/$tentativaId"
          params={{ tentativaId: e.id }}
          className="block no-underline hover:underline"
        >
          <span className="block font-medium">{e.aulaTitulo}</span>
          <span className="block text-muted-foreground">
            {e.cursoNome} · tentativa {e.numero}
          </span>
        </Link>
      ),
    },
    {
      rotulo: 'Enviada em',
      essencial: true,
      celula: (e) => dataDaEntrega(e.enviadaEm),
    },
    {
      rotulo: 'Estado',
      essencial: true,
      celula: (e) => <EtiquetaDeEstado {...ESTADO_DA_ENTREGA[e.estado]} />,
    },
    { rotulo: 'Nota', numero: true, celula: notaDaEntrega },
    {
      rotulo: 'Corrigida por',
      celula: (e) => e.corrigidaPor ?? '—',
    },
  ]
  return (
    <TabelaDoPainel
      rotulo={rotulo}
      linhas={linhas}
      chave={(e) => e.id}
      testIdDaLinha={(e) => `entrega-${e.id}`}
      colunas={colunas}
      vazio={vazio}
    />
  )
}
