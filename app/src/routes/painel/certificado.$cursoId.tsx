import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  EditorDeModelo,
  type EstadoDoModelo,
} from '#/components/certificados/editor-de-modelo'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { SecaoDoPainel } from '#/components/painel/secao-do-painel'
import { useAcao } from '#/components/painel/use-acao'
import { Card, CardContent } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { modeloDeCertificadoFn, salvarModeloFn } from '#/lib/certificados-fns'
import { toast } from '#/lib/toast'

// Certificado do curso: exigências (todas as aulas, quizzes obrigatórios, pontos mínimos) e o
// modelo desenhado sobre a imagem. Salvar com o modelo ativo emite para quem já cumpre.
export const Route = createFileRoute('/painel/certificado/$cursoId')({
  loader: ({ params }) =>
    modeloDeCertificadoFn({ data: { cursoId: params.cursoId } }),
  head: () => ({ meta: [{ title: 'Certificado · Estúdio' }] }),
  component: Certificado,
})

function Certificado() {
  const modelo = Route.useLoaderData()
  const { executar, ocupado, erros } = useAcao()
  const inicial: EstadoDoModelo = {
    ativo: modelo.ativo,
    frente: modelo.frente,
    verso: modelo.verso,
    campos: modelo.campos,
    todasAsAulas: modelo.todasAsAulas,
    pontosMinimos: modelo.pontosMinimos,
  }
  const [estado, setEstado] = useState<EstadoDoModelo>(inicial)
  const alterado = JSON.stringify(estado) !== JSON.stringify(inicial)

  async function salvar() {
    const r = await executar(
      () => salvarModeloFn({ data: { cursoId: modelo.cursoId, ...estado } }),
      undefined,
      {
        validar: () => ({
          pontos:
            estado.pontosMinimos > 1_000_000
              ? 'Use até 1.000.000 pontos.'
              : undefined,
        }),
      },
    )
    if (!r) return
    const partes = ['Certificado salvo.']
    if (r.emitidos > 0) {
      partes.push(
        `${r.emitidos} ${r.emitidos === 1 ? 'certificado emitido' : 'certificados emitidos'} para quem já cumpria as exigências.`,
      )
    }
    if (r.aguardandoNome > 0) {
      partes.push(
        `${r.aguardandoNome} ${r.aguardandoNome === 1 ? 'aluno aguarda' : 'alunos aguardam'} a confirmação do nome.`,
      )
    }
    toast.success(partes.join(' '))
  }

  return (
    <PaginaDoPainel largura="larga">
      <CabecalhoDaPagina
        titulo="Certificado"
        contexto="As exigências para o aluno receber o certificado e o modelo que é desenhado sobre a imagem."
        voltar={{
          rotulo: modelo.cursoNome,
          to: '/painel/conteudo/$cursoId',
          params: { cursoId: modelo.cursoId },
        }}
      />

      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
      >
        <SecaoDoPainel titulo="Exigências">
          <div className="flex items-center gap-2">
            <Checkbox
              id="todas-as-aulas"
              checked={estado.todasAsAulas}
              onCheckedChange={(v) =>
                setEstado({ ...estado, todasAsAulas: v === true })
              }
              className="toque:size-6"
            />
            <Label htmlFor="todas-as-aulas" className="font-normal">
              Concluir todas as aulas do curso
            </Label>
          </div>
          <CampoDoPainel
            rotulo="Mínimo de pontos no curso"
            ajuda="0 = sem mínimo."
            erro={erros.pontos}
            className="max-w-xs"
          >
            <Input
              id="pontos-minimos"
              type="number"
              inputMode="numeric"
              min={0}
              max={1_000_000}
              step={1}
              value={estado.pontosMinimos}
              onChange={(e) =>
                setEstado({
                  ...estado,
                  pontosMinimos: Math.max(
                    0,
                    Math.floor(Number(e.target.value) || 0),
                  ),
                })
              }
            />
          </CampoDoPainel>
          <div className="text-sm text-muted-foreground">
            {modelo.quizzesObrigatorios.length === 0 ? (
              <p>
                Nenhum exercício é obrigatório para o certificado. Marque a
                opção no editor do exercício de cada aula.
              </p>
            ) : (
              <>
                <p>Exercícios obrigatórios para o certificado:</p>
                <ul className="list-disc pl-5">
                  {modelo.quizzesObrigatorios.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </SecaoDoPainel>

        <EditorDeModelo
          cursoNome={modelo.cursoNome}
          estado={estado}
          onChange={setEstado}
        />

        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="modelo-ativo"
                checked={estado.ativo}
                disabled={!estado.frente}
                onCheckedChange={(v) =>
                  setEstado({ ...estado, ativo: v === true })
                }
                className="toque:size-6"
              />
              <Label htmlFor="modelo-ativo" className="font-normal">
                Modelo ativo: emite certificado a quem cumprir as exigências
              </Label>
            </div>
            <AcoesDoFormulario
              salvar="Salvar certificado"
              ocupado={ocupado}
              alterado={alterado}
              erros={erros}
              onCancelar={alterado ? () => setEstado(inicial) : undefined}
              cancelar="Descartar alterações"
            />
          </CardContent>
        </Card>
      </form>
    </PaginaDoPainel>
  )
}
