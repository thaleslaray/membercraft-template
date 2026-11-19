import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import {
  ArrowLeft,
  Award,
  BarChart3,
  Bell,
  BellRing,
  ClipboardCheck,
  ClipboardPen,
  FileText,
  Headset,
  Images,
  Inbox,
  Library,
  type LucideIcon,
  Mail,
  MessageCircleQuestion,
  MessageSquareWarning,
  MessagesSquare,
  Palette,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  UserPlus,
  Users,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Sininho } from '#/components/casca/sininho'
import { useAquecerTelas } from '#/components/painel/aquecer-telas'
import ThemeToggle from '#/components/ThemeToggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { Separator } from '#/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '#/components/ui/sidebar'
import { appConfig } from '#/config/app'
import BetterAuthHeader from '#/integrations/better-auth/header-user'
import { filasQuery } from '#/lib/filas-queries'
import { menuAbertoNoCookie } from '#/regras/painel'
import { type Acao, type Perfil, podeFazer } from '#/regras/permissoes'
import type { FileRouteTypes } from '#/routeTree.gen'

type ItemDoPainel = {
  rotulo: string
  para: FileRouteTypes['to']
  icone: LucideIcon
  /** Ação que o perfil precisa poder fazer para ver o item. */
  exige?: Acao
}

type GrupoDoPainel = { rotulo: string; itens: ItemDoPainel[] }

// Menu lateral do Estúdio da equipe: neutro (sem a aparência da área do aluno) e agrupado pelo
// trabalho. Item novo de painel entra no grupo dele aqui.
const MENU_DO_PAINEL: GrupoDoPainel[] = [
  {
    rotulo: 'Conteúdo',
    itens: [
      { rotulo: 'Cursos', para: '/painel/conteudo', icone: Library },
      { rotulo: 'Banners', para: '/painel/banners', icone: Images },
      { rotulo: 'Transcrições', para: '/painel/transcricoes', icone: FileText },
      {
        rotulo: 'Comunidades',
        para: '/painel/comunidades',
        icone: MessagesSquare,
      },
    ],
  },
  {
    rotulo: 'Alunos e vendas',
    itens: [
      { rotulo: 'Matricular', para: '/painel/matricular', icone: UserPlus },
      { rotulo: 'Alunos', para: '/painel/alunos', icone: Users },
      { rotulo: 'Vendas', para: '/painel/vendas', icone: ShoppingCart },
      {
        rotulo: 'Conferência de vendas',
        para: '/painel/conferencia-de-vendas',
        icone: ClipboardCheck,
      },
    ],
  },
  {
    rotulo: 'Filas do dia',
    itens: [
      { rotulo: 'Atendimento', para: '/painel/atendimento', icone: Headset },
      {
        rotulo: 'Correção de exercícios',
        para: '/painel/correcao',
        icone: ClipboardPen,
      },
      {
        rotulo: 'Entregas',
        para: '/painel/entregas',
        icone: Inbox,
        exige: 'corrigir-quiz',
      },
      {
        rotulo: 'Aguardando resposta',
        para: '/painel/aguardando-resposta',
        icone: MessageCircleQuestion,
      },
      {
        rotulo: 'Avaliações',
        para: '/painel/avaliacoes',
        icone: MessageSquareWarning,
      },
      {
        rotulo: 'Certificado do MEC',
        para: '/painel/certificado-do-mec',
        icone: Award,
      },
    ],
  },
  {
    rotulo: 'Gestão',
    itens: [
      { rotulo: 'Relatórios', para: '/painel/relatorios', icone: BarChart3 },
      { rotulo: 'Resumo diário', para: '/painel/resumo', icone: BellRing },
      { rotulo: 'Avisos', para: '/painel/avisos', icone: Bell },
      {
        rotulo: 'E-mails',
        para: '/painel/emails',
        icone: Mail,
        exige: 'configurar-area',
      },
      {
        rotulo: 'Aparência',
        para: '/estudio/aparencia',
        icone: Palette,
        exige: 'configurar-area',
      },
      {
        rotulo: 'Configurações',
        para: '/painel/configuracoes',
        icone: Settings,
        exige: 'configurar-area',
      },
      {
        rotulo: 'Equipe',
        para: '/painel/equipe',
        icone: ShieldCheck,
        exige: 'gerir-equipe',
      },
      {
        rotulo: 'Registro de ações',
        para: '/painel/registro',
        icone: ScrollText,
        exige: 'ler-registro-de-acoes',
      },
    ],
  },
]

/** Os grupos que o perfil vê, sem os itens que ele não pode usar nem grupos vazios. */
export function menuDoPainel(perfil: Perfil): GrupoDoPainel[] {
  return MENU_DO_PAINEL.map((grupo) => ({
    ...grupo,
    itens: grupo.itens.filter(
      (item) => !item.exige || podeFazer(perfil, item.exige),
    ),
  })).filter((grupo) => grupo.itens.length > 0)
}

