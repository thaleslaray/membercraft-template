// Regras de liberação de uma turma (#42): para cada módulo, uma das 9 regras; para uma aula, uma
// regra própria que vale no lugar da do módulo. Este módulo grava e lista as regras; quem decide o
// que o aluno vê é `acesso.ts`. Sem regra gravada, o item é livre.

import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '#/db/schema'
import { aula, curso, modulo, regraDeLiberacao, turma } from '#/db/schema'
import {
  dataParaCampo,
  fimDoDiaEmBrasilia,
  inicioDoDiaEmBrasilia,
} from '#/lib/datas'
import { lerRegra } from '#/regras/acesso'
import { LIMITE_DA_REGRA } from '#/regras/formulario-da-regra'
import { type Banco, comoLibsql } from '#/regras/tipos'

export class ErroDeLiberacao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeLiberacao'
  }
}

export const TIPOS_DE_REGRA = [
  'livre',
  'data',
  'dias_apos_compra',
  'pontuacao_minima',
  'oculto',
  'bloqueado',
  'curso_concluido',
  'modulo_concluido',
  'aula_concluida',
] as const
export type TipoDeRegra = (typeof TIPOS_DE_REGRA)[number]

export const ROTULO_DA_REGRA: Record<TipoDeRegra, string> = {
  livre: 'Livre',
  data: 'Liberar em uma data',
  dias_apos_compra: 'Liberar dias após a compra',
  pontuacao_minima: 'Exigir pontuação mínima',
  oculto: 'Oculto',
  bloqueado: 'Bloqueado',
  curso_concluido: 'Exigir curso concluído',
  modulo_concluido: 'Exigir módulo concluído',
  aula_concluida: 'Exigir aula concluída',
}

export interface RegraGravada {
  id: string
  tipo: TipoDeRegra
  liberaEm: Date | null
  fechaEm: Date | null
  dias: number | null
  pontos: number | null
  alvoId: string | null
}

export type EscopoDaRegra = { moduloId: string } | { aulaId: string }

export type EntradaDeRegra = EscopoDaRegra & {
  turmaId: string
  tipo: TipoDeRegra
  /** aaaa-mm-dd, o dia em que libera (começo do dia em Brasília). */
  liberaEm?: string | null
  /** aaaa-mm-dd, o último dia aberto (fim do dia em Brasília); opcional. */
  fechaEm?: string | null
  dias?: number | null
  pontos?: number | null
  alvoId?: string | null
}

function inteiroPositivo(valor: number | null | undefined, rotulo: string) {
  if (
    !Number.isInteger(valor) ||
    (valor as number) < 1 ||
    (valor as number) > LIMITE_DA_REGRA
  ) {
    throw new ErroDeLiberacao(
      `Informe ${rotulo} (um número inteiro, de 1 em diante).`,
    )
  }
  return valor as number
}

async function turmaDaRegra(
  db: LibSQLDatabase<typeof schema>,
  turmaId: string,
) {
  const [achada] = await db.select().from(turma).where(eq(turma.id, turmaId))
  if (!achada) throw new ErroDeLiberacao('Turma não encontrada.')
  return achada
}

// Módulo ou aula do escopo, do curso da turma; devolve o id do módulo e o da aula (se for aula).
async function conferirEscopo(
  db: LibSQLDatabase<typeof schema>,
  cursoDaTurma: string,
  escopo: EscopoDaRegra,
): Promise<{ moduloId: string; aulaId: string | null }> {
  if ('aulaId' in escopo) {
    const [a] = await db
      .select({ moduloId: aula.moduloId, cursoId: modulo.cursoId })
      .from(aula)
      .innerJoin(modulo, eq(modulo.id, aula.moduloId))
      .where(
        and(
          eq(aula.id, escopo.aulaId),
          isNull(aula.excluidoEm),
          isNull(modulo.excluidoEm),
        ),
      )
    if (!a || a.cursoId !== cursoDaTurma) {
      throw new ErroDeLiberacao('Aula não encontrada neste curso.')
    }
    return { moduloId: a.moduloId, aulaId: escopo.aulaId }
  }
  const [m] = await db
    .select({ cursoId: modulo.cursoId })
    .from(modulo)
    .where(and(eq(modulo.id, escopo.moduloId), isNull(modulo.excluidoEm)))
  if (!m || m.cursoId !== cursoDaTurma) {
    throw new ErroDeLiberacao('Módulo não encontrado neste curso.')
  }
  return { moduloId: escopo.moduloId, aulaId: null }
}

