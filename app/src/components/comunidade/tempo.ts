import { formatarDataHoraNoFuso } from '#/lib/datas'

/** "há 5 minutos", "há 3 dias"; depois de 30 dias, a data. */
export function tempoRelativo(
  data: Date | string | number,
  fuso?: string | null,
  agora = Date.now(),
) {
  const quando = new Date(data).getTime()
  const minutos = Math.max(0, Math.floor((agora - quando) / 60_000))
  if (minutos < 1) return 'agora há pouco'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas} ${horas === 1 ? 'hora' : 'horas'}`
  const dias = Math.floor(horas / 24)
  if (dias <= 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
  return formatarDataHoraNoFuso(quando, fuso).slice(0, 10)
}

export const dataEHora = (data: Date | string | number, fuso?: string | null) =>
  formatarDataHoraNoFuso(data, fuso)

export function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}
