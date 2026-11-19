import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { lazy, Suspense, useEffect, useState } from 'react'
import { ConfirmarProvider } from '#/components/confirmar'
import { ErrorPage, NotFoundPage } from '#/components/error-pages'
import { appConfig } from '#/config/app'
import { defaultTheme, themeById } from '#/config/themes'
import { aparenciaQuery } from '#/lib/aparencia-queries'
import { configuracaoDaAreaQuery } from '#/lib/configuracao-queries'
import { cssDaMarca } from '#/regras/aparencia-cor'
import { areaDaRota } from '#/regras/painel'

import appCss from '#/styles.css?url'

interface MyRouterContext {
  queryClient: QueryClient
}

// Fontes dos temas (a CSP já admite fonts.googleapis.com e fonts.gstatic.com): carregadas aqui, com
// preconnect, e não por `@import` no CSS, que só começa a baixar depois do CSS principal.
const URL_DAS_FONTES =
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=Archivo:wght@700;800&family=Caveat+Brush&display=swap'

// Devtools só em desenvolvimento: o import dinâmico fica atrás de uma
// constante de build, então a produção descarta o chunk inteiro.
const Devtools = import.meta.env.DEV
  ? lazy(() => import('#/components/devtools'))
  : () => null

// O sonner pesa uns 30 KB e só aparece quando o visitante faz algo. Entra
// depois da hidratação, fora do caminho crítico.
const Toaster = lazy(() =>
  import('#/components/ui/sonner').then((mod) => ({ default: mod.Toaster })),
)

function LazyToaster() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  ) : null
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  // A aparência (tema, cor da marca, logo, favicon, fundos) vale para todas as páginas,
  // inclusive a de entrar; vem do banco e é renderizada no servidor, sem pulo de tema.
  // Junto vai a configuração da área (contato de suporte, Termos): rodapé e casca a leem sem espera.
  loader: async ({ context }) => {
    const [aparencia] = await Promise.all([
      context.queryClient.ensureQueryData(aparenciaQuery),
      context.queryClient.ensureQueryData(configuracaoDaAreaQuery),
    ])
    return aparencia
  },
  head: ({ loaderData }) => {
    const referencia = themeById(loaderData?.tema ?? defaultTheme).referencia
    return {
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        {
          name: 'theme-color',
          content: referencia.claro.fundo,
          media: '(prefers-color-scheme: light)',
        },
        {
          name: 'theme-color',
          content: referencia.escuro.fundo,
          media: '(prefers-color-scheme: dark)',
        },
        { title: appConfig.name },
        { name: 'description', content: appConfig.description },
        { property: 'og:site_name', content: appConfig.name },
        { property: 'og:type', content: 'website' },
        { property: 'og:locale', content: 'pt_BR' },
      ],
      links: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossOrigin: 'anonymous',
        },
        { rel: 'stylesheet', href: URL_DAS_FONTES },
        { rel: 'stylesheet', href: appCss },
        ...(loaderData?.faviconUrl
          ? [{ rel: 'icon', href: loaderData.faviconUrl }]
          : []),
      ],
      // A cor da marca escolhida pelo Proprietário só sobrescreve tokens (cssDaMarca).
      styles: loaderData?.corDaMarca
        ? [{ children: cssDaMarca(loaderData.corDaMarca, loaderData.tema) }]
        : [],
    }
  },
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  // O TEMA (qual dos quatro) vem da configuração e vai em `data-theme`; o MODO (claro/escuro)
  // é do next-themes, na classe `dark`. Se a raiz falhou antes de carregar, fica o padrão.
  const tema = Route.useLoaderData({
    select: (aparencia) => aparencia?.tema ?? defaultTheme,
  })
  // O script do tema (next-themes) é inline: leva o nonce da resposta, senão a CSP o bloqueia.
  const nonce = useRouter().options.ssr?.nonce
  // Painel da equipe ou área do aluno: só ajusta tokens em styles.css (`[data-area='painel']`),
  // também nas janelas em portal. Nenhum componente lê o atributo.
  const area = useRouterState({
    select: (s) => areaDaRota(s.location.pathname),
  })
  return (
    <html
      lang="pt-BR"
      data-theme={tema}
      data-area={area === 'painel' ? 'painel' : undefined}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {/* O modo segue o aparelho do aluno (#33, história 118); o botão
            grava uma escolha explícita que vence a partir daí. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <ConfirmarProvider>{children}</ConfirmarProvider>
          <LazyToaster />
          <Suspense fallback={null}>
            <Devtools />
          </Suspense>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
