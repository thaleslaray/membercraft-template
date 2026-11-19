// Anexo citado no texto da aula: se o `texto_html` já traz um link para `/api/materiais/<id>` (relativo ou
// absoluto), esse material não se repete na lista de Materiais.

const LINK_DE_MATERIAL = /\/api\/materiais\/([A-Za-z0-9_-]+)/g

/** Ids dos materiais que o texto cita por link. */
export function idsDeMateriaisNoTexto(html: string): Set<string> {
  return new Set(
    Array.from(html.matchAll(LINK_DE_MATERIAL), (m) => m[1] as string),
  )
}

/** Os materiais que o texto não cita: só eles entram na lista (e na contagem) de Materiais. */
export function materiaisForaDoTexto<T extends { id: string }>(
  materiais: T[],
  html: string | null | undefined,
): T[] {
  if (!html) return materiais
  const citados = idsDeMateriaisNoTexto(html)
  if (citados.size === 0) return materiais
  return materiais.filter((m) => !citados.has(m.id))
}
