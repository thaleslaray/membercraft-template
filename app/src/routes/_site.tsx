import { createFileRoute, Outlet } from '@tanstack/react-router'
import Footer from '#/components/Footer'
import Header from '#/components/Header'

// Layout das páginas fora da área do aluno (entrar, conta, termos e privacidade):
// cabeçalho e rodapé simples, sem o menu lateral.
export const Route = createFileRoute('/_site')({
  component: () => (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1 pt-16">
        <Outlet />
      </div>
      <Footer />
    </div>
  ),
})
