import { Award, Download, ExternalLink } from 'lucide-react'
import { type CSSProperties, useRef, useState } from 'react'
import {
  BOTAO_FORTE,
  LEITURA_NO_PAPEL,
} from '#/components/casca-lume/pagina-lume'
import { BotaoCopiarLinkDeValidacao } from '#/components/certificados/copiar-link-de-validacao'
import { PreviaDoCertificado } from '#/components/certificados/previa-do-certificado'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '#/components/ui/drawer'
import { useIsMobile } from '#/hooks/use-mobile'
import { formatarDataNoFuso, formatarDiaEMes } from '#/lib/datas'
import type { CertificadoDoAluno } from '#/regras/certificados'

const SITUACOES = {
  gerando: 'Gerando',
  pronto: 'Pronto',
  falhou: 'Falhou',
  revogado: 'Revogado',
} as const

/**
 * Um certificado emitido como prévia com o nome da aluna, com "Baixar" e "Copiar link de validação".
 * Tocar na prévia abre o certificado grande crescendo a partir dela e fecha voltando para ela.
 */
export function CartaoDeCertificado({
  c,
  fuso,
}: {
  c: CertificadoDoAluno
  fuso: string
}) {
  const [aberto, setAberto] = useState(false)
  const [origem, setOrigem] = useState({ x: 0, y: 0 })
  const gatilho = useRef<HTMLButtonElement>(null)
  const celular = useIsMobile()
  const revogado = c.situacao === 'revogado'

  function abrir(el: HTMLElement) {
    // Origem do crescimento: o centro da prévia, relativo ao centro da janela (o diálogo é fixo e centralizado).
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2 - window.innerWidth / 2
    const y = r.top + r.height / 2 - window.innerHeight / 2
    setOrigem({ x: Math.round(x), y: Math.round(y) })
    setAberto(true)
  }

  const previa = c.modelo && (
    <PreviaDoCertificado
      frente={c.modelo.frente}
      campos={c.modelo.campos}
      nome={c.nome}
      cursoNome={c.cursoNome}
      concluidoEm={c.concluidoEm}
      codigo={c.codigo}
      className={revogado ? 'opacity-50' : undefined}
    />
  )

  return (
    <article
      className={`flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground md:p-5 ${LEITURA_NO_PAPEL} in-data-[casca=lume]:rounded-[calc((var(--radius)+4px)*var(--leitura-quina))] in-data-[casca=lume]:px-[calc(1rem*var(--leitura-recuo))] in-data-[casca=lume]:md:px-[calc(1.25rem*var(--leitura-recuo))]`}
      aria-label={`Certificado de ${c.cursoNome}`}
    >
      {previa ? (
        <button
          ref={gatilho}
          type="button"
          onClick={(e) => abrir(e.currentTarget)}
          className="pressiona-cartao block w-full cursor-zoom-in rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {previa}
          <span className="sr-only">. Abrir em tamanho grande</span>
        </button>
      ) : (
        <div className="grid aspect-[1.414] w-full place-items-center rounded-md border bg-muted text-muted-foreground">
          <Award className="size-8" aria-hidden="true" />
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-medium text-balance wrap-break-word">
            {c.cursoNome}
          </h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            Concluído em {formatarDataNoFuso(c.concluidoEm, fuso)} · código{' '}
            {c.codigo}
          </p>
        </div>
        <Badge variant={revogado ? 'destructive' : 'outline'}>
          {SITUACOES[c.situacao]}
        </Badge>
      </div>

      {!revogado && (
        <div className="flex flex-wrap gap-2">
          {c.situacao === 'pronto' ? (
            <Button asChild size="sm" className={`${BOTAO_FORTE} toque:h-11`}>
              <a href={`/api/certificados/${c.id}`}>
                <Download />
                Baixar
                <span className="sr-only"> PDF de {c.cursoNome}</span>
              </a>
            </Button>
          ) : c.situacao === 'falhou' ? (
            <p role="alert" className="text-sm text-destructive">
              Não conseguimos gerar o PDF. Fale com o suporte.
            </p>
          ) : (
            <Button size="sm" className="toque:h-11" aria-disabled="true">
              Preparando o PDF…
            </Button>
          )}
          <BotaoCopiarLinkDeValidacao
            codigo={c.codigo}
            cursoNome={c.cursoNome}
          />
        </div>
      )}

      {c.mec && (
        <div className="flex w-full flex-wrap items-center gap-3 border-t pt-3 text-sm">
          <span className="font-medium">Certificado do MEC</span>
          {c.mec.situacao === 'liberado' ? (
            <>
              <Badge variant="outline">
                Liberado em{' '}
                {c.mec.liberadoEm
                  ? formatarDiaEMes(new Date(c.mec.liberadoEm), fuso)
                  : ''}
              </Badge>
              {c.mec.link && (
                <Button
                  asChild
                  size="sm"
                  className="toque:h-11"
                  variant="outline"
                >
                  <a href={c.mec.link} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Abrir na Voomp
                  </a>
                </Button>
              )}
            </>
          ) : (
            <>
              <Badge variant="secondary">Em liberação</Badge>
              <span className="text-muted-foreground">
                O certificado do MEC é emitido depois, pela Voomp.
              </span>
            </>
          )}
        </div>
      )}

      {previa && celular && (
        // No celular o certificado grande é uma folha de baixo para cima, como na página do curso.
        <Drawer open={aberto} onOpenChange={setAberto}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{c.cursoNome}</DrawerTitle>
              <DrawerDescription className="sr-only">
                Certificado de {c.nome}, código {c.codigo}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-6">{previa}</div>
          </DrawerContent>
        </Drawer>
      )}

      {previa && !celular && (
        <Dialog open={aberto} onOpenChange={setAberto}>
          <DialogContent
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              gatilho.current?.focus()
            }}
            className="cresce-da-origem max-w-[calc(100%-1rem)] gap-3 p-3 sm:max-w-4xl sm:p-4"
            style={
              {
                '--origem-x': `${origem.x}px`,
                '--origem-y': `${origem.y}px`,
              } as CSSProperties
            }
          >
            <DialogTitle className="pr-8 text-base leading-6 font-medium">
              {c.cursoNome}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Certificado de {c.nome}, código {c.codigo}
            </DialogDescription>
            {previa}
          </DialogContent>
        </Dialog>
      )}
    </article>
  )
}
