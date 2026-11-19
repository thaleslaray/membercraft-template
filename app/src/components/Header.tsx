import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Marca } from '#/components/casca/marca'
import ThemeToggle from '#/components/ThemeToggle'
import BetterAuthHeader from '#/integrations/better-auth/header-user'
import { useAparencia } from '#/lib/aparencia-queries'

function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return scrolled
}

export default function Header() {
  const scrolled = useScrolled()
  const { logoUrl } = useAparencia()
  return (
    // Fixo, não sticky: um elemento sticky acompanha o "rubber band" do
    // trackpad; fixo fica parado enquanto a página balança embaixo. O <main>
    // compensa a altura com padding-top (veja __root.tsx).
    // A linha de baixo só aparece depois de rolar: no topo, a barra está no
    // mesmo chão do conteúdo e uma linha ali separaria nada de nada.
    <header
      className={`fixed inset-x-0 top-0 z-40 border-b bg-background transition-colors duration-200 supports-[backdrop-filter]:bg-background/80 supports-[backdrop-filter]:backdrop-blur-xl ${
        scrolled ? 'border-border' : 'border-transparent'
      }`}
    >
      <div className="mx-auto grid h-16 w-full max-w-6xl grid-cols-[1fr_auto] items-center px-4 sm:grid-cols-[1fr_auto_1fr] sm:px-6">
        <Link
          to="/"
          className="flex w-fit items-center py-2 text-foreground no-underline"
        >
          <Marca logoUrl={logoUrl} />
        </Link>

        <div />

        <div className="flex items-center justify-end gap-1 sm:gap-2">
          <ThemeToggle />
          <BetterAuthHeader />
        </div>
      </div>
    </header>
  )
}
