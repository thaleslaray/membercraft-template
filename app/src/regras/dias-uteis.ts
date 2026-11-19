// Dias úteis, para o prazo do Pedido do MEC (#56). Conta no horário de Brasília (UTC-3, sem horário
// de verão desde 2019). Fim de semana e feriados NACIONAIS FIXOS não contam.
//
// Limite conhecido: feriados móveis (Carnaval, Sexta-feira Santa, Corpus Christi) e os estaduais ou
// municipais NÃO estão na lista. Para o destaque dos 5 dias úteis isso erra no máximo para menos
// (o pedido é destacado um ou dois dias depois do que seria), o que é aceitável: o aviso é um
// lembrete, não um prazo contratual. Para incluir um feriado, acrescente-o em `FERIADOS_FIXOS`
// (formato `mm-dd`).

export const FERIADOS_FIXOS: readonly string[] = [
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '11-20', // Consciência Negra (nacional desde 2024)
  '12-25', // Natal
]

const DIA_EM_MS = 86_400_000

/** O dia civil em Brasília, como `aaaa-mm-dd`. */
export function diaEmBrasilia(data: Date): string {
  return new Date(data.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)
}

/** Sábado, domingo e feriado nacional fixo não são úteis. `dia` é `aaaa-mm-dd`. */
export function ehDiaUtil(dia: string): boolean {
  const diaDaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay()
  if (diaDaSemana === 0 || diaDaSemana === 6) return false
  return !FERIADOS_FIXOS.includes(dia.slice(5))
}

/**
 * Quantos dias úteis se passaram depois do dia de `inicio` até o dia de `agora` (os dois contados em
 * Brasília; o dia de `inicio` não conta, o de `agora` conta se for útil). Pedido feito na segunda:
 * na terça seguinte já passou 1 dia útil; na segunda seguinte, 5.
 */
export function diasUteisDesde(inicio: Date, agora: Date): number {
  const de = new Date(`${diaEmBrasilia(inicio)}T00:00:00Z`).getTime()
  const ate = new Date(`${diaEmBrasilia(agora)}T00:00:00Z`).getTime()
  let total = 0
  for (let t = de + DIA_EM_MS; t <= ate; t += DIA_EM_MS) {
    if (ehDiaUtil(new Date(t).toISOString().slice(0, 10))) total++
  }
  return total
}
