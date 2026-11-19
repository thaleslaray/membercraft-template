/** Nome da capa na transição entre telas: o cartão de Meus cursos usa o mesmo da página do curso para a capa virar o topo. */
export function nomeDaCapa(cursoId: string) {
  return `capa-${cursoId.replace(/\W/g, '-')}`
}
