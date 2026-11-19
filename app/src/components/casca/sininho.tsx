import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { Separator } from '#/components/ui/separator'
import { TelaVazia } from '#/components/vazio/tela-vazia'
import { useFusoDoAluno } from '#/lib/auth-queries'
import { formatarDataHoraNoFuso } from '#/lib/datas'
import {
  marcarAvisoComoLidoFn,
  marcarTodosComoLidosFn,
  sininhoFn,
} from '#/lib/notificacoes-fns'
import { cn } from '#/lib/utils'

const CHAVE = ['sininho'] as const

// Sininho da casca: contador de não lidas, lista dos avisos e "Marcar todas como lidas".
// Atualiza sozinho a cada minuto. `lume`: botão redondo de 40px com ícone de 20px, igual à lupa da
// casca Lume (na clássica segue o botão de ícone padrão). O painel mora num portal, fora da casca:
// por isso o ponto de "não lida" lê o token pela prop `lume`, não pela variante `in-data-[casca=lume]`.
export function Sininho({ lume = false }: { lume?: boolean }) {
  const navegar = useNavigate()
  const fuso = useFusoDoAluno()
  const cliente = useQueryClient()
  const [aberto, setAberto] = useState(false)
  const { data } = useQuery({
    queryKey: CHAVE,
    queryFn: () => sininhoFn(),
    refetchInterval: 60_000,
  })
  const atualizar = () => cliente.invalidateQueries({ queryKey: CHAVE })
  const marcarTodas = useMutation({
    mutationFn: () => marcarTodosComoLidosFn(),
    onSuccess: atualizar,
  })
  const marcarUma = useMutation({
    mutationFn: (id: string) => marcarAvisoComoLidoFn({ data: { id } }),
    onSuccess: atualizar,
  })
  const naoLidas = data?.naoLidas ?? 0
  const avisos = data?.avisos ?? []

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative toque:size-11',
            lume &&
              'size-10 rounded-full text-muted-foreground hover:text-foreground',
          )}
          aria-label={
            naoLidas > 0
              ? `Avisos: ${naoLidas} não lidos`
              : 'Avisos: nenhum não lido'
          }
        >
          <Bell className={lume ? 'size-5' : 'size-4'} aria-hidden="true" />
          {naoLidas > 0 && (
            <span
              data-testid="contador-do-sininho"
              className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground in-data-[casca=lume]:bg-(color:--aviso-ponto) in-data-[casca=lume]:text-(color:--aviso-ponto-tinta)"
            >
              {naoLidas > 99 ? '99+' : naoLidas}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={16}
        aria-label="Avisos"
        className="menu-nasce flex max-h-[min(calc(100dvh-4.5rem),var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] flex-col bg-popover p-1 text-popover-foreground lume-cel:w-[calc(100vw-2rem)]"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <h2 className="text-sm font-semibold">Avisos</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs toque:h-11 toque:px-3"
            disabled={naoLidas === 0 || marcarTodas.isPending}
            aria-busy={marcarTodas.isPending}
            onClick={() => marcarTodas.mutate()}
          >
            {marcarTodas.isPending ? 'Marcando…' : 'Marcar todas como lidas'}
          </Button>
        </div>
        <Separator className="-mx-1 my-1 w-auto" />
        {avisos.length === 0 ? (
          <TelaVazia
            ilustracao="carretel"
            titulo="Nenhum aviso por enquanto"
            texto="Quando houver novidade, ela aparece aqui."
            compacta
            className="[&_[data-slot=empty-description]]:text-foreground/70"
          />
        ) : (
          <ul className="max-h-96 min-h-0 overflow-y-auto overscroll-contain">
            {avisos.map((aviso) => {
              const conteudo = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      aviso.lida
                        ? 'bg-transparent'
                        : lume
                          ? 'bg-(color:--aviso-ponto)'
                          : 'bg-primary',
                    )}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    {!aviso.lida && <span className="sr-only">Não lido:</span>}
                    <span
                      className={`min-w-0 [overflow-wrap:anywhere] ${aviso.lida ? 'text-muted-foreground' : ''}`}
                    >
                      {aviso.texto}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatarDataHoraNoFuso(aviso.criadoEm, fuso)}
                    </span>
                  </span>
                </>
              )
              const classe =
                'pressiona-linha flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm whitespace-normal toque:min-h-11 outline-hidden hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
              const marcar = () => {
                if (!aviso.lida) marcarUma.mutate(aviso.id)
                setAberto(false)
              }
              // Com link, o item é um <a> de verdade (abre em nova aba, mostra o destino). O clique comum
              // segue pelo roteador, sem recarregar a página; Ctrl/Cmd/Shift ou botão do meio ficam com o navegador.
              const abrir = (e: React.MouseEvent<HTMLAnchorElement>) => {
                if (
                  !aviso.link ||
                  e.button !== 0 ||
                  e.metaKey ||
                  e.ctrlKey ||
                  e.shiftKey ||
                  e.altKey
                )
                  return
                e.preventDefault()
                navegar({ href: aviso.link })
              }
              return (
                <li key={aviso.id}>
                  {aviso.link ? (
                    <a
                      href={aviso.link}
                      onClick={(e) => {
                        marcar()
                        abrir(e)
                      }}
                      className={classe}
                    >
                      {conteudo}
                    </a>
                  ) : (
                    <button type="button" onClick={marcar} className={classe}>
                      {conteudo}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
