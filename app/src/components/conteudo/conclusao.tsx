import { Link } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PreviaDoCertificado } from '#/components/certificados/previa-do-certificado'
import { AnelDoCurso, Bolinhas } from '#/components/conteudo/cartela'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { certificadoDoCursoFn } from '#/lib/certificados-fns'

export type Marco =
  | { tipo: 'modulo'; moduloNome: string; faltam: number }
  | { tipo: 'curso' }

type SituacaoDoCertificado = Awaited<ReturnType<typeof certificadoDoCursoFn>>

/**
 * Lê a situação do certificado quando a conclusão do curso abre: a leitura vem depois de a conclusão
 * ser gravada (e do certificado emitido por ela). Nulo enquanto carrega ou se a leitura falhar, e a
 * tela fica como era, sem certificado.
 */
function useSituacaoDoCertificado(cursoId: string, aberto: boolean) {
  const [situacao, setSituacao] = useState<SituacaoDoCertificado | null>(null)
  useEffect(() => {
    if (!aberto) return
    let valido = true
    let tentativas = 0
    let espera: ReturnType<typeof setTimeout> | undefined
    // O PDF sai da fila alguns segundos depois da emissão: relê até ficar pronto (no máximo 10 vezes).
    const ler = () =>
      certificadoDoCursoFn({ data: { cursoId } })
        .then((s) => {
          if (!valido) return
          setSituacao(s)
          if (
            s.tipo === 'emitido' &&
            s.certificado.situacao === 'gerando' &&
            ++tentativas < 10
          ) {
            espera = setTimeout(ler, 3000)
          }
        })
        .catch(() => valido && setSituacao(null))
    void ler()
    return () => {
      valido = false
      clearTimeout(espera)
      setSituacao(null)
    }
  }, [cursoId, aberto])
  return situacao
}

/** O que a tela diz sobre o certificado, em texto: nada quando o curso não tem. */
function textoDoCertificado(situacao: SituacaoDoCertificado | null) {
  if (!situacao) return null
  if (situacao.tipo === 'faltam') {
    return `${situacao.texto} para o seu certificado.`
  }
  if (situacao.tipo === 'aguardando-nome') {
    return 'Falta confirmar como o seu nome sai no certificado.'
  }
  if (situacao.tipo === 'emitido') {
    if (situacao.certificado.situacao === 'revogado') {
      return 'O certificado deste curso foi revogado.'
    }
    if (situacao.certificado.situacao === 'falhou') {
      return 'Não conseguimos gerar o PDF do certificado. Fale com o suporte.'
    }
    if (situacao.certificado.situacao === 'gerando') {
      return 'Estamos gerando o seu certificado. Ele aparece em Certificados em instantes.'
    }
  }
  return null
}

// Botão principal da conclusão por token, só na casca Lume: o padrão é o `primary` de sempre; o Ateliê usa o
// vinho da marca. O diálogo vai para um portal fora da casca, então a casca vem por prop (a variante
// `in-data-[casca=lume]` não o alcançaria). Na clássica, o `Button` fica como é.
const BOTAO_PRINCIPAL_LUME =
  'bg-(--conclusao-botao) text-(--conclusao-botao-tinta) hover:bg-(--conclusao-botao-hover)'

/**
 * O momento de fechar um módulo ou o curso: o anel da cartela enche até o novo ponto e diz o que vem a
 * seguir. Sem confete nem exclamação; o orgulho fica no anel completo e no próximo passo claro.
 */
