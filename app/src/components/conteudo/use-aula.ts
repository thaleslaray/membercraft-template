import { useRouter } from '@tanstack/react-router'
import { useEffect, useReducer, useRef, useState } from 'react'
import { useCartela } from '#/components/conteudo/cartela'
import { useFusoDoAluno } from '#/lib/auth-queries'
import { salvarMinhaContaFn } from '#/lib/conta-fns'
import { urlDaImagem } from '#/lib/imagens'
import type { paginaDaAulaFn } from '#/lib/paginas-fns'
import {
  concluirAulaFn,
  desmarcarAulaFn,
  registrarAberturaFn,
} from '#/lib/progresso-fns'
import { toast } from '#/lib/toast'
import { marcarParaTocar } from '#/lib/tocar-a-seguir'
import {
  type Marco,
  marcoAoConcluir,
  situacaoDoModulo,
} from '#/regras/aula-nova'
import { estaLiberado, textoDoCadeado } from '#/regras/cadeado'
import { modoDoFimDoVideo } from '#/regras/fim-do-video'
import { textoSemConteudo } from '#/regras/html-seguro'
import { materiaisForaDoTexto } from '#/regras/materiais-no-texto'
import { painelInicial, reduzirPainel } from '#/regras/painel-da-aula'

type PaginaDaAula = NonNullable<Awaited<ReturnType<typeof paginaDaAulaFn>>>
/** O que o loader da aula entrega (a nota e os comentários vão para o cache do Query). */
export type DadosDaAula = Omit<PaginaDaAula, 'avaliacao' | 'comentarios'>

export type CelebracaoDoMarco = {
  marco: Marco
  anel: { total: number; feitas: number }[]
  percentual: number
}

/**
 * Lógica da página da aula, igual nas duas cascas (clássica e Lume): conclusão, painéis (fim do vídeo,
 * celebração, avaliação), "tocar a próxima sozinha", abertura registrada, teclado e liberação.
 * Cada casca só decide a aparência.
 */
