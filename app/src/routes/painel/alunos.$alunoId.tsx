import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from '@tanstack/react-router'
import { useState } from 'react'
import { useConfirmar } from '#/components/confirmar'
import { BotaoExcluir } from '#/components/painel/botao-excluir'
import { TabelaDeEntregas } from '#/components/painel/entrega'
import { EtiquetaDeEstado } from '#/components/painel/etiqueta-de-estado'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { SecaoDoPainel } from '#/components/painel/secao-do-painel'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { SelectNativo } from '#/components/ui/select-nativo'
import {
  certificadosDoAlunoNoPainelFn,
  corrigirNomeDoCertificadoFn,
  regenerarPdfFn,
  revogarCertificadoFn,
} from '#/lib/certificados-fns'
import {
  FUSO_DA_ESCOLA,
  formatarDataHoraNoFuso,
  formatarDataNoFuso,
} from '#/lib/datas'
import { historicoDeEmailsFn, reenviarAcessoFn } from '#/lib/email-fns'
import { entrarComoFn } from '#/lib/entrar-como-fns'
import { entregasDoAlunoFn } from '#/lib/entregas-fns'
import { excluirAlunoFn } from '#/lib/equipe-fns'
import {
  encerrarFn,
  perfilDoAlunoFn,
  prorrogarFn,
  reativarFn,
  trocarEmailFn,
} from '#/lib/matricula-fns'
import { darPontosFn, pontosDoAlunoNoPainelFn } from '#/lib/pontos-fns'
import { toast } from '#/lib/toast'
import type { EmailDoHistorico } from '#/regras/envio-de-email'
import {
  ESTADO_DA_MATRICULA,
  ESTADO_DO_CERTIFICADO,
  ESTADO_DO_ENVIO,
} from '#/regras/estados-do-aluno'
import type { PerfilDoAluno as DadosDoAluno } from '#/regras/matricula'
import { podeFazer, tratarPerfil } from '#/regras/permissoes'

export const Route = createFileRoute('/painel/alunos/$alunoId')({
  loader: async ({ params }) => {
    // As leituras não dependem uma da outra: saem juntas (uma rodada ao servidor, não cinco em fila).
    const data = { alunoId: params.alunoId }
    const [perfil, emails, pontos, certificados, entregas] = await Promise.all([
      perfilDoAlunoFn({ data: { id: params.alunoId } }),
      historicoDeEmailsFn({ data }),
      pontosDoAlunoNoPainelFn({ data }),
      certificadosDoAlunoNoPainelFn({ data }),
      entregasDoAlunoFn({ data }),
    ])
    if (!perfil) throw notFound()
    return { ...perfil, emails, pontos, certificados, entregas }
  },
  head: () => ({ meta: [{ title: 'Aluno · Estúdio' }] }),
  component: PerfilDoAluno,
})

const dia = (d: Date | null) => formatarDataNoFuso(d, FUSO_DA_ESCOLA)
const EMAIL_PARECE_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function PerfilDoAluno() {
  const { aluno, matriculas, emails, pontos, certificados, entregas } =
    Route.useLoaderData()
  const { session } = Route.useRouteContext()
  const perfilDeQuemOlha = tratarPerfil(session.user.perfil)
  const podeExcluir = podeFazer(perfilDeQuemOlha, 'excluir-aluno')
  const podeRevogar = podeFazer(perfilDeQuemOlha, 'revogar-certificado')
  const podeEntrarComo = podeFazer(perfilDeQuemOlha, 'entrar-como')

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo={aluno.nome || 'Sem nome'}
        contexto={aluno.email}
        voltar={{ rotulo: 'Alunos', to: '/painel/alunos' }}
        acao={
          podeEntrarComo && aluno.perfil === 'aluno' ? (
            <EntrarComoEstaAluna id={aluno.id} nome={aluno.nome} />
          ) : undefined
        }
      />

      {matriculas.length === 0 ? (
        <SecaoDoPainel titulo="Matrículas">
          <p className="text-sm text-muted-foreground">
            Este aluno não tem matrículas.
          </p>
        </SecaoDoPainel>
      ) : (
        matriculas.map((m) => <MatriculaDoAluno key={m.id} m={m} />)
      )}

      <PontosDoAluno alunoId={aluno.id} {...pontos} />

      <CertificadosDoAluno
        certificados={certificados}
        podeRevogar={podeRevogar}
      />

      <SecaoDoPainel
        titulo={`Exercícios (${entregas.total})`}
        acao={
          entregas.total > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/painel/entregas" search={{ aluno: aluno.email }}>
                Ver na página Entregas
              </Link>
            </Button>
          ) : undefined
        }
      >
        <TabelaDeEntregas
          rotulo="Exercícios da aluna"
          linhas={entregas.itens}
          mostrarAluna={false}
          vazio={
            <p className="text-sm text-muted-foreground">
              Esta aluna ainda não enviou nenhum exercício.
            </p>
          }
        />
      </SecaoDoPainel>

      <EmailsDoAluno alunoId={aluno.id} emails={emails} />

      <TrocarEmail alunoId={aluno.id} emailAtual={aluno.email} />

      {podeExcluir && <ExcluirAluno aluno={aluno} />}
    </PaginaDoPainel>
  )
}

