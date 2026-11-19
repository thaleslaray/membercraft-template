import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { VazioDoPainel } from '#/components/painel/estados'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { useAcao } from '#/components/painel/use-acao'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { SelectNativo } from '#/components/ui/select-nativo'
import {
  FUSO_DA_ESCOLA,
  formatarDataNoFuso,
  inicioDoDiaEmBrasilia,
} from '#/lib/datas'
import { removerRegraFn, salvarRegraFn } from '#/lib/liberacao-fns'
import { LIMITE_DA_REGRA, validarRegra } from '#/regras/formulario-da-regra'
import {
  type ModuloComRegra,
  type OpcoesDeAlvo,
  type RegraDoPainel,
  ROTULO_DA_REGRA,
  TIPOS_DE_REGRA,
  type TipoDeRegra,
} from '#/regras/regras-de-liberacao'

// As regras de liberação de UMA edição do curso: um módulo por linha, com "Ver como aluno".
export function RegrasDeLiberacao({
  turma,
  modulos,
  alvos,
}: {
  turma: { id: string; cursoId: string; nome: string }
  modulos: ModuloComRegra[]
  alvos: OpcoesDeAlvo
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link
            to="/cursos/$cursoId"
            params={{ cursoId: turma.cursoId }}
            search={{ como: turma.id }}
          >
            Ver como aluno
          </Link>
        </Button>
      </div>
      {modulos.length === 0 && (
        <VazioDoPainel
          mensagem="Este curso ainda não tem módulos. Crie os módulos na aba Conteúdo para definir quando cada um abre."
          acao={
            <Button asChild variant="outline" className="toque:min-h-11">
              <Link
                to="/painel/conteudo/$cursoId"
                params={{ cursoId: turma.cursoId }}
              >
                Ir para Conteúdo
              </Link>
            </Button>
          }
        />
      )}
      {modulos.length > 0 && (
        <ListaDeModulos turmaId={turma.id} modulos={modulos} alvos={alvos} />
      )}
    </div>
  )
}

type Modulo = ModuloComRegra

