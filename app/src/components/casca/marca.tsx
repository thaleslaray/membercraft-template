import { appConfig } from '#/config/app'

/**
 * A marca no topo do menu lateral e na tela de entrar. Com logo enviado pelo
 * Proprietário, mostra a imagem; sem logo, a sigla num quadrado na cor primária
 * e o nome ao lado (direção Estúdio, #35).
 */
export function Marca({
  logoUrl,
  className = '',
}: {
  logoUrl: string | null
  className?: string
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={appConfig.marca.nome}
        className={`h-9 w-auto max-w-[180px] object-contain object-left ${className}`}
      />
    )
  }
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
        {appConfig.marca.sigla}
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">
          {appConfig.marca.nome}
        </span>
        <span className="block text-xs text-muted-foreground">
          {appConfig.marca.subtitulo}
        </span>
      </span>
    </span>
  )
}

/** Imagem de fundo com um véu na cor do token, para o texto por cima continuar legível. */
export function fundoComVeu(url: string, token: string): string {
  return `linear-gradient(to bottom, color-mix(in srgb, var(${token}) 84%, transparent), color-mix(in srgb, var(${token}) 94%, transparent)), url("${url}")`
}
