import { Link } from '@tanstack/react-router'
import { Marca } from '#/components/casca/marca'
import { appConfig } from '#/config/app'
import { useAparencia } from '#/lib/aparencia-queries'
import { useConfiguracaoDaArea } from '#/lib/configuracao-queries'

const footerLink =
  'text-sm text-muted-foreground no-underline transition-colors hover:text-foreground'

export default function Footer() {
  const year = new Date().getFullYear()
  const { suporteEmail } = useConfiguracaoDaArea()
  const { logoUrl } = useAparencia()
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col gap-10 py-12 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Link
              to="/"
              className="flex w-fit items-center text-foreground no-underline"
            >
              <Marca logoUrl={logoUrl} />
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              {appConfig.description}
            </p>
          </div>
          <div className="flex gap-12 sm:gap-20">
            <div className="flex flex-col items-start gap-3">
              <span className="kicker">Legal</span>
              <a href="/termos" className={footerLink}>
                Termos de uso
              </a>
              <a href="/privacidade" className={footerLink}>
                Privacidade
              </a>
            </div>
            <div className="flex flex-col items-start gap-3">
              <span className="kicker">Contato</span>
              <a href={`mailto:${suporteEmail}`} className={footerLink}>
                {suporteEmail}
              </a>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 pb-8 text-sm text-muted-foreground sm:flex-row sm:items-baseline sm:justify-between">
          <span>
            © {year} {appConfig.name}
          </span>
        </div>
      </div>
    </footer>
  )
}
