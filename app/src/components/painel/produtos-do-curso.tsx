import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { produtosDaHotmartFn } from '#/lib/hotmart-ligacao-fns'
import type { LigacaoDaTurma } from '#/regras/grupo-de-ligacoes'

// "Quem compra": em leitura, o que libera esta edição. Quem muda é Vendas → Produtos (Proprietário). Os nomes dos
// produtos vêm da Hotmart e só quem pode ligar produto os vê; a Equipe vê o código.
export function ProdutosDoCurso({
  ligacoes,
  podeLigar,
}: {
  ligacoes: LigacaoDaTurma[]
  podeLigar: boolean
}) {
  const [nomes, setNomes] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!podeLigar) return
    let ativo = true
    produtosDaHotmartFn()
      .then(
        (c) =>
          ativo && setNomes(new Map(c.produtos.map((p) => [p.id, p.nome]))),
      )
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [podeLigar])

  const produto = (id: string) => {
    const nome = nomes.get(id)
    return nome ? `${nome} (${id})` : `Produto ${id}`
  }

  return (
    <section
      aria-label="Quem compra"
      className="flex flex-col gap-3 border-t bg-muted/30 px-3 py-3"
    >
      {ligacoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma compra libera esta edição.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {ligacoes.map((l) => (
            <li key={l.id}>
              Liberado por: {produto(l.produtoId)} ·{' '}
              {l.ofertaHash ? `Oferta ${l.ofertaHash}` : 'Todas as ofertas'}
            </li>
          ))}
        </ul>
      )}
      {podeLigar && (
        <p className="text-sm">
          <Link
            to="/painel/vendas/produtos"
            className="font-medium underline underline-offset-4"
          >
            Mudar em Vendas → Produtos
          </Link>
        </p>
      )}
    </section>
  )
}
