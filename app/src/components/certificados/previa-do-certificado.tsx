import { type CSSProperties, useMemo, useSyncExternalStore } from 'react'
import { urlDaImagem } from '#/lib/imagens'
import {
  type Alinhamento,
  type CampoDoModelo,
  type Fonte,
  LARGURA_DA_PAGINA,
} from '#/regras/certificado-modelo'
import { enderecoDeValidacao, matrizDoQr } from '#/regras/certificado-qr'
import {
  ajustarTextoDoCampo,
  ENTRELINHA,
  larguraDisponivelDoCampo,
  medidaAproximada,
} from '#/regras/certificado-texto'

export const FAMILIA: Record<Fonte, string> = {
  helvetica: 'Helvetica, Arial, sans-serif',
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
  allura: 'Allura, cursive',
}

const COMO_FICA: Record<Alinhamento, string> = {
  esquerda: '0%',
  centro: '-50%',
  direita: '-100%',
}

/**
 * Posição e letra de um campo sobre a imagem, em porcentagem da largura e `cqw` (o palco declara
 * `container-type: inline-size`): a mesma conta do PDF, que parte da página de 842 pt. O editor do
 * modelo e a prévia da aluna usam esta função.
 */
export function estiloDoCampo(
  c: CampoDoModelo,
  tamanhoEfetivo = c.tamanho,
): CSSProperties {
  const tamanho = `${(tamanhoEfetivo / LARGURA_DA_PAGINA) * 100}cqw`
  const posicao = { left: `${c.x * 100}%`, top: `${c.y * 100}%` }
  if (c.campo === 'qr') {
    return {
      ...posicao,
      width: tamanho,
      height: tamanho,
      transform: 'translate(-50%, -50%)',
    }
  }
  return {
    ...posicao,
    transform: `translate(${COMO_FICA[c.alinhamento]}, -50%)`,
    fontSize: tamanho,
    fontFamily: FAMILIA[c.fonte],
    fontWeight: c.negrito ? 700 : 400,
    color: c.cor,
    lineHeight: 1,
    textAlign:
      c.alinhamento === 'centro'
        ? 'center'
        : c.alinhamento === 'direita'
          ? 'right'
          : 'left',
  }
}

/** "7 de novembro de 2026", no horário de Brasília (o mesmo texto do PDF). */
function dataPorExtenso(data: Date): string {
  return data.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

const semAssinatura = () => () => {}

/** Origem do site: vazia no servidor e na hidratação, a real depois (evita diferença entre os dois). */
function useOrigem(): string {
  return useSyncExternalStore(
    semAssinatura,
    () => window.location.origin,
    () => '',
  )
}

function QrDoCertificado({ endereco }: { endereco: string }) {
  const matriz = useMemo(() => matrizDoQr(endereco), [endereco])
  const n = matriz.length
  return (
    <svg
      viewBox={`-1 -1 ${n + 2} ${n + 2}`}
      className="size-full bg-white"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {matriz.flatMap((linha, l) =>
        linha.map((escuro, c) =>
          escuro ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: matriz fixa, a posição é a identidade
            <rect key={`${l}-${c}`} x={c} y={l} width={1} height={1} />
          ) : null,
        ),
      )}
    </svg>
  )
}

/**
 * Prévia do certificado: a arte da frente do modelo com os campos do aluno nas posições guardadas,
 * montada no navegador (nada de PDF). Independente de tela: Meus cursos, o curso, a conclusão e a
 * página de Certificados a usam. A imagem sai do nosso domínio e o texto fica em HTML por cima.
 */
export function PreviaDoCertificado({
  frente,
  campos,
  nome,
  cursoNome,
  concluidoEm,
  codigo,
  className,
}: {
  /** Chave da imagem da frente no R2. */
  frente: string
  campos: CampoDoModelo[]
  nome: string
  cursoNome: string
  concluidoEm: Date | string
  codigo: string
  className?: string
}) {
  const texto: Record<Exclude<CampoDoModelo['campo'], 'qr'>, string> = {
    nome,
    curso: cursoNome,
    data: dataPorExtenso(new Date(concluidoEm)),
    codigo,
  }
  const endereco = enderecoDeValidacao(useOrigem(), codigo)
  return (
    <div
      role="img"
      aria-label={`Prévia do certificado de ${nome} em ${cursoNome}`}
      data-testid="previa-do-certificado"
      className={`relative w-full select-none overflow-hidden rounded-md border bg-muted ${className ?? ''}`}
      style={{ containerType: 'inline-size' }}
    >
      <img
        src={urlDaImagem(frente) ?? ''}
        alt=""
        className="block w-full"
        draggable={false}
      />
      {campos
        .filter((c) => c.lado === 'frente')
        .map((c) => {
          if (c.campo === 'qr') {
            return (
              <span
                key={c.campo}
                aria-hidden="true"
                style={estiloDoCampo(c)}
                className="absolute whitespace-nowrap"
              >
                <QrDoCertificado endereco={endereco} />
              </span>
            )
          }
          // Mesma regra do PDF: diminui até 70%, depois quebra em 2 linhas, nunca corta.
          const { linhas, tamanho } = ajustarTextoDoCampo(
            texto[c.campo],
            c.tamanho,
            larguraDisponivelDoCampo(c),
            (t, tam) => medidaAproximada(t, tam, c.fonte, c.negrito),
          )
          return (
            <span
              key={c.campo}
              aria-hidden="true"
              style={{
                ...estiloDoCampo(c, tamanho),
                lineHeight: linhas.length > 1 ? ENTRELINHA : 1,
              }}
              className="absolute whitespace-pre"
            >
              {linhas.join('\n')}
            </span>
          )
        })}
    </div>
  )
}
