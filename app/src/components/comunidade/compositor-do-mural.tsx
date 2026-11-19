import { useEffect, useRef, useState } from 'react'
import type { ItemDoMural } from '#/components/comunidade/cartao-de-publicacao'
import { FormularioDePublicacao } from '#/components/comunidade/formulario-de-publicacao'
import { AvatarDaPessoa } from '#/components/pessoa/pessoa'
import { Label } from '#/components/ui/label'
import { Recolhivel } from '#/components/ui/recolhivel'
import { criarPublicacaoFn } from '#/lib/comunidade-fns'
import {
  guardarRascunho,
  lerRascunho,
  type RascunhoDoMural,
  textoDoHtml,
} from '#/lib/mural'
import { cn } from '#/lib/utils'

export interface ComunidadeParaPublicar {
  id: string
  nome: string
  icone: string
  cor: string
}

export interface AutorLogado {
  id: string
  nome: string
  imagem: string | null
  bio: string | null
  daEquipe: boolean
}

// "Pergunte ou compartilhe algo" no topo do mural: o campo cresce no lugar até virar o formulário
// (com o cursor no título). Cancelar recolhe e guarda o rascunho; publicar põe a publicação no topo
// do mural na hora (aoOtimista), confirma com o id do servidor (aoConfirmar) ou desfaz (aoFalhar).
export function CompositorDoMural({
  comunidades,
  comunidadeDoFiltro,
  pedidoDeAbrir = 0,
  autor,
  aoOtimista,
  aoConfirmar,
  aoFalhar,
}: {
  comunidades: ComunidadeParaPublicar[]
  comunidadeDoFiltro?: string
  /** Sobe a cada pedido de fora (a tela vazia do mural) para abrir o formulário. */
  pedidoDeAbrir?: number
  autor: AutorLogado
  aoOtimista: (item: ItemDoMural) => void
  aoConfirmar: (chave: string, id: string) => void
  aoFalhar: (chave: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [jaAbriu, setJaAbriu] = useState(false)
  const [rodada, setRodada] = useState(0)
  const [rascunho, setRascunho] = useState<RascunhoDoMural | null>(null)
  const [comunidadeId, setComunidadeId] = useState(
    comunidades.find((c) => c.id === comunidadeDoFiltro)?.id ??
      comunidades[0]?.id ??
      '',
  )
  const ultimo = useRef<RascunhoDoMural>({
    titulo: '',
    textoHtml: '',
    comunidadeId: '',
  })

  // O rascunho mora no navegador: lê depois de montar, para o HTML do servidor e o primeiro desenho
  // do cliente serem iguais.
  useEffect(() => {
    try {
      const guardado = lerRascunho(window.localStorage, autor.id)
      if (guardado) {
        setRascunho(guardado)
        ultimo.current = guardado
        if (comunidades.some((c) => c.id === guardado.comunidadeId))
          setComunidadeId(guardado.comunidadeId)
      }
    } catch {
      // armazenamento bloqueado: sem rascunho
    }
  }, [autor.id, comunidades])

  // Escolher uma comunidade no filtro leva o formulário junto.
  useEffect(() => {
    if (comunidades.some((c) => c.id === comunidadeDoFiltro))
      setComunidadeId(comunidadeDoFiltro as string)
  }, [comunidadeDoFiltro, comunidades])

  function guardar(parcial: Partial<RascunhoDoMural>) {
    ultimo.current = { ...ultimo.current, ...parcial }
    try {
      guardarRascunho(window.localStorage, autor.id, ultimo.current)
    } catch {
      // sem rascunho
    }
  }

  function abrir() {
    setJaAbriu(true)
    setAberto(true)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: só o pedido novo abre; `abrir` não muda nada que importe.
  useEffect(() => {
    if (pedidoDeAbrir > 0) abrir()
  }, [pedidoDeAbrir])

  function cancelar() {
    setAberto(false)
    setRascunho(
      textoDoHtml(ultimo.current.textoHtml) || ultimo.current.titulo.trim()
        ? ultimo.current
        : null,
    )
  }

  const rotuloDoCampo = rascunho
    ? `Continuar: ${rascunho.titulo.trim() || 'rascunho guardado'}`
    : 'Pergunte ou compartilhe algo'

  return (
    <section
      aria-label="Publicar no mural"
      className="flex flex-col rounded-[var(--radius-card)] border bg-card"
    >
      <div
        className={cn(
          'flex items-center gap-3 p-3 md:p-4',
          aberto && 'pb-0 md:pb-0',
        )}
      >
        <AvatarDaPessoa pessoa={autor} />
        {aberto ? (
          <p className="text-sm font-medium">Nova publicação</p>
        ) : (
          <button
            type="button"
            onClick={abrir}
            aria-expanded={false}
            aria-controls="formulario-do-mural"
            className="pressiona-linha min-w-0 flex-1 truncate rounded-full border bg-background px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/40"
          >
            {rotuloDoCampo}
          </button>
        )}
      </div>
      <Recolhivel id="formulario-do-mural" aberto={aberto}>
        {jaAbriu && (
          <div className="flex flex-col gap-4 p-3 pt-4 md:p-4 md:pt-4">
            {comunidades.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="comunidade-da-publicacao">Comunidade</Label>
                <select
                  id="comunidade-da-publicacao"
                  value={comunidadeId}
                  onChange={(e) => {
                    setComunidadeId(e.target.value)
                    guardar({ comunidadeId: e.target.value })
                  }}
                  className="h-9 toque:h-11 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {comunidades.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <FormularioDePublicacao
              key={rodada}
              inicial={
                rascunho
                  ? {
                      titulo: rascunho.titulo,
                      textoHtml: rascunho.textoHtml,
                      anexos: [],
                    }
                  : undefined
              }
              rotuloDoBotao="Publicar"
              focarAoMontar={aberto}
              aoMudar={(d) => guardar(d)}
              aoCancelar={cancelar}
              aoEnviar={async (dados) => {
                const alvo = comunidades.find((c) => c.id === comunidadeId)
                if (!alvo) throw new Error('Escolha uma comunidade.')
                const agora = new Date()
                const chave = `novo-${dados.chaveDeEnvio}`
                aoOtimista({
                  id: chave,
                  chave,
                  estado: 'publicando',
                  titulo: dados.titulo.trim(),
                  resumo: textoDoHtml(dados.textoHtml).slice(0, 180),
                  comunidade: alvo,
                  autor,
                  criadoEm: agora,
                  ultimaAtividadeEm: agora,
                  comentarios: 0,
                  resolvida: false,
                  fixada: false,
                  comentariosBloqueados: false,
                  naoLida: false,
                })
                setAberto(false)
                try {
                  const { id } = await criarPublicacaoFn({
                    data: { comunidadeId, ...dados },
                  })
                  aoConfirmar(chave, id)
                  ultimo.current = {
                    titulo: '',
                    textoHtml: '',
                    comunidadeId,
                  }
                  guardar({})
                  setRascunho(null)
                  setRodada((r) => r + 1)
                } catch (erro) {
                  aoFalhar(chave)
                  setAberto(true)
                  throw erro
                }
              }}
            />
          </div>
        )}
      </Recolhivel>
    </section>
  )
}