export function useAula({
  dados,
  como,
  proximaAulaSozinha,
  aoTeclarL,
}: {
  dados: DadosDaAula
  como: string | undefined
  proximaAulaSozinha: boolean | null | undefined
  /** Tecla L (lista de aulas); sem ela, a tecla não faz nada. */
  aoTeclarL?: () => void
}) {
  const {
    aula,
    curso,
    modulo,
    materiais,
    anterior,
    proxima,
    modulos,
    progresso,
    concluidas,
    quiz,
    situacao,
    situacoes,
  } = dados
  const fuso = useFusoDoAluno()
  const router = useRouter()
  const comoBusca = como ? { como } : {}
  const [salvando, setSalvando] = useState(false)
  // Painéis da aula (cartão do fim do vídeo, celebração de marco, avaliação): um por vez.
  // Voltam a "assistindo" ao trocar de aula. A celebração traz o módulo ou curso que a conclusão
  // fechou, com o anel já no novo ponto.
  const [{ painel, celebracao }, despachar] = useReducer(
    reduzirPainel<CelebracaoDoMarco>,
    undefined,
    painelInicial<CelebracaoDoMarco>,
  )
  // "Começar a próxima aula sozinha": vem da sessão (padrão ligado) e muda no menu ⋯.
  const [sozinha, setSozinha] = useState(proximaAulaSozinha !== false)
  useEffect(
    () => setSozinha(proximaAulaSozinha !== false),
    [proximaAulaSozinha],
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: fecha o cartão a cada aula aberta
  useEffect(() => despachar({ tipo: 'trocouDeAula' }), [aula.id])
  const areaDoPlayer = useRef<HTMLDivElement>(null)
  const cores = useCartela(urlDaImagem(curso.capaHorizontal))
  const concluida = progresso?.concluida ?? false
  // Quiz obrigatório (ou aula do tipo quiz): só conclui depois da aprovação.
  const faltaAprovar =
    quiz !== null && (quiz.obrigatorio || quiz.soQuiz) && !quiz.aprovado
  const aulasDoModulo = modulos.find((m) => m.id === modulo.id)?.aulas ?? []
  const situacaoDoMod = situacaoDoModulo(aulasDoModulo, concluidas)

  const aulaDaProxima = modulos
    .flatMap((m) => m.aulas)
    .find((a) => a.id === proxima?.id)
  const situacaoDaProxima = proxima ? situacoes.aulas[proxima.id] : undefined
  const modoDoCartao = modoDoFimDoVideo({
    temProxima: !!proxima && situacaoDaProxima?.tipo !== 'oculto',
    liberada: estaLiberado(situacaoDaProxima),
    tocarSozinha: sozinha,
  })

  async function mudarSozinha(ligada: boolean) {
    const anteriorValor = sozinha
    setSozinha(ligada)
    try {
      await salvarMinhaContaFn({ data: { proximaAulaSozinha: ligada } })
      await router.invalidate()
    } catch (erro) {
      setSozinha(anteriorValor)
      toast.error(
        erro instanceof Error ? erro.message : 'Não foi possível salvar.',
      )
    }
  }

  function irParaAProxima() {
    if (!proxima) return
    marcarParaTocar(proxima.id)
    void router.navigate({
      to: '/aulas/$aulaId',
      params: { aulaId: proxima.id },
      search: como ? { como } : {},
    })
  }

  // "Ficar aqui" (e Esc): fecha o cartão e devolve o foco ao player.
  function ficarAqui() {
    despachar({ tipo: 'fechar' })
    areaDoPlayer.current?.querySelector('iframe')?.focus()
  }

  // A aula aberta vira a "última aula aberta" do curso (alimenta o "Continuar assistindo").
  const travada = situacao.tipo === 'cadeado'
  // Depois de registrar, o cache de páginas pré-carregadas é descartado (o "Continuar assistindo" do
  // Início mudou) e só então a próxima aula é pré-carregada, para o "Próxima" abrir na hora.
  const proximaId = proxima?.id
  useEffect(() => {
    if (travada) return
    let cancelado = false
    void (async () => {
      await registrarAberturaFn({ data: { aulaId: aula.id } }).catch(() => {})
      if (cancelado) return
      router.clearCache()
      if (proximaId) {
        void router
          .preloadRoute({
            to: '/aulas/$aulaId',
            params: { aulaId: proximaId },
            search: como ? { como } : {},
          })
          .catch(() => {})
      }
    })()
    return () => {
      cancelado = true
    }
  }, [aula.id, travada, proximaId, como, router])

  // Teclado: ← aula anterior, → próxima, L abre e fecha a lista. Não vale dentro de campos, abas,
  // carinhas e janelas, que usam as teclas para outra coisa.
  const anteriorId = anterior?.id
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const ehLista = e.key === 'l' || e.key === 'L'
      if (!ehLista && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const alvo = e.target instanceof HTMLElement ? e.target : null
      if (
        alvo?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="tablist"], [role="radiogroup"], [role="slider"]',
        )
      )
        return
      if (ehLista) {
        if (!aoTeclarL) return
        e.preventDefault()
        aoTeclarL()
        return
      }
      const destino = e.key === 'ArrowLeft' ? anteriorId : proximaId
      if (!destino) return
      e.preventDefault()
      void router.navigate({
        to: '/aulas/$aulaId',
        params: { aulaId: destino },
        search: como ? { como } : {},
      })
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [anteriorId, proximaId, como, router, aoTeclarL])

  const fechou = () => marcoAoConcluir(modulos, concluidas, aula.id, modulo.id)

  async function alternarConclusao() {
    // aria-disabled não bloqueia o clique sozinho: o guard ignora enquanto grava ou falta o quiz.
    if (salvando || (faltaAprovar && !concluida)) return
    setSalvando(true)
    try {
      if (concluida) {
        await desmarcarAulaFn({ data: { aulaId: aula.id } })
        toast.success('Conclusão desmarcada.')
      } else {
        const marco = fechou()
        await concluirAulaFn({ data: { aulaId: aula.id } })
        // Sem aviso: o botão e o ✓ da lista mudam. Só um marco ganha tela.
        despachar({ tipo: 'concluiu', marco, silencioso: false })
      }
      await router.invalidate()
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : 'Não foi possível salvar.',
      )
    } finally {
      setSalvando(false)
    }
  }

  // Aula sem vídeo, texto, materiais nem quiz (na Memberkit, a "Avaliação do módulo" é assim:
  // serve só para a nota e os comentários). Diz o que fazer ali.
  const textoVisivel = !textoSemConteudo(aula.textoHtml ?? '')
  const semConteudo =
    !aula.vimeoId &&
    !textoVisivel &&
    materiaisForaDoTexto(materiais, aula.textoHtml).length === 0 &&
    !quiz
  // Aula de vídeo se conclui sozinha; sem vídeo, o botão vem no fim do conteúdo.
  const concluiPeloBotao = !aula.vimeoId

  return {
    fuso,
    comoBusca,
    salvando,
    painel,
    celebracao,
    despachar,
    fim: painel === 'fim',
    avaliando: painel === 'avaliando',
    sozinha,
    mudarSozinha,
    areaDoPlayer,
    cores,
    concluida,
    faltaAprovar,
    situacaoDoMod,
    aulaDaProxima,
    situacaoDaProxima,
    modoDoCartao,
    irParaAProxima,
    ficarAqui,
    travada,
    fechou,
    alternarConclusao,
    textoVisivel,
    semConteudo,
    concluiPeloBotao,
    textoDoCadeado,
    /** Vídeo concluído (90%): em silêncio; se fechou um marco, a tela dele espera o fim do vídeo. */
    aoConcluirVideo: () => {
      despachar({ tipo: 'concluiu', marco: fechou(), silencioso: true })
      void router.invalidate()
    },
    /** Vídeo terminou: o reducer celebra o marco pendente ou mostra o cartão. */
    aoTerminarVideo: () => despachar({ tipo: 'terminou' }),
  }
}