// A condição "concluído" não pode apontar para o próprio item (ou para o que o contém): o aluno
// nunca conseguiria concluir o que precisa estar aberto para ser concluído.
async function conferirAlvo(
  db: LibSQLDatabase<typeof schema>,
  tipo: 'curso_concluido' | 'modulo_concluido' | 'aula_concluida',
  alvoId: string | null | undefined,
  cursoDaTurma: string,
  dentro: { moduloId: string; aulaId: string | null },
) {
  if (!alvoId)
    throw new ErroDeLiberacao('Escolha o que precisa estar concluído.')
  if (tipo === 'curso_concluido') {
    const [c] = await db
      .select({ id: curso.id })
      .from(curso)
      .where(and(eq(curso.id, alvoId), isNull(curso.excluidoEm)))
    if (!c) throw new ErroDeLiberacao('Curso não encontrado.')
    if (alvoId === cursoDaTurma) {
      throw new ErroDeLiberacao(
        'Um curso não pode exigir a si mesmo concluído.',
      )
    }
    return
  }
  if (tipo === 'modulo_concluido') {
    const [m] = await db
      .select({ id: modulo.id })
      .from(modulo)
      .where(and(eq(modulo.id, alvoId), isNull(modulo.excluidoEm)))
    if (!m) throw new ErroDeLiberacao('Módulo não encontrado.')
    if (alvoId === dentro.moduloId) {
      throw new ErroDeLiberacao(
        'O módulo não pode exigir a si mesmo concluído.',
      )
    }
    return
  }
  const [a] = await db
    .select({ id: aula.id, moduloId: aula.moduloId })
    .from(aula)
    .where(and(eq(aula.id, alvoId), isNull(aula.excluidoEm)))
  if (!a) throw new ErroDeLiberacao('Aula não encontrada.')
  if (
    alvoId === dentro.aulaId ||
    (!dentro.aulaId && a.moduloId === dentro.moduloId)
  ) {
    throw new ErroDeLiberacao(
      'A aula exigida não pode estar dentro do que ela libera.',
    )
  }
}

export async function definirRegra(
  banco: Banco,
  entrada: EntradaDeRegra,
): Promise<void> {
  const db = comoLibsql(banco)
  const t = await turmaDaRegra(db, entrada.turmaId)
  const dentro = await conferirEscopo(db, t.cursoId, entrada)

  let liberaEm: Date | null = null
  let fechaEm: Date | null = null
  let dias: number | null = null
  let pontos: number | null = null
  let alvoId: string | null = null
  switch (entrada.tipo) {
    case 'data': {
      liberaEm = inicioDoDiaEmBrasilia(entrada.liberaEm)
      if (!liberaEm) throw new ErroDeLiberacao('Informe a data de liberação.')
      if (entrada.fechaEm?.trim()) {
        fechaEm = fimDoDiaEmBrasilia(entrada.fechaEm)
        if (!fechaEm)
          throw new ErroDeLiberacao('A data de fechamento é inválida.')
        if (fechaEm.getTime() <= liberaEm.getTime()) {
          throw new ErroDeLiberacao(
            'O fechamento deve ser depois da liberação.',
          )
        }
      }
      break
    }
    case 'dias_apos_compra':
      dias = inteiroPositivo(entrada.dias, 'os dias após a compra')
      break
    case 'pontuacao_minima':
      pontos = inteiroPositivo(entrada.pontos, 'a pontuação mínima')
      break
    case 'curso_concluido':
    case 'modulo_concluido':
    case 'aula_concluida':
      await conferirAlvo(db, entrada.tipo, entrada.alvoId, t.cursoId, dentro)
      alvoId = entrada.alvoId ?? null
      break
    default:
      break
  }

  const escopo =
    'aulaId' in entrada
      ? { aulaId: entrada.aulaId, moduloId: null }
      : { aulaId: null, moduloId: entrada.moduloId }
  await db.batch([
    apagarDoEscopo(db, entrada.turmaId, entrada),
    db.insert(regraDeLiberacao).values({
      id: crypto.randomUUID(),
      turmaId: entrada.turmaId,
      ...escopo,
      tipo: entrada.tipo,
      liberaEm,
      fechaEm,
      dias,
      pontos,
      alvoId,
    }),
  ])
}

function apagarDoEscopo(
  db: LibSQLDatabase<typeof schema>,
  turmaId: string,
  escopo: EscopoDaRegra,
) {
  return db
    .delete(regraDeLiberacao)
    .where(
      and(
        eq(regraDeLiberacao.turmaId, turmaId),
        'aulaId' in escopo
          ? eq(regraDeLiberacao.aulaId, escopo.aulaId)
          : eq(regraDeLiberacao.moduloId, escopo.moduloId),
      ),
    )
}

// A aula volta a seguir a regra do módulo; o módulo volta a ser livre.
export async function removerRegra(
  banco: Banco,
  turmaId: string,
  escopo: EscopoDaRegra,
): Promise<void> {
  await apagarDoEscopo(comoLibsql(banco), turmaId, escopo)
}

export interface AulaComRegra {
  id: string
  titulo: string
  regra: RegraDoPainel | null
}
export interface ModuloComRegra {
  id: string
  nome: string
  regra: RegraDoPainel | null
  aulas: AulaComRegra[]
}
// A regra como o painel a edita: datas em aaaa-mm-dd (Brasília).
export interface RegraDoPainel {
  tipo: TipoDeRegra
  liberaEm: string
  fechaEm: string
  dias: number | null
  pontos: number | null
  alvoId: string | null
  /** Linha malformada (campo obrigatório vazio): o conteúdo fica bloqueado até corrigir. */
  quebrada: boolean
}

