// Uma data digitada (aaaa-mm-dd) vira o fim daquele dia no horário de Brasília (UTC-3, sem horário
// de verão desde 2019). Vazio ou inválido = sem data.
export function fimDoDiaEmBrasilia(
  data: string | null | undefined,
): Date | null {
  const texto = (data ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null
  const fim = new Date(`${texto}T23:59:59-03:00`)
  return Number.isNaN(fim.getTime()) ? null : fim
}

export function formatarData(data: Date | string | number | null): string {
  if (data === null) return 'sem data'
  return new Date(data).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  })
}

// Uma data digitada (aaaa-mm-dd) vira o começo daquele dia no horário de Brasília. Vazio ou
// inválido = sem data.
export function inicioDoDiaEmBrasilia(
  data: string | null | undefined,
): Date | null {
  const texto = (data ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null
  const inicio = new Date(`${texto}T00:00:00-03:00`)
  return Number.isNaN(inicio.getTime()) ? null : inicio
}

// O inverso, para preencher um campo de data (aaaa-mm-dd) com o dia em Brasília.
export function dataParaCampo(data: Date | null): string {
  if (!data) return ''
  return new Date(data.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)
}

// ---- Datas mostradas ao aluno, no fuso dele (#64) ----
// As liberações e vencimentos seguem em Brasília (funções acima); só o que o aluno LÊ muda de fuso.

export const FUSO_PADRAO = 'America/Sao_Paulo'

/**
 * Fuso das telas da equipe (painel): a escola trabalha no horário de Brasília. Use sempre com
 * `formatarDataNoFuso(data, FUSO_DA_ESCOLA)` e `formatarDataHoraNoFuso(data, FUSO_DA_ESCOLA)`,
 * nunca um `toLocaleString` local nem `'America/Sao_Paulo'` escrito à mão.
 */
export const FUSO_DA_ESCOLA = FUSO_PADRAO

// Nome IANA que o ambiente reconhece (ex.: America/Sao_Paulo, Europe/Lisbon).
export function fusoValido(fuso: unknown): fuso is string {
  if (typeof fuso !== 'string' || !fuso.trim()) return false
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: fuso })
    return true
  } catch {
    return false
  }
}

// Fuso que vale para um aluno: o dele se for válido, senão Brasília.
export function fusoDoAluno(fuso: string | null | undefined): string {
  return fusoValido(fuso) ? fuso : FUSO_PADRAO
}

export function formatarDataNoFuso(
  data: Date | string | number | null,
  fuso: string | null | undefined,
): string {
  if (data === null) return 'sem data'
  return new Date(data).toLocaleDateString('pt-BR', {
    timeZone: fusoDoAluno(fuso),
  })
}

export function formatarDataHoraNoFuso(
  data: Date | string | number | null,
  fuso: string | null | undefined,
): string {
  if (data === null) return 'sem data'
  return new Date(data).toLocaleString('pt-BR', {
    timeZone: fusoDoAluno(fuso),
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

// Fusos oferecidos em Minha conta: os do Brasil primeiro, depois os mais comuns entre quem
// estuda de fora. Qualquer outro nome IANA válido também é aceito.
export const FUSOS_SUGERIDOS: { id: string; rotulo: string }[] = [
  { id: 'America/Sao_Paulo', rotulo: 'Brasília (São Paulo, Rio, BH)' },
  { id: 'America/Manaus', rotulo: 'Manaus' },
  { id: 'America/Cuiaba', rotulo: 'Cuiabá' },
  { id: 'America/Rio_Branco', rotulo: 'Rio Branco' },
  { id: 'America/Noronha', rotulo: 'Fernando de Noronha' },
  { id: 'Europe/Lisbon', rotulo: 'Lisboa' },
  { id: 'Europe/London', rotulo: 'Londres' },
  { id: 'Europe/Paris', rotulo: 'Paris, Madri, Berlim' },
  { id: 'America/New_York', rotulo: 'Nova York' },
  { id: 'America/Chicago', rotulo: 'Chicago' },
  { id: 'America/Los_Angeles', rotulo: 'Los Angeles' },
  { id: 'America/Argentina/Buenos_Aires', rotulo: 'Buenos Aires' },
  { id: 'Asia/Tokyo', rotulo: 'Tóquio' },
  { id: 'Australia/Sydney', rotulo: 'Sydney' },
]

const FUSO_DE_BRASILIA_MS = 3 * 3_600_000
const DIA_MS = 86_400_000

// O começo (00:00 de Brasília) do dia em que o instante cai, somado de `dias` dias.
export function diaEmBrasilia(instante: Date, dias = 0): Date {
  const local = instante.getTime() - FUSO_DE_BRASILIA_MS
  const comecoLocal = Math.floor(local / DIA_MS) * DIA_MS
  return new Date(comecoLocal + dias * DIA_MS + FUSO_DE_BRASILIA_MS)
}

// "12/03": dia e mês no fuso do aluno (Brasília se não tiver fuso).
export function formatarDiaEMes(data: Date, fuso?: string | null): string {
  return data.toLocaleDateString('pt-BR', {
    timeZone: fusoDoAluno(fuso),
    day: '2-digit',
    month: '2-digit',
  })
}
