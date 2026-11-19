/**
 * Tabela do painel (P3). No computador, tabela com moldura; abaixo de `md`, cada linha vira um
 * cartão empilhado só com as colunas `essencial`. O mesmo HTML serve aos dois (sem duplicar linhas).
 *
 *   <TabelaDoPainel
 *     rotulo="Avisos recebidos"                    // nome acessível da tabela
 *     linhas={avisos}
 *     chave={(a) => a.id}
 *     testIdDaLinha={(a) => `aviso-${a.id}`}       // opcional, para o e2e (no lugar de aria-label no <tr>)
 *     colunas={[
 *       { rotulo: 'Aluno', essencial: true, celula: (a) => a.nome },
 *       { rotulo: 'Valor', numero: true, celula: (a) => formatarReais(a.valor) },
 *       { rotulo: 'Situação', essencial: true, className: 'min-w-36', celula: (a) => <EtiquetaDeEstado ... /> },
 *       { rotulo: 'Ações', rotuloOculto: true, essencial: true, celula: (a) => <Button>...</Button> },
 *     ]}
 *   />
 *
 * Coluna: `numero` alinha à direita com `tabular-nums`; `essencial` aparece no cartão do celular;
 * `rotuloOculto` deixa o cabeçalho só para leitor de tela (e sem rótulo no cartão); `className` vai
 * no `<td>` e no `<th>` (ex.: largura mínima). O texto quebra linha. Se a tabela não couber na
 * largura, ela rola de lado com sombra na borda, foco pelo teclado e `role=region`.
 * Lista vazia: passe `vazio` (ex.: `<VazioDoPainel ... />`), que aparece no lugar da tabela.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '#/lib/utils'

export type ColunaDaTabela<T> = {
  rotulo: string
  celula: (linha: T) => ReactNode
  numero?: boolean
  essencial?: boolean
  rotuloOculto?: boolean
  className?: string
}

// A tabela vira bloco no celular, e o navegador tira dela o papel de tabela quando o `display`
// muda: os papéis explícitos devolvem a semântica (cabeçalhos e células) ao leitor de tela.
const PAPEL = {
  tabela: 'table',
  linha: 'row',
  cabecalho: 'columnheader',
  celula: 'cell',
} as const

export function TabelaDoPainel<T>({
  rotulo,
  colunas,
  linhas,
  chave,
  testIdDaLinha,
  vazio,
}: {
  rotulo: string
  colunas: ColunaDaTabela<T>[]
  linhas: T[]
  chave: (linha: T) => string
  testIdDaLinha?: (linha: T) => string
  vazio?: ReactNode
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const rola = useRolaDeLado(caixa)
  if (linhas.length === 0 && vazio) return <>{vazio}</>
  return (
    <div
      ref={caixa}
      // Só quando rola de lado: vira região com nome e recebe foco pelo teclado.
      {...(rola
        ? {
            role: 'region',
            'aria-label': `${rotulo} (role de lado para ver tudo)`,
            tabIndex: 0,
          }
        : {})}
      className="min-w-0 md:rolagem-com-sinal md:rounded-[var(--radius-card)] md:border md:bg-card md:shadow-[var(--shadow-card)] md:[--rolagem-fundo:var(--card)]"
    >
      <table
        role={PAPEL.tabela}
        aria-label={rotulo}
        className="w-full text-left text-sm max-md:block"
      >
        <thead className="max-md:sr-only">
          <tr role={PAPEL.linha} className="border-b">
            {colunas.map((c) => (
              <th
                key={c.rotulo}
                role={PAPEL.cabecalho}
                scope="col"
                className={cn(
                  'px-4 py-3 align-bottom text-xs font-medium text-muted-foreground',
                  c.numero && 'text-right',
                  c.className,
                )}
              >
                {c.rotuloOculto ? (
                  <span className="sr-only">{c.rotulo}</span>
                ) : (
                  c.rotulo
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
          {linhas.map((linha) => (
            <tr
              key={chave(linha)}
              role={PAPEL.linha}
              data-testid={testIdDaLinha?.(linha)}
              className="border-b last:border-0 hover:bg-muted/40 max-md:flex max-md:flex-col max-md:gap-2 max-md:rounded-[var(--radius-card)] max-md:border max-md:bg-card max-md:p-4 max-md:shadow-[var(--shadow-card)] max-md:last:border max-md:hover:bg-card"
            >
              {colunas.map((c) => (
                <td
                  key={c.rotulo}
                  role={PAPEL.celula}
                  className={cn(
                    'px-4 py-3 align-top break-words max-md:p-0',
                    c.numero && 'text-right tabular-nums max-md:text-left',
                    c.essencial
                      ? 'max-md:flex max-md:min-w-0 max-md:items-baseline max-md:gap-3'
                      : 'max-md:hidden',
                    c.className,
                  )}
                >
                  {c.essencial && !c.rotuloOculto ? (
                    <span
                      aria-hidden="true"
                      className="w-24 shrink-0 text-xs text-muted-foreground md:hidden"
                    >
                      {c.rotulo}
                    </span>
                  ) : null}
                  <div className="min-w-0 max-md:flex-1">{c.celula(linha)}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// A caixa rola de lado? Só aí ela ganha foco pelo teclado e nome de região.
function useRolaDeLado(caixa: React.RefObject<HTMLDivElement | null>) {
  const [rola, setRola] = useState(false)
  useEffect(() => {
    const el = caixa.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const medir = () => setRola(el.scrollWidth > el.clientWidth + 1)
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    if (el.firstElementChild) observador.observe(el.firstElementChild)
    medir()
    return () => observador.disconnect()
  }, [caixa])
  return rola
}