// Equipe e Proprietário veem a escola como esta aluna (sessão de 4 horas; tudo fica gravado na conta dela).
function EntrarComoEstaAluna({ id, nome }: { id: string; nome: string }) {
  const confirmar = useConfirmar()
  const [ocupado, setOcupado] = useState(false)
  const nomeNaTela = nome || 'esta aluna'
  return (
    <Button
      variant="outline"
      className="toque:min-h-11"
      disabled={ocupado}
      onClick={async () => {
        const sim = await confirmar({
          titulo: 'Entrar como esta aluna?',
          descricao: `Você vai ver a escola como ${nomeNaTela}. Tudo o que fizer fica gravado na conta dela.`,
          acao: 'Entrar como',
        })
        if (!sim) return
        setOcupado(true)
        try {
          await entrarComoFn({ data: { alunoId: id } })
          // Carga completa: a sessão mudou, nenhum dado em memória vale mais.
          window.location.assign('/')
        } catch (e) {
          setOcupado(false)
          toast.error(
            e instanceof Error && e.message
              ? e.message
              : 'Não foi possível entrar como esta aluna.',
          )
        }
      }}
    >
      Entrar como esta aluna
    </Button>
  )
}

// Troca o e-mail: encerra as sessões do aluno, então confirma mostrando o antigo e o novo.
function TrocarEmail({
  alunoId,
  emailAtual,
}: {
  alunoId: string
  emailAtual: string
}) {
  const confirmar = useConfirmar()
  const { executar, ocupado, erros } = useAcao()
  const [novoEmail, setNovoEmail] = useState(emailAtual)
  const novo = novoEmail.trim()
  return (
    <SecaoDoPainel titulo="Trocar o e-mail">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void executar(
            async () => {
              const sim = await confirmar({
                titulo: 'Trocar o e-mail do aluno?',
                descricao: `De ${emailAtual} para ${novo}. Todas as sessões abertas do aluno serão encerradas, e ele entra de novo com o e-mail novo.`,
                acao: 'Trocar e-mail',
              })
              if (!sim) return false
              await trocarEmailFn({ data: { alunoId, novoEmail } })
              toast.success(
                'E-mail trocado. O aluno entra de novo com o e-mail novo.',
              )
              return true
            },
            undefined,
            {
              validar: () => ({
                novoEmail: !EMAIL_PARECE_VALIDO.test(novo)
                  ? 'Informe um e-mail válido.'
                  : novo.toLowerCase() === emailAtual.toLowerCase()
                    ? 'Esse já é o e-mail do aluno.'
                    : undefined,
              }),
            },
          )
        }}
      >
        <CampoDoPainel
          rotulo="Novo e-mail do aluno"
          ajuda="As sessões abertas do aluno são encerradas e a troca entra no registro de ações."
          erro={erros.novoEmail}
        >
          <Input
            id="novo-email"
            type="email"
            autoComplete="off"
            spellCheck={false}
            value={novoEmail}
            onChange={(e) => setNovoEmail(e.target.value)}
          />
        </CampoDoPainel>
        <AcoesDoFormulario
          salvar="Trocar e-mail"
          ocupado={ocupado}
          alterado={novo !== emailAtual}
          erros={erros}
          onCancelar={
            novo !== emailAtual ? () => setNovoEmail(emailAtual) : undefined
          }
        />
      </form>
    </SecaoDoPainel>
  )
}