// Um módulo por linha, com a regra escrita por extenso. As aulas ficam recolhidas: aparecem só as
// que têm regra própria, e a lista inteira abre quando alguém quer mexer numa aula. Só um item fica
// em edição por vez, então há um Salvar na tela, não um por linha.
function ListaDeModulos({
  turmaId,
  modulos,
  alvos,
}: {
  turmaId: string
  modulos: Modulo[]
  alvos: OpcoesDeAlvo
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const nomes = nomesDosAlvos(alvos)
  const totalDeAulas = modulos.reduce((n, m) => n + m.aulas.length, 0)
  const proprias = modulos.reduce(
    (n, m) => n + m.aulas.filter((a) => a.regra).length,
    0,
  )

  function alternar(id: string) {
    setAbertos((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        {modulos.length} {modulos.length === 1 ? 'módulo' : 'módulos'} ·{' '}
        {totalDeAulas} aulas ·{' '}
        {proprias === 0
          ? 'nenhuma aula com regra própria'
          : `${proprias} ${proprias === 1 ? 'aula' : 'aulas'} com regra própria`}
      </p>
      <ol className="flex flex-col divide-y rounded-xl border">
        {modulos.map((m, i) => {
          const chave = `m:${m.id}`
          const aberto = abertos.has(m.id)
          const visiveis = aberto ? m.aulas : m.aulas.filter((a) => a.regra)
          return (
            <li key={m.id} className="flex flex-col">
              <Linha
                numero={`${i + 1}`}
                titulo={m.nome}
                resumo={resumoDaRegra(m.regra, 'Livre', nomes)}
                destaque={Boolean(m.regra && m.regra.tipo !== 'livre')}
                quebrada={m.regra?.quebrada ?? false}
                editando={editando === chave}
                onEditar={() => setEditando(chave)}
                rotuloDoBotao={`Mudar a regra do módulo ${m.nome}`}
              />
              {editando === chave && (
                <EditorDeRegra
                  rotulo={`Regra do módulo ${m.nome}`}
                  turmaId={turmaId}
                  escopo={{ moduloId: m.id }}
                  regra={m.regra}
                  alvos={alvos}
                  semRegra="Livre"
                  onFechar={() => setEditando(null)}
                />
              )}
              {visiveis.length > 0 && (
                <ul className="flex flex-col pb-2">
                  {visiveis.map((a) => {
                    const chaveDaAula = `a:${a.id}`
                    return (
                      <li key={a.id} className="flex flex-col">
                        <Linha
                          recuo
                          titulo={a.titulo}
                          resumo={resumoDaRegra(
                            a.regra,
                            'Segue o módulo',
                            nomes,
                          )}
                          destaque={Boolean(a.regra)}
                          quebrada={a.regra?.quebrada ?? false}
                          editando={editando === chaveDaAula}
                          onEditar={() => setEditando(chaveDaAula)}
                          rotuloDoBotao={`Mudar a regra da aula ${a.titulo}`}
                        />
                        {editando === chaveDaAula && (
                          <EditorDeRegra
                            recuo
                            rotulo={`Regra da aula ${a.titulo}`}
                            turmaId={turmaId}
                            escopo={{ aulaId: a.id }}
                            regra={a.regra}
                            alvos={alvos}
                            semRegra="Segue o módulo"
                            onFechar={() => setEditando(null)}
                          />
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              {m.aulas.length > 0 && (
                <button
                  type="button"
                  onClick={() => alternar(m.id)}
                  aria-expanded={aberto}
                  className="mb-3 ml-10 self-start rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {aberto
                    ? 'Recolher as aulas'
                    : `Regra para uma aula · ${m.aulas.length} ${m.aulas.length === 1 ? 'aula' : 'aulas'}`}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Linha({
  numero,
  titulo,
  resumo,
  destaque,
  quebrada,
  editando,
  onEditar,
  rotuloDoBotao,
  recuo = false,
}: {
  numero?: string
  titulo: string
  resumo: string
  destaque: boolean
  quebrada: boolean
  editando: boolean
  onEditar: () => void
  rotuloDoBotao: string
  recuo?: boolean
}) {
  return (
    <div
      className={`flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 pr-3 ${recuo ? 'min-h-10 pl-6 sm:pl-12' : 'py-2 pl-4'}`}
    >
      {numero && (
        <span className="w-4 text-right text-sm text-muted-foreground tabular-nums">
          {numero}
        </span>
      )}
      {/* O nome quebra linha (nada de corte); o `title` mostra o nome inteiro ao apontar. */}
      <span
        title={titulo}
        className={`min-w-0 flex-1 basis-40 break-words ${recuo ? 'text-sm' : 'font-medium'}`}
      >
        {titulo}
      </span>
      <span
        className={`text-sm max-sm:order-last max-sm:basis-full ${
          quebrada
            ? 'text-destructive'
            : destaque
              ? 'text-foreground'
              : 'text-muted-foreground'
        }`}
      >
        {quebrada ? 'Regra incompleta · bloqueado' : resumo}
      </span>
      {!editando && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={rotuloDoBotao}
          className="toque:min-h-11"
          onClick={onEditar}
        >
          Mudar
        </Button>
      )}
    </div>
  )
}

function nomesDosAlvos(alvos: OpcoesDeAlvo): Map<string, string> {
  const nomes = new Map<string, string>()
  for (const c of alvos.cursos) {
    nomes.set(c.id, c.nome)
    for (const m of c.modulos) {
      nomes.set(m.id, m.nome)
      for (const a of m.aulas) nomes.set(a.id, a.titulo)
    }
  }
  return nomes
}

// A data da regra (aaaa-mm-dd) é um dia em Brasília: formata no fuso da escola.
function dataCurta(iso: string): string {
  const inicio = inicioDoDiaEmBrasilia(iso)
  return inicio ? formatarDataNoFuso(inicio, FUSO_DA_ESCOLA) : iso
}

// A regra em uma frase, do jeito que a equipe fala.
function resumoDaRegra(
  regra: RegraDoPainel | null,
  semRegra: string,
  nomes: Map<string, string>,
): string {
  if (!regra) return semRegra
  const alvo = regra.alvoId ? (nomes.get(regra.alvoId) ?? 'item removido') : ''
  switch (regra.tipo) {
    case 'livre':
      return 'Livre'
    case 'data':
      return regra.fechaEm
        ? `Abre em ${dataCurta(regra.liberaEm)} · fecha em ${dataCurta(regra.fechaEm)}`
        : `Abre em ${dataCurta(regra.liberaEm)}`
    case 'dias_apos_compra':
      return `Abre ${regra.dias} ${regra.dias === 1 ? 'dia' : 'dias'} após a compra`
    case 'pontuacao_minima':
      return `Abre com ${regra.pontos} pontos no curso`
    case 'oculto':
      return 'Oculto'
    case 'bloqueado':
      return 'Bloqueado'
    case 'curso_concluido':
    case 'modulo_concluido':
    case 'aula_concluida':
      return `Abre depois de concluir ${alvo}`
  }
}

type Escopo = { moduloId: string } | { aulaId: string }

// Uma regra: o tipo e os campos dele. "Salvar" grava; "Sem regra" apaga (a aula volta a seguir o
// módulo; o módulo volta a ser livre).
function EditorDeRegra({
  rotulo,
  turmaId,
  escopo,
  regra,
  alvos,
  semRegra,
  onFechar,
  recuo = false,
}: {
  rotulo: string
  turmaId: string
  escopo: Escopo
  regra: RegraDoPainel | null
  alvos: OpcoesDeAlvo
  semRegra: string
  onFechar: () => void
  recuo?: boolean
}) {
  const { executar, ocupado, erros, limparErros } = useAcao()
  const [tipo, setTipo] = useState<TipoDeRegra | ''>(regra?.tipo ?? '')
  const [liberaEm, setLiberaEm] = useState(regra?.liberaEm ?? '')
  const [fechaEm, setFechaEm] = useState(regra?.fechaEm ?? '')
  const [dias, setDias] = useState(regra?.dias?.toString() ?? '')
  const [pontos, setPontos] = useState(regra?.pontos?.toString() ?? '')
  const [alvoId, setAlvoId] = useState(regra?.alvoId ?? '')

  async function salvar() {
    const ok = await executar(
      async () => {
        if (!tipo) {
          await removerRegraFn({ data: { turmaId, ...escopo } })
          return true
        }
        await salvarRegraFn({
          data: {
            turmaId,
            ...escopo,
            tipo,
            liberaEm: liberaEm || null,
            fechaEm: fechaEm || null,
            dias: dias ? Number(dias) : null,
            pontos: pontos ? Number(pontos) : null,
            alvoId: alvoId || null,
          },
        })
        return true
      },
      tipo ? 'Regra salva' : 'Regra removida',
      {
        validar: () =>
          validarRegra({ tipo, liberaEm, fechaEm, dias, pontos, alvoId }),
        campoDoErro: (m) =>
          /fechamento|fechamen/.test(m)
            ? 'fechaEm'
            : /data/.test(m)
              ? 'liberaEm'
              : /dias/.test(m)
                ? 'dias'
                : /pontua/.test(m)
                  ? 'pontos'
                  : tipo.endsWith('_concluida') || tipo.endsWith('_concluido')
                    ? 'alvoId'
                    : undefined,
      },
    )
    if (ok) onFechar()
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void salvar()
      }}
      className={`mx-3 mb-3 flex flex-col gap-4 rounded-lg bg-muted/50 p-4 ${recuo ? 'sm:ml-12' : ''}`}
    >
      <div className="flex flex-wrap items-start gap-4">
        <CampoDoPainel rotulo={rotulo} className="w-full sm:w-72">
          <SelectNativo
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as TipoDeRegra | '')
              limparErros()
            }}
          >
            <option value="">{semRegra}</option>
            {TIPOS_DE_REGRA.map((t) => (
              <option key={t} value={t}>
                {ROTULO_DA_REGRA[t]}
              </option>
            ))}
          </SelectNativo>
        </CampoDoPainel>

        {tipo === 'data' && (
          <>
            <CampoDoPainel rotulo="Libera em" erro={erros.liberaEm}>
              <Input
                type="date"
                value={liberaEm}
                onChange={(e) => setLiberaEm(e.target.value)}
              />
            </CampoDoPainel>
            <CampoDoPainel
              rotulo="Fecha depois de (opcional)"
              erro={erros.fechaEm}
            >
              <Input
                type="date"
                value={fechaEm}
                onChange={(e) => setFechaEm(e.target.value)}
              />
            </CampoDoPainel>
          </>
        )}
        {tipo === 'dias_apos_compra' && (
          <CampoDoPainel rotulo="Dias após a compra" erro={erros.dias}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={LIMITE_DA_REGRA}
              step={1}
              value={dias}
              onChange={(e) => setDias(e.target.value)}
            />
          </CampoDoPainel>
        )}
        {tipo === 'pontuacao_minima' && (
          <CampoDoPainel
            rotulo="Pontos mínimos neste curso"
            erro={erros.pontos}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={LIMITE_DA_REGRA}
              step={1}
              value={pontos}
              onChange={(e) => setPontos(e.target.value)}
            />
          </CampoDoPainel>
        )}
        {(tipo === 'curso_concluido' ||
          tipo === 'modulo_concluido' ||
          tipo === 'aula_concluida') && (
          <CampoDoPainel
            rotulo="O que precisa estar concluído"
            erro={erros.alvoId}
            className="w-full sm:max-w-sm"
          >
            <SelectNativo
              value={alvoId}
              onChange={(e) => setAlvoId(e.target.value)}
            >
              <option value="">Escolha</option>
              <OpcoesDoAlvo tipo={tipo} alvos={alvos} />
            </SelectNativo>
          </CampoDoPainel>
        )}
      </div>

      <AcoesDoFormulario
        salvar="Salvar regra"
        ocupado={ocupado}
        erros={erros}
        onCancelar={onFechar}
        className="pt-0"
      />
      {regra?.quebrada && (
        <p role="alert" className="w-full text-xs text-destructive">
          Regra incompleta: o conteúdo está bloqueado. Preencha os campos e
          salve de novo.
        </p>
      )}
    </form>
  )
}

function OpcoesDoAlvo({
  tipo,
  alvos,
}: {
  tipo: 'curso_concluido' | 'modulo_concluido' | 'aula_concluida'
  alvos: OpcoesDeAlvo
}) {
  if (tipo === 'curso_concluido') {
    return alvos.cursos.map((c) => (
      <option key={c.id} value={c.id}>
        {c.nome}
      </option>
    ))
  }
  return alvos.cursos.map((c) => (
    <optgroup key={c.id} label={c.nome}>
      {c.modulos.flatMap((m) =>
        tipo === 'modulo_concluido'
          ? [
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>,
            ]
          : m.aulas.map((a) => (
              <option key={a.id} value={a.id}>
                {m.nome} › {a.titulo}
              </option>
            )),
      )}
    </optgroup>
  ))
}
