import { Link } from '@tanstack/react-router'
import { Award, Download } from 'lucide-react'
import { CARD_DE_LEITURA } from '#/components/casca-lume/pagina-lume'
import { BotaoCopiarLinkDeValidacao } from '#/components/certificados/copiar-link-de-validacao'
import { PreviaDoCertificado } from '#/components/certificados/previa-do-certificado'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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
import type { certificadoDoCursoFn } from '#/lib/certificados-fns'

export type SituacaoDoCertificado = Awaited<
  ReturnType<typeof certificadoDoCursoFn>
>

type Emitido = Extract<SituacaoDoCertificado, { tipo: 'emitido' }>

/** O certificado tem prévia para abrir: emitido, com o PDF pronto e o modelo ainda com imagem. */
export function previaDisponivel(
  situacao: SituacaoDoCertificado,
): situacao is Emitido & {
  modelo: NonNullable<Emitido['modelo']>
} {
  return (
    situacao.tipo === 'emitido' &&
    situacao.certificado.situacao === 'pronto' &&
    situacao.modelo !== null
  )
}

function Previa({ emitido }: { emitido: Emitido }) {
  if (!emitido.modelo) return null
  return (
    <PreviaDoCertificado
      frente={emitido.modelo.frente}
      campos={emitido.modelo.campos}
      nome={emitido.certificado.nome}
      cursoNome={emitido.certificado.cursoNome}
      concluidoEm={emitido.certificado.concluidoEm}
      codigo={emitido.certificado.codigo}
    />
  )
}

/**
 * O certificado grande: janela no desktop, folha de baixo para cima no celular (que fecha arrastando).
 * O botão principal fica em cima.
 */
export function FolhaDoCertificado({
  emitido,
  aberta,
  aoMudar,
}: {
  emitido: Emitido
  aberta: boolean
  aoMudar: (aberta: boolean) => void
}) {
  const celular = useIsMobile()
  const baixar = (
    <Button asChild size="lg" className="w-full sm:w-auto">
      <a href={`/api/certificados/${emitido.certificado.id}`}>
        <Download />
        Baixar PDF
      </a>
    </Button>
  )
  const corpo = (
    <div className="flex flex-col gap-4 px-4 pb-6 sm:px-0 sm:pb-0">
      <Previa emitido={emitido} />
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {baixar}
        <BotaoCopiarLinkDeValidacao
          codigo={emitido.certificado.codigo}
          cursoNome={emitido.certificado.cursoNome}
          size="lg"
          className="w-full sm:w-auto"
        />
      </div>
    </div>
  )
  if (celular) {
    return (
      <Drawer open={aberta} onOpenChange={aoMudar}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Seu certificado</DrawerTitle>
            <DrawerDescription>
              {emitido.certificado.cursoNome}
            </DrawerDescription>
          </DrawerHeader>
          {corpo}
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Dialog open={aberta} onOpenChange={aoMudar}>
      <DialogContent className="gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Seu certificado</DialogTitle>
          <DialogDescription>{emitido.certificado.cursoNome}</DialogDescription>
        </DialogHeader>
        {corpo}
      </DialogContent>
    </Dialog>
  )
}

/**
 * A situação do certificado no topo do curso: o que falta, confirmar o nome, ou a prévia com "Baixar".
 * Curso sem certificado: nada.
 */
export function CertificadoDoTopo({
  situacao,
  aoAbrir,
}: {
  situacao: SituacaoDoCertificado
  aoAbrir: () => void
}) {
  if (situacao.tipo === 'sem-certificado') return null

  if (situacao.tipo === 'emitido' && previaDisponivel(situacao)) {
    return (
      <section
        aria-label="Certificado"
        className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-xs"
      >
        <button
          type="button"
          onClick={aoAbrir}
          className="pressiona-cartao block w-full rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Previa emitido={situacao} />
        </button>
        <div className="flex items-center justify-between gap-3 px-1 text-sm">
          <span className="font-medium">Certificado pronto</span>
          <a
            href={`/api/certificados/${situacao.certificado.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 font-medium whitespace-nowrap"
          >
            <Download className="size-4" aria-hidden="true" />
            Baixar PDF
          </a>
        </div>
        {situacao.geraMec && <AvisoDoMec />}
      </section>
    )
  }

  let conteudo: React.ReactNode
  if (situacao.tipo === 'faltam') {
    conteudo = <span>{situacao.texto} para o seu certificado.</span>
  } else if (situacao.tipo === 'aguardando-nome') {
    conteudo = (
      <span>
        Você cumpriu as exigências do curso.{' '}
        <Link to="/certificados">Confirme seu nome</Link> para receber o
        certificado.
      </span>
    )
  } else if (situacao.certificado.situacao === 'revogado') {
    conteudo = <span>Seu certificado deste curso foi revogado.</span>
  } else if (situacao.certificado.situacao === 'pronto') {
    conteudo = (
      <span>
        Seu certificado está pronto.{' '}
        <a href={`/api/certificados/${situacao.certificado.id}`}>Baixar PDF</a>
      </span>
    )
  } else if (situacao.certificado.situacao === 'falhou') {
    conteudo = <span>Não conseguimos gerar o PDF. Fale com o suporte.</span>
  } else {
    conteudo = <span>Estamos gerando o seu certificado.</span>
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        role="status"
        className={`flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-xs ${CARD_DE_LEITURA} in-data-[casca=lume]:px-[calc(1rem*var(--leitura-recuo))]`}
      >
        <Award className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {conteudo}
      </div>
      {situacao.geraMec && <AvisoDoMec />}
    </div>
  )
}

function AvisoDoMec() {
  return (
    <p className="px-1 text-[13px] leading-5 text-muted-foreground">
      O certificado do MEC é emitido depois, pela Voomp.
    </p>
  )
}
