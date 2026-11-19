import { Link } from '@tanstack/react-router'
import { CheckCircle2, MessageSquare, Pin } from 'lucide-react'
import { LEITURA_NO_PAPEL } from '#/components/casca-lume/pagina-lume'
import { IconeDaComunidade } from '#/components/comunidade/icone-da-comunidade'
import { tempoRelativo } from '#/components/comunidade/tempo'
import { AvatarDaPessoa } from '#/components/pessoa/pessoa'
import { Badge } from '#/components/ui/badge'
import { useFusoDoAluno } from '#/lib/auth-queries'
import type { PublicacaoDaLista } from '#/regras/publicacoes'

/** Uma publicação do mural; a recém-publicada traz o estado enquanto o servidor confirma. */
export type ItemDoMural = PublicacaoDaLista & {
  /** Chave estável do React e do FLIP (a mesma antes e depois de o servidor dar o id). */
  chave?: string
  estado?: 'publicando' | 'publicada'
}

// Uma linha do mural. A bolinha marca o que mudou desde a última visita.
export function CartaoDePublicacao({
  publicacao: p,
}: {
  publicacao: ItemDoMural
}) {
  const fuso = useFusoDoAluno()
  return (
    <li data-flip={p.chave ?? p.id}>
      <Link
        to="/comunidades/publicacoes/$publicacaoId"
        params={{ publicacaoId: p.id }}
        disabled={p.estado === 'publicando'}
        className={`group/cartao pressiona-cartao flex gap-3 rounded-[var(--radius-card)] border bg-card p-4 text-foreground no-underline transition-colors hover:bg-accent/40 in-data-[casca=lume]:hover:bg-(color:--leitura-hover) ${LEITURA_NO_PAPEL} in-data-[casca=lume]:rounded-[calc(var(--radius-card)*var(--leitura-quina))] in-data-[casca=lume]:px-[calc(1rem*var(--leitura-recuo))]`}
      >
        <AvatarDaPessoa pessoa={p.autor} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 font-semibold break-words in-data-[casca=lume]:group-hover/cartao:[text-decoration-line:var(--leitura-titulo-hover)] in-data-[casca=lume]:underline-offset-4">
              {p.naoLida && (
                <span
                  role="img"
                  aria-label="Não lida"
                  className="mr-2 inline-block size-2 rounded-full bg-primary align-middle in-data-[casca=lume]:bg-(color:--aviso-ponto)"
                />
              )}
              {p.titulo}
            </h3>
            {p.fixada && (
              <Badge variant="outline">
                <Pin aria-hidden="true" />
                Fixada
              </Badge>
            )}
            {p.estado && (
              <Badge variant="outline" role="status">
                {p.estado === 'publicando' ? 'Publicando…' : 'Publicada'}
              </Badge>
            )}
            {p.resolvida && (
              <Badge variant="secondary">
                <CheckCircle2 aria-hidden="true" />
                Resolvida
              </Badge>
            )}
          </div>
          {p.resumo && (
            <p className="line-clamp-2 text-sm break-words text-muted-foreground">
              {p.resumo}
            </p>
          )}
          <div className="flex items-center gap-x-3 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 shrink items-center gap-1.5">
              <IconeDaComunidade
                icone={p.comunidade.icone}
                cor={p.comunidade.cor}
                className="size-5 rounded [&_svg]:size-3"
              />
              <span className="min-w-0 truncate">{p.comunidade.nome}</span>
            </span>
            <span className="min-w-0 shrink truncate">
              {p.autor.nome}
              {p.autor.daEquipe && ' (equipe)'}
            </span>
            <span className="shrink-0 whitespace-nowrap">
              {tempoRelativo(p.ultimaAtividadeEm, fuso)}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
              <MessageSquare className="size-3" aria-hidden="true" />
              {p.comentarios}{' '}
              {p.comentarios === 1 ? 'comentário' : 'comentários'}
            </span>
          </div>
        </div>
      </Link>
    </li>
  )
}
