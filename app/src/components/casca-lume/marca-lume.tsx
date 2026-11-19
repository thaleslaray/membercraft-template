import { appConfig } from '#/config/app'

/** A marca da casca Lume: o logo enviado pelo Proprietário ou, sem ele, o nome da escola. */
export function MarcaLume({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={appConfig.marca.nome}
        width={180}
        height={32}
        className="h-8 w-auto max-w-[180px] min-w-0 object-contain object-left lume-tela:h-9"
      />
    )
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-[9px] text-xl font-extrabold tracking-[-0.03em] lume-tela:text-[22px]">
      <span
        aria-hidden="true"
        className="size-6 shrink-0 rounded-full bg-[conic-gradient(from_0deg,color-mix(in_srgb,var(--brand)_40%,white)_0_25%,var(--brand)_25%_100%)]"
      />
      <span translate="no" className="truncate">
        {appConfig.marca.nome}
      </span>
    </span>
  )
}
