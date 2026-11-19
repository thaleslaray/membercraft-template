// Aquece, com o navegador ocioso, as duas telas do painel que ESTA pessoa mais abre: o primeiro clique
// nelas já encontra o dado em mãos, em vez de esperar a viagem ao servidor (uns 200 ms daqui aos EUA).
// A contagem fica no `localStorage` do aparelho (só caminhos do menu, nenhum dado). Só entram telas do
// menu que o perfil vê (`menuDoPainel` já filtra por permissão), então nada é aquecido sem permissão.
// Os loaders dessas telas só leem o banco; tela cujo GET chame serviço externo não pode entrar no menu
// aquecido.
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import type { FileRouteTypes } from '#/routeTree.gen'

const CHAVE = 'painel:telas-abertas'
const QUANTAS = 2

type Contagem = Record<string, number>

/** As `quantas` telas mais abertas entre as permitidas, fora a atual. Empate: a ordem do menu. */
export function telasMaisAbertas<Tela extends string>(
  contagem: Contagem,
  permitidas: Tela[],
  atual: string | undefined,
  quantas = QUANTAS,
): Tela[] {
  return permitidas
    .filter((tela) => tela !== atual && (contagem[tela] ?? 0) > 0)
    .map((tela, ordem) => ({ tela, ordem, vezes: contagem[tela] ?? 0 }))
    .sort((a, b) => b.vezes - a.vezes || a.ordem - b.ordem)
    .slice(0, quantas)
    .map((item) => item.tela)
}

// O `localStorage` pode faltar ou recusar (aba privada, dado bloqueado): sem contagem, não aquece nada.
function lerContagem(): Contagem {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '{}')
    return bruto && typeof bruto === 'object' ? (bruto as Contagem) : {}
  } catch {
    return {}
  }
}

function contarVisita(tela: string) {
  try {
    const contagem = lerContagem()
    contagem[tela] = (contagem[tela] ?? 0) + 1
    localStorage.setItem(CHAVE, JSON.stringify(contagem))
  } catch {
    // Sem onde guardar, fica sem contagem.
  }
}

/**
 * `telaAtual` é o item do menu em que a pessoa está (ou `undefined` fora do menu); `permitidas`, os
 * itens que o perfil vê, na ordem do menu.
 */
export function useAquecerTelas(
  telaAtual: FileRouteTypes['to'] | undefined,
  permitidas: FileRouteTypes['to'][],
) {
  const router = useRouter()

  useEffect(() => {
    if (telaAtual) contarVisita(telaAtual)
  }, [telaAtual])

  // Uma vez por carga da página (a lista do menu não muda sem recarregar).
  // biome-ignore lint/correctness/useExhaustiveDependencies: aquece só ao montar a casca
  useEffect(() => {
    const aquecer = () => {
      for (const tela of telasMaisAbertas(
        lerContagem(),
        permitidas,
        telaAtual,
      )) {
        // Mesmo caminho do pré-carregamento por hover: mesma chave de cache que a tela usa.
        router.preloadRoute({ to: tela }).catch(() => {})
      }
    }
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(aquecer, { timeout: 4000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(aquecer, 2000)
    return () => clearTimeout(id)
  }, [])
}
