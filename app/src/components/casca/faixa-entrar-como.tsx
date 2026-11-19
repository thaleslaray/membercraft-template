import { useState } from 'react'
import { sairDeEntrarComoFn } from '#/lib/entrar-como-fns'
import { toast } from '#/lib/toast'

/** Altura da faixa: as barras da casca descem esse tanto (`--faixa-entrar-como`, 0 sem a faixa). */
export const ALTURA_DA_FAIXA = '3.25rem'

// Faixa fixa no topo de toda a área do aluno enquanto a Equipe vê a escola como esta aluna. Usa as
// cores invertidas do tema (fundo = texto, texto = fundo): o contraste vem do próprio par de tokens.
export function FaixaEntrarComo({ nome }: { nome: string }) {
  const [saindo, setSaindo] = useState(false)
  async function voltar() {
    setSaindo(true)
    try {
      const { voltou, alunaId } = await sairDeEntrarComoFn()
      // Carga completa: a sessão mudou, nenhum dado em memória vale mais.
      window.location.assign(voltou ? `/painel/alunos/${alunaId}` : '/login')
    } catch {
      toast.error('Não foi possível voltar para a sua conta. Tente de novo.')
      setSaindo(false)
    }
  }
  return (
    <section
      aria-label="Você está vendo como outra pessoa"
      data-testid="faixa-entrar-como"
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 bg-foreground px-4 text-background text-sm md:px-6"
      style={{ height: ALTURA_DA_FAIXA }}
    >
      <p className="min-w-0 truncate">
        Você está vendo como <strong className="font-semibold">{nome}</strong>
      </p>
      <button
        type="button"
        onClick={voltar}
        disabled={saindo}
        className="min-h-11 shrink-0 rounded-md bg-background px-4 font-medium text-foreground outline-offset-2 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-background disabled:opacity-60"
      >
        Voltar para a minha conta
      </button>
    </section>
  )
}