function paraOPainel(r: RegraGravada): RegraDoPainel {
  return {
    tipo: r.tipo,
    liberaEm: r.liberaEm ? dataParaCampo(r.liberaEm) : '',
    fechaEm: r.fechaEm ? dataParaCampo(r.fechaEm) : '',
    dias: r.dias,
    pontos: r.pontos,
    alvoId: r.alvoId,
    quebrada: lerRegra(r).tipo === 'quebrada',
  }
}

// Os módulos e as aulas do curso da turma, cada um com a regra gravada (ou nenhuma).
export async function regrasDaTurma(banco: Banco, turmaId: string) {
  const db = comoLibsql(banco)
  // Turma, curso, módulos, aulas e regras saem numa ida só: curso, módulos e aulas pedem "o curso desta
  // turma" por subconsulta, em vez de esperar a turma chegar (eram cinco idas em fila).
  const cursoDaTurma = db
    .select({ id: turma.cursoId })
    .from(turma)
    .where(eq(turma.id, turmaId))
  const modulosDoCurso = and(
    inArray(modulo.cursoId, cursoDaTurma),
    isNull(modulo.excluidoEm),
  )
  const [[t], [c], modulosBrutos, aulasBrutas, regras] = await db.batch([
    db.select().from(turma).where(eq(turma.id, turmaId)),
    db.select().from(curso).where(inArray(curso.id, cursoDaTurma)),
    db.select().from(modulo).where(modulosDoCurso),
    db
      .select()
      .from(aula)
      .where(
        and(
          inArray(
            aula.moduloId,
            db.select({ id: modulo.id }).from(modulo).where(modulosDoCurso),
          ),
          isNull(aula.excluidoEm),
        ),
      ),
    db
      .select()
      .from(regraDeLiberacao)
      .where(eq(regraDeLiberacao.turmaId, turmaId)),
  ])
  if (!t) throw new ErroDeLiberacao('Turma não encontrada.')
  const modulos = [...modulosBrutos].sort((a, b) => a.ordem - b.ordem)
  const aulas = [...aulasBrutas].sort((a, b) => a.ordem - b.ordem)
  const doModulo = new Map(
    regras.filter((r) => r.moduloId).map((r) => [r.moduloId as string, r]),
  )
  const daAula = new Map(
    regras.filter((r) => r.aulaId).map((r) => [r.aulaId as string, r]),
  )
  const lista: ModuloComRegra[] = modulos.map((m) => ({
    id: m.id,
    nome: m.nome,
    regra: doModulo.has(m.id)
      ? paraOPainel(doModulo.get(m.id) as RegraGravada)
      : null,
    aulas: aulas
      .filter((a) => a.moduloId === m.id)
      .map((a) => ({
        id: a.id,
        titulo: a.titulo,
        regra: daAula.has(a.id)
          ? paraOPainel(daAula.get(a.id) as RegraGravada)
          : null,
      })),
  }))
  return {
    turma: {
      id: t.id,
      nome: t.nome,
      cursoId: t.cursoId,
      cursoNome: c?.nome ?? '',
    },
    modulos: lista,
  }
}

export interface OpcoesDeAlvo {
  cursos: {
    id: string
    nome: string
    modulos: {
      id: string
      nome: string
      aulas: { id: string; titulo: string }[]
    }[]
  }[]
}

// Tudo o que uma condição "concluído" pode apontar: qualquer curso, módulo ou aula.
export async function opcoesDeAlvo(banco: Banco): Promise<OpcoesDeAlvo> {
  const db = comoLibsql(banco)
  // Cursos, módulos e aulas não dependem um do outro: uma ida só.
  const [cursosBrutos, modulosBrutos, aulasBrutas] = await db.batch([
    db.select().from(curso).where(isNull(curso.excluidoEm)),
    db.select().from(modulo).where(isNull(modulo.excluidoEm)),
    db.select().from(aula).where(isNull(aula.excluidoEm)),
  ])
  const cursos = [...cursosBrutos].sort((a, b) => a.ordem - b.ordem)
  const modulos = [...modulosBrutos].sort((a, b) => a.ordem - b.ordem)
  const aulas = [...aulasBrutas].sort((a, b) => a.ordem - b.ordem)
  return {
    cursos: cursos.map((c) => ({
      id: c.id,
      nome: c.nome,
      modulos: modulos
        .filter((m) => m.cursoId === c.id)
        .map((m) => ({
          id: m.id,
          nome: m.nome,
          aulas: aulas
            .filter((a) => a.moduloId === m.id)
            .map((a) => ({ id: a.id, titulo: a.titulo })),
        })),
    })),
  }
}
