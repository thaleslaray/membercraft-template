import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { SecaoDoPainel } from '#/components/painel/secao-do-painel'
import { useAcao } from '#/components/painel/use-acao'
import { Input } from '#/components/ui/input'
import { SelectNativo } from '#/components/ui/select-nativo'
import { Textarea } from '#/components/ui/textarea'
import { matricularManualFn, turmasParaMatriculaFn } from '#/lib/matricula-fns'
import { toast } from '#/lib/toast'
import type { ResumoDaMatriculaManual } from '#/regras/matricula'
import type { ErrosDoFormulario, TomDeEstado } from '#/regras/painel'

export const Route = createFileRoute('/painel/matricular')({
  loader: () => turmasParaMatriculaFn(),
  head: () => ({ meta: [{ title: 'Matricular · Estúdio' }] }),
  component: Matricular,
})

const GRUPOS: {
  chave: keyof ResumoDaMatriculaManual
  rotulo: string
  tom: TomDeEstado
}[] = [
  { chave: 'criados', rotulo: 'Matriculados', tom: 'ok' },
  { chave: 'contasNovas', rotulo: 'Contas criadas', tom: 'ok' },
  { chave: 'jaMatriculados', rotulo: 'Já matriculados', tom: 'neutro' },
  { chave: 'reativados', rotulo: 'Reativados', tom: 'ok' },
  { chave: 'invalidos', rotulo: 'E-mails inválidos', tom: 'atencao' },
]

function Matricular() {
  const turmas = Route.useLoaderData()
  const { executar, ocupado, erros } = useAcao()
  const [turmaId, setTurmaId] = useState('')
  const [lote, setLote] = useState('')
  const [expiracao, setExpiracao] = useState('')
  const [observacao, setObservacao] = useState('')
  const [resumo, setResumo] = useState<ResumoDaMatriculaManual | null>(null)
  const [erroDoLote, setErroDoLote] = useState<string>()
  const errosDoCampo: ErrosDoFormulario = {
    ...erros,
    ...(erroDoLote ? { lote: erroDoLote } : {}),
  }

  async function enviar() {
    setErroDoLote(undefined)
    const feito = await executar(
      () =>
        matricularManualFn({
          data: { turmaId, lote, expiracao, observacao },
        }),
      undefined,
      {
        validar: () => ({
          turma: turmaId ? undefined : 'Escolha a turma.',
          lote: lote.trim() ? undefined : 'Cole ao menos um e-mail.',
        }),
      },
    )
    if (!feito) return
    setResumo(feito)
    if (feito.invalidos.length > 0) {
      // Não limpa o campo: a pessoa corrige os endereços e envia de novo.
      setErroDoLote(
        `${feito.invalidos.length === 1 ? '1 linha não é um e-mail válido' : `${feito.invalidos.length} linhas não são e-mails válidos`}: ${feito.invalidos.join(', ')}. Corrija e envie de novo.`,
      )
      return
    }
    toast.success('Matrícula manual concluída.')
    setLote('')
  }

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Matricular"
        contexto="Cole os e-mails, um por linha (com o nome depois de uma vírgula, se quiser). A conta é criada só com o e-mail; o aluno informa o nome no primeiro acesso."
      />

      <SecaoDoPainel titulo="Matricular em lote">
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void enviar()
          }}
        >
          <CampoDoPainel rotulo="Turma" erro={errosDoCampo.turma}>
            <SelectNativo
              id="turma-da-matricula"
              value={turmaId}
              onChange={(e) => setTurmaId(e.target.value)}
            >
              <option value="">Escolha a turma</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.cursoNome} · {t.nome}
                </option>
              ))}
            </SelectNativo>
          </CampoDoPainel>
          <CampoDoPainel rotulo="E-mails dos alunos" erro={errosDoCampo.lote}>
            <Textarea
              id="lote-de-emails"
              rows={8}
              autoComplete="off"
              spellCheck={false}
              placeholder={'ana@exemplo.com, Ana Souza\nbia@exemplo.com'}
              value={lote}
              onChange={(e) => setLote(e.target.value)}
            />
          </CampoDoPainel>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoDoPainel
              rotulo="Expira em (opcional)"
              ajuda="Vazio: vale o prazo da turma, ou acesso vitalício."
            >
              <Input
                id="expiracao-da-matricula"
                type="date"
                value={expiracao}
                onChange={(e) => setExpiracao(e.target.value)}
              />
            </CampoDoPainel>
            <CampoDoPainel rotulo="Observação (opcional)">
              <Input
                id="observacao-da-matricula"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </CampoDoPainel>
          </div>
          <AcoesDoFormulario
            salvar="Matricular"
            ocupado={ocupado}
            alterado={lote.trim() !== ''}
            erros={errosDoCampo}
          />
        </form>
      </SecaoDoPainel>

      {resumo && (
        <SecaoDoPainel titulo="Resumo da matrícula manual">
          {resumo.invalidos.length > 0 && (
            <p
              role="status"
              className="flex flex-wrap items-center gap-2 text-sm font-medium"
            >
              <EtiquetaDeEstado tom="atencao">Atenção</EtiquetaDeEstado>
              Alguns e-mails ficaram de fora. Os outros foram processados.
            </p>
          )}
          {GRUPOS.map(({ chave, rotulo, tom }) => (
            <div key={chave} className="flex flex-col gap-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <EtiquetaDeEstado
                  tom={resumo[chave].length > 0 ? tom : 'neutro'}
                >
                  {rotulo}: {resumo[chave].length}
                </EtiquetaDeEstado>
              </p>
              {resumo[chave].length > 0 && (
                <p className="text-sm break-all text-muted-foreground">
                  {resumo[chave].join(', ')}
                </p>
              )}
            </div>
          ))}
        </SecaoDoPainel>
      )}
    </PaginaDoPainel>
  )
}