export function ConclusaoDoMarco({
  marco,
  aoFechar,
  cursoId,
  cursoNome,
  modulos,
  cores,
  percentual,
  proximaAulaId,
  busca,
  cascaLume = false,
}: {
  marco: Marco | null
  aoFechar: () => void
  cursoId: string
  cursoNome: string
  modulos: { total: number; feitas: number }[]
  cores: string[]
  percentual: number
  proximaAulaId: string | null
  busca: { como?: string }
  /** Na casca Lume o botão principal lê os tokens do tema. */
  cascaLume?: boolean
}) {
  const BOTAO_PRINCIPAL = cascaLume ? BOTAO_PRINCIPAL_LUME : undefined
  const doCurso = marco?.tipo === 'curso'
  const certificado = useSituacaoDoCertificado(cursoId, doCurso)
  const emitido =
    certificado?.tipo === 'emitido' &&
    certificado.certificado.situacao !== 'revogado'
      ? certificado
      : null
  const comPrevia = emitido?.modelo
    ? { ...emitido, modelo: emitido.modelo }
    : null
  const aviso = textoDoCertificado(certificado)
  const mostraMec =
    certificado !== null &&
    certificado.tipo !== 'sem-certificado' &&
    certificado.geraMec
  return (
    <Dialog
      open={marco !== null}
      onOpenChange={(aberto) => !aberto && aoFechar()}
    >
      <DialogContent
        className={`gap-6 ${comPrevia ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="flex justify-center pt-2">
          {/* A chave remonta o anel a cada marco, para o preenchimento crescer de novo. */}
          <AnelDoCurso
            key={marco ? `${marco.tipo}-${percentual}` : 'fechado'}
            modulos={modulos}
            cores={cores}
            tamanho={128}
            espessura={10}
            rotulo={`Progresso do curso: ${percentual}%`}
          >
            <span className="text-2xl leading-8 font-medium tabular-nums">
              {percentual}%
            </span>
          </AnelDoCurso>
        </div>
        <Bolinhas cores={cores} className="-mt-2 justify-center" />
        <DialogHeader className="items-center text-center sm:text-center">
          <DialogTitle className="text-xl leading-7 font-medium">
            {doCurso ? 'Curso concluído' : 'Módulo concluído'}
          </DialogTitle>
          <DialogDescription className="text-balance">
            {marco?.tipo === 'modulo'
              ? `Você terminou ${marco.moduloNome}. ${
                  marco.faltam === 1
                    ? 'Falta 1 aula'
                    : `Faltam ${marco.faltam} aulas`
                } para fechar ${cursoNome}.`
              : `Você terminou todas as aulas de ${cursoNome}.${
                  certificado && certificado.tipo !== 'sem-certificado'
                    ? ''
                    : ' Se o curso tem certificado, ele aparece em Certificados.'
                }`}
          </DialogDescription>
        </DialogHeader>
        {comPrevia && (
          <PreviaDoCertificado
            frente={comPrevia.modelo.frente}
            campos={comPrevia.modelo.campos}
            nome={comPrevia.certificado.nome}
            cursoNome={comPrevia.certificado.cursoNome}
            concluidoEm={comPrevia.certificado.concluidoEm}
            codigo={comPrevia.certificado.codigo}
          />
        )}
        {(aviso || mostraMec) && (
          <div
            role="status"
            className="flex flex-col gap-1 text-center text-sm text-muted-foreground"
          >
            {aviso && <p>{aviso}</p>}
            {mostraMec && (
              <p>O certificado do MEC é emitido depois, pela Voomp.</p>
            )}
          </div>
        )}
        {/* No celular o rodapé empilha ao contrário: o último botão fica em cima, e o primário vem por último. */}
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={aoFechar}>
            Ficar nesta aula
          </Button>
          {doCurso ? (
            <>
              <Button
                variant={
                  certificado?.tipo === 'aguardando-nome'
                    ? 'default'
                    : 'outline'
                }
                className={
                  certificado?.tipo === 'aguardando-nome'
                    ? BOTAO_PRINCIPAL
                    : undefined
                }
                asChild
              >
                <Link to="/certificados" onClick={aoFechar}>
                  {certificado?.tipo === 'aguardando-nome'
                    ? 'Confirmar nome'
                    : 'Ver certificados'}
                </Link>
              </Button>
              {certificado?.tipo === 'emitido' &&
                certificado.certificado.situacao === 'pronto' && (
                  <Button className={BOTAO_PRINCIPAL} asChild>
                    <a href={`/api/certificados/${certificado.certificado.id}`}>
                      <Download />
                      Baixar certificado
                    </a>
                  </Button>
                )}
            </>
          ) : proximaAulaId ? (
            <Button className={BOTAO_PRINCIPAL} asChild>
              <Link
                to="/aulas/$aulaId"
                params={{ aulaId: proximaAulaId }}
                search={busca}
                onClick={aoFechar}
              >
                Próxima aula
              </Link>
            </Button>
          ) : (
            <Button className={BOTAO_PRINCIPAL} asChild>
              <Link
                to="/cursos/$cursoId"
                params={{ cursoId }}
                search={busca}
                onClick={aoFechar}
              >
                Voltar ao curso
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