// Só o Proprietário vê. Pedido de exclusão de dados: some a conta e tudo o que é do aluno.
function ExcluirAluno({ aluno }: { aluno: { id: string; email: string } }) {
  const { executar, ocupado } = useAcao()
  const navigate = useNavigate()
  return (
    <SecaoDoPainel
      titulo="Excluir aluno de vez"
      tituloClassName="text-destructive"
    >
      <p className="text-sm text-muted-foreground">
        Apaga a conta, as matrículas, o progresso e o histórico de e-mails deste
        aluno. Não tem volta. A exclusão entra no registro de ações.
      </p>
      <div>
        <BotaoExcluir
          rotulo="Excluir aluno"
          titulo="Excluir este aluno de vez?"
          descricao="Apaga a conta, as matrículas, o progresso e o histórico de e-mails. Não tem volta."
          exigirTexto={aluno.email}
          disabled={ocupado}
          onConfirmado={async () => {
            const feito = await executar(
              () => excluirAlunoFn({ data: { alunoId: aluno.id } }),
              'Aluno excluído.',
            )
            if (feito !== undefined) navigate({ to: '/painel/alunos' })
          }}
        />
      </div>
    </SecaoDoPainel>
  )
}

function MatriculaDoAluno({ m }: { m: DadosDoAluno['matriculas'][number] }) {
  const confirmar = useConfirmar()
  const { executar, ocupado } = useAcao()
  const [data, setData] = useState('')
  const rotulo = `${m.cursoNome} · ${m.turmaNome}`

  return (
    <SecaoDoPainel
      titulo={`Matrícula em ${rotulo}`}
      acao={<EtiquetaDeEstado {...ESTADO_DA_MATRICULA[m.situacao]} />}
    >
      <p className="text-sm text-muted-foreground">
        Desde {dia(m.iniciaEm)} ·{' '}
        {m.expiraEm ? `expira em ${dia(m.expiraEm)}` : 'vitalícia'}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {m.origens.map((o) => (
          <li key={`${o.criadoEm}-${o.tipo}-${o.vendaId ?? ''}`}>
            {o.tipo === 'manual'
              ? `Matrícula manual por ${o.autorNome || 'equipe'}`
              : 'Venda paga'}{' '}
            em {dia(o.criadoEm)}
            {o.observacao ? ` (${o.observacao})` : ''}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <CampoDoPainel
            rotulo={m.situacao === 'ativa' ? 'Nova expiração' : 'Expira em'}
          >
            <Input
              id={`data-${m.id}`}
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </CampoDoPainel>
          {m.situacao !== 'inativa' && (
            <Button
              variant="outline"
              className="toque:min-h-11"
              disabled={ocupado}
              onClick={() =>
                executar(
                  () => prorrogarFn({ data: { matriculaId: m.id, ate: data } }),
                  'Matrícula prorrogada.',
                )
              }
            >
              Prorrogar
            </Button>
          )}
          {m.situacao !== 'ativa' && (
            <Button
              variant="outline"
              className="toque:min-h-11"
              disabled={ocupado}
              onClick={() =>
                executar(
                  () =>
                    reativarFn({
                      data: { matriculaId: m.id, expiracao: data },
                    }),
                  'Matrícula reativada.',
                )
              }
            >
              Reativar
            </Button>
          )}
          {m.situacao !== 'inativa' && (
            <Button
              variant="outline"
              className="toque:min-h-11"
              disabled={ocupado}
              onClick={async () => {
                if (
                  await confirmar({
                    titulo: `Encerrar a matrícula em ${rotulo}?`,
                    acao: 'Encerrar',
                    perigo: true,
                  })
                ) {
                  executar(
                    () => encerrarFn({ data: { matriculaId: m.id } }),
                    'Matrícula encerrada.',
                  )
                }
              }}
            >
              Encerrar
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Data vazia: vitalícia ou prazo da turma.
        </p>
      </div>
    </SecaoDoPainel>
  )
}

// "Não recebi": os últimos e-mails e se voltaram, e o reenvio do link de acesso.
function EmailsDoAluno({
  alunoId,
  emails,
}: {
  alunoId: string
  emails: EmailDoHistorico[]
}) {
  const { executar, ocupado } = useAcao()
  return (
    <SecaoDoPainel
      titulo="E-mails enviados"
      acao={
        <Button
          variant="outline"
          className="toque:min-h-11"
          disabled={ocupado}
          onClick={() =>
            executar(
              () => reenviarAcessoFn({ data: { alunoId } }),
              'Link de acesso na fila. Ele chega em instantes.',
            )
          }
        >
          Reenviar link de acesso
        </Button>
      }
    >
      {emails.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum e-mail enviado a este aluno ainda.
        </p>
      ) : (
        <ul className="flex flex-col divide-y text-sm">
          {emails.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.nome}</span>
                <EtiquetaDeEstado {...ESTADO_DO_ENVIO[e.status]} />
                <span className="text-muted-foreground [overflow-wrap:anywhere]">
                  {formatarDataHoraNoFuso(e.criadoEm, FUSO_DA_ESCOLA)} ·{' '}
                  {e.para}
                </span>
              </div>
              {e.status === 'retornou' && e.retorno ? (
                <p className="text-destructive">Voltou: {e.retorno}</p>
              ) : null}
              {e.status === 'falhou' && e.erro ? (
                <p className="text-destructive">{e.erro}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SecaoDoPainel>
  )
}

// Pontos do aluno: o saldo, os últimos lançamentos e o formulário de pontos avulsos (dar ou tirar,
// com motivo, de um curso ou gerais). O aluno é avisado no sininho e a ação entra no registro.
function PontosDoAluno({
  alunoId,
  extrato,
  cursos,
}: {
  alunoId: string
  extrato: Awaited<ReturnType<typeof pontosDoAlunoNoPainelFn>>['extrato']
  cursos: { id: string; nome: string }[]
}) {
  const { executar, ocupado, erros } = useAcao()
  const [sentido, setSentido] = useState<'dar' | 'tirar'>('dar')
  const [quantidade, setQuantidade] = useState('')
  const [cursoId, setCursoId] = useState('')
  const [motivo, setMotivo] = useState('')
  const pontos = Number(quantidade)

  return (
    <SecaoDoPainel
      titulo={
        <>
          Pontos:{' '}
          <span className="tabular-nums">
            {extrato.total.toLocaleString('pt-BR')}
          </span>
        </>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const feito = await executar(
            () =>
              darPontosFn({
                data: {
                  alunoId,
                  cursoId: cursoId || null,
                  pontos: sentido === 'dar' ? pontos : -pontos,
                  motivo,
                },
              }),
            sentido === 'dar' ? 'Pontos dados.' : 'Pontos retirados.',
            {
              validar: () => ({
                quantidade:
                  Number.isInteger(pontos) && pontos > 0
                    ? undefined
                    : 'Informe um número inteiro maior que zero.',
                motivo: motivo.trim() ? undefined : 'Diga o motivo.',
              }),
            },
          )
          if (feito) {
            setQuantidade('')
            setMotivo('')
          }
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <CampoDoPainel rotulo="Ação" className="w-full sm:w-40">
            <SelectNativo
              id="sentido-pontos"
              value={sentido}
              onChange={(e) => setSentido(e.target.value as 'dar' | 'tirar')}
            >
              <option value="dar">Dar pontos</option>
              <option value="tirar">Tirar pontos</option>
            </SelectNativo>
          </CampoDoPainel>
          <CampoDoPainel
            rotulo="Pontos"
            erro={erros.quantidade}
            className="w-full sm:w-32"
          >
            <Input
              id="quantidade-pontos"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </CampoDoPainel>
          <CampoDoPainel rotulo="Vale para" className="w-full sm:w-64">
            <SelectNativo
              id="curso-pontos"
              value={cursoId}
              onChange={(e) => setCursoId(e.target.value)}
            >
              <option value="">Geral (sem curso)</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </SelectNativo>
          </CampoDoPainel>
          <CampoDoPainel
            rotulo="Motivo (o aluno vê)"
            erro={erros.motivo}
            className="w-full min-w-48 flex-1"
          >
            <Input
              id="motivo-pontos"
              value={motivo}
              maxLength={300}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </CampoDoPainel>
        </div>
        <AcoesDoFormulario
          salvar="Lançar"
          ocupado={ocupado}
          alterado={quantidade !== '' || motivo !== ''}
          erros={erros}
        />
      </form>
      {extrato.linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Este aluno ainda não tem pontos.
        </p>
      ) : (
        <ul className="flex flex-col divide-y text-sm">
          {extrato.linhas.slice(0, 20).map((l) => (
            <li key={l.id} className="flex justify-between gap-3 py-2">
              <span>
                {l.descricao}
                <span className="text-muted-foreground">
                  {' '}
                  · {l.cursoNome ?? 'Geral'} · {dia(l.criadoEm)}
                </span>
              </span>
              <span className="font-medium tabular-nums">
                {l.pontos > 0 ? '+' : ''}
                {l.pontos}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SecaoDoPainel>
  )
}

type CertificadoDaLista = Awaited<
  ReturnType<typeof certificadosDoAlunoNoPainelFn>
>[number]

// Certificados do aluno: a Equipe corrige o nome (e o certificado é reemitido com o mesmo código) e
// regenera o PDF; só o Proprietário revoga, com motivo e confirmação.
function CertificadosDoAluno({
  certificados,
  podeRevogar,
}: {
  certificados: CertificadoDaLista[]
  podeRevogar: boolean
}) {
  return (
    <SecaoDoPainel titulo="Certificados">
      {certificados.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Este aluno ainda não tem certificados.
        </p>
      )}
      {certificados.map((c) => (
        <CertificadoDoAluno key={c.id} c={c} podeRevogar={podeRevogar} />
      ))}
    </SecaoDoPainel>
  )
}

function CertificadoDoAluno({
  c,
  podeRevogar,
}: {
  c: CertificadoDaLista
  podeRevogar: boolean
}) {
  const confirmar = useConfirmar()
  const { executar, ocupado, erros } = useAcao()
  const [nomeDigitado, setNomeDigitado] = useState<string>()
  const [motivo, setMotivo] = useState('')
  const nome = nomeDigitado ?? c.nome
  const estado =
    c.situacao === 'revogado'
      ? ESTADO_DO_CERTIFICADO.revogado
      : ESTADO_DO_CERTIFICADO[c.situacao]

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{c.cursoNome}</p>
        <EtiquetaDeEstado tom="neutro">{c.codigo}</EtiquetaDeEstado>
        <EtiquetaDeEstado {...estado} />
        <span className="text-sm text-muted-foreground">
          Concluído em {dia(c.concluidoEm)}
        </span>
      </div>
      {c.situacao === 'revogado' ? (
        <p className="text-sm text-muted-foreground">
          Revogado em {dia(c.revogadoEm)}: {c.revogadoMotivo}
        </p>
      ) : (
        <>
          <form
            noValidate
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              executar(
                () =>
                  corrigirNomeDoCertificadoFn({
                    data: { certificadoId: c.id, nome },
                  }),
                'Nome corrigido. Estamos gerando o PDF de novo.',
                {
                  validar: () => ({
                    nome: nome.trim() ? undefined : 'Informe o nome.',
                  }),
                },
              )
            }}
          >
            <CampoDoPainel
              rotulo="Nome no certificado"
              erro={erros.nome}
              className="min-w-60 flex-1"
            >
              <Input
                id={`nome-${c.id}`}
                value={nome}
                onChange={(e) => setNomeDigitado(e.target.value)}
              />
            </CampoDoPainel>
            <Button
              type="submit"
              variant="outline"
              className="toque:min-h-11"
              disabled={ocupado || nome.trim() === c.nome}
            >
              Corrigir e reemitir
            </Button>
            <Button
              type="button"
              variant="outline"
              className="toque:min-h-11"
              disabled={ocupado}
              onClick={() =>
                executar(
                  () => regenerarPdfFn({ data: { certificadoId: c.id } }),
                  'Gerando o PDF de novo.',
                )
              }
            >
              Regenerar PDF
            </Button>
          </form>
          {podeRevogar && (
            <form
              noValidate
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void executar(
                  async () => {
                    const sim = await confirmar({
                      titulo: 'Revogar este certificado?',
                      descricao: `O certificado ${c.codigo} de ${c.cursoNome} deixa de valer na página pública de validação. O motivo fica registrado.`,
                      acao: 'Revogar',
                      perigo: true,
                    })
                    if (!sim) return false
                    await revogarCertificadoFn({
                      data: { certificadoId: c.id, motivo },
                    })
                    toast.success('Certificado revogado.')
                    return true
                  },
                  undefined,
                  {
                    validar: () => ({
                      motivo:
                        motivo.trim().length >= 3
                          ? undefined
                          : 'Explique o motivo em ao menos 3 letras.',
                    }),
                  },
                )
              }}
            >
              <CampoDoPainel
                rotulo="Motivo da revogação"
                erro={erros.motivo}
                className="min-w-60 flex-1"
              >
                <Input
                  id={`motivo-${c.id}`}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </CampoDoPainel>
              <Button
                type="submit"
                variant="destructive"
                className="toque:min-h-11"
                disabled={ocupado}
              >
                Revogar
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  )
}