// Item fora da página atual fica no tom secundário; o da página atual ganha a superfície e o tom
// principal (as classes `data-[active=true]` do botão vencem estas).
const ITEM_QUIETO = 'font-normal text-sidebar-foreground/70'

// Menu recolhido ou aberto, guardado no cookie pelo `ui/sidebar`: lido no servidor também, para a
// primeira pintura já sair do jeito que a pessoa deixou (sem o menu abrir e fechar na hidratação).
const menuAbertoGuardado = createIsomorphicFn()
  .server(() => menuAbertoNoCookie(getRequest().headers.get('cookie')))
  .client(() => menuAbertoNoCookie(document.cookie))

// A gaveta do celular fecha sozinha quando a tela muda (o item escolhido já abriu).
function FecharGavetaAoNavegar({ caminho }: { caminho: string }) {
  const { setOpenMobile } = useSidebar()
  // biome-ignore lint/correctness/useExhaustiveDependencies: fecha a cada troca de caminho.
  useEffect(() => {
    setOpenMobile(false)
  }, [caminho, setOpenMobile])
  return null
}

function estaEm(caminho: string, para: string) {
  return caminho === para || caminho.startsWith(`${para}/`)
}

export function CascaPainel({
  children,
  perfil,
}: {
  children: ReactNode
  perfil: Perfil
}) {
  const grupos = menuDoPainel(perfil)
  const { pathname } = useLocation()
  const grupoAtual = grupos.find((g) =>
    g.itens.some((item) => estaEm(pathname, item.para)),
  )
  const atual = grupoAtual?.itens.find((item) => estaEm(pathname, item.para))
  useAquecerTelas(
    atual?.para,
    grupos.flatMap((g) => g.itens.map((item) => item.para)),
  )
  // Contador de cada fila no item do menu onde ela é trabalhada (só aparece com pendência).
  const { data: filas } = useQuery(filasQuery)
  const pendentes = new Map(
    (filas ?? []).filter((f) => f.total > 0).map((f) => [f.para, f.total]),
  )
  const [menuAberto] = useState(menuAbertoGuardado)
  return (
    <SidebarProvider defaultOpen={menuAberto}>
      <FecharGavetaAoNavegar caminho={pathname} />
      {/* Primeiro item do teclado: pula o menu e vai direto ao conteúdo da tela. */}
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-background px-4 py-3 text-sm font-medium text-foreground shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      <Sidebar variant="inset">
        <SidebarHeader>
          <Link
            to="/painel"
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sidebar-foreground no-underline"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
              {appConfig.marca.sigla}
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-medium">Estúdio</span>
              <span className="block text-xs text-muted-foreground">
                {appConfig.marca.nome}
              </span>
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <nav
            aria-label="Painel da equipe"
            className="flex flex-col gap-2 [&_svg]:stroke-[1.5]"
          >
            {grupos.map((grupo) => (
              <SidebarGroup key={grupo.rotulo}>
                <SidebarGroupLabel>{grupo.rotulo}</SidebarGroupLabel>
                <SidebarMenu>
                  {grupo.itens.map(({ rotulo, para, icone: Icone }) => {
                    const total = pendentes.get(para)
                    return (
                      <SidebarMenuItem key={para}>
                        <SidebarMenuButton
                          asChild
                          tooltip={rotulo}
                          isActive={estaEm(pathname, para)}
                          className={`${ITEM_QUIETO} toque:h-11`}
                        >
                          <Link to={para}>
                            <Icone />
                            <span>{rotulo}</span>
                          </Link>
                        </SidebarMenuButton>
                        {total ? (
                          <SidebarMenuBadge
                            aria-label={`${total} esperando`}
                            className="tabular-nums text-sidebar-foreground"
                          >
                            {total}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Ver a área do aluno"
                className={ITEM_QUIETO}
              >
                <Link to="/">
                  <ArrowLeft className="stroke-[1.5]" />
                  <span>Ver a área do aluno</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* `min-w-0`: sem ele o conteúdo cresce até o filho mais largo e a página rola de lado. */}
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-2 sm:px-4">
          <SidebarTrigger aria-label="Abrir ou fechar o menu" />
          <Separator orientation="vertical" className="h-4" />
          {/* Abaixo de `sm`, a trilha mostra só a página atual, numa linha, com reticências. */}
          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList className="flex-nowrap">
              {grupoAtual && atual ? (
                <>
                  <BreadcrumbItem className="hidden sm:inline-flex">
                    {grupoAtual.rotulo}
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden sm:block" />
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage className="truncate">
                      {atual.rotulo}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              ) : (
                <BreadcrumbItem>
                  <BreadcrumbPage>Estúdio</BreadcrumbPage>
                </BreadcrumbItem>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <Sininho />
            <ThemeToggle />
            <BetterAuthHeader />
          </div>
        </header>
        {/* Alvo do "Pular para o conteúdo"; cada tela põe o seu `<main>` aqui dentro. */}
        <div
          id="conteudo"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col outline-none"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
