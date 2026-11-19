import { Link, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { VazioDoPainel } from '#/components/painel/estados'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import {
  desmarcarCursoNaOfertaFn,
  type liberacaoDaHotmartFn,
  marcarCursoNaOfertaFn,
  ofertasDaHotmartFn,
} from '#/lib/hotmart-ligacao-fns'
import {
  type CursoMarcado,
  ofertasParaMostrar,
} from '#/regras/liberacao-por-produto'

type Dados = Awaited<ReturnType<typeof liberacaoDaHotmartFn>>
type Curso = Dados['cursos'][number]

// Vendas › Produtos da Hotmart: por produto, as caixinhas de CURSO que cada compra libera. Marcar salva na hora.
export function LigacoesDaHotmart({ dados }: { dados: Dados }) {
  const { liberacoes, cursos, produtos, situacao, erro } = dados

  const doCatalogo = new Map(produtos.map((p) => [p.id, p]))
  const ids = [
    ...new Set([...liberacoes.map((l) => l.produtoId), ...doCatalogo.keys()]),
  ]
  const temCurso = (id: string) => {
    const l = liberacoes.find((x) => x.produtoId === id)
    return !!l && (l.qualquerOferta.length > 0 || l.ofertas.length > 0)
  }
  const ordenados = [
    ...ids.filter((id) => liberacoes.some((l) => l.produtoId === id)),
    ...ids.filter((id) => !liberacoes.some((l) => l.produtoId === id)),
  ]

  return (
    <section
      aria-labelledby="produtos-da-hotmart"
      className="flex flex-col gap-6"
    >
      <div>
        <h2
          id="produtos-da-hotmart"
          className="text-lg font-semibold tracking-tight"
        >
          Produtos da Hotmart
        </h2>
        <p className="text-muted-foreground">
          Marque os cursos que cada compra libera. Uma oferta libera os cursos
          de “Qualquer oferta” mais os que você marcar nela.
        </p>
      </div>

      {situacao === 'sem-credencial' && (
        <VazioDoPainel
          titulo="A Hotmart ainda não está conectada"
          mensagem="Cole as credenciais para ver os nomes dos produtos aqui."
          acao={
            <Button asChild variant="outline">
              <Link to="/painel/vendas/plataformas">
                Abrir as credenciais da Hotmart
              </Link>
            </Button>
          }
        />
      )}
      {situacao === 'erro' && (
        <Card>
          <CardContent className="pt-6 text-sm" role="alert">
            {erro} Se o problema continuar, confira as{' '}
            <Link
              to="/painel/vendas/plataformas"
              className="font-medium underline underline-offset-4"
            >
              credenciais da Hotmart
            </Link>
            .
          </CardContent>
        </Card>
      )}

      {ordenados.length === 0 && situacao === 'ok' && (
        <VazioDoPainel
          titulo="Nenhum produto na Hotmart ainda"
          mensagem="Crie o produto na Hotmart; ele aparece aqui para você marcar os cursos que a compra libera."
        />
      )}

      {ordenados.map((id) => (
        <CartaoDoProduto
          key={id}
          produtoId={id}
          nome={doCatalogo.get(id)?.nome ?? null}
          ucode={doCatalogo.get(id)?.ucode ?? null}
          liberacao={liberacoes.find((l) => l.produtoId === id)}
          cursos={cursos}
          vazio={!temCurso(id)}
        />
      ))}
    </section>
  )
}

function CartaoDoProduto({
  produtoId,
  nome,
  ucode,
  liberacao,
  cursos,
  vazio,
}: {
  produtoId: string
  nome: string | null
  ucode: string | null
  liberacao: Dados['liberacoes'][number] | undefined
  cursos: Curso[]
  vazio: boolean
}) {
  const [carregadas, setCarregadas] = useState<
    { codigo: string; nome: string }[] | null
  >(null)
  const [carregando, setCarregando] = useState(false)
  const [erroDasOfertas, setErroDasOfertas] = useState<string | null>(null)

  const qualquer = liberacao?.qualquerOferta ?? []
  const comLigacao = liberacao?.ofertas ?? []

  // Ofertas que já têm ligação aparecem abertas; as demais, só depois de "Ver ofertas".
  const ofertas = ofertasParaMostrar(comLigacao, carregadas)

  const buscarOfertas = useCallback(async () => {
    if (!ucode) return
    setCarregando(true)
    setErroDasOfertas(null)
    const r = await ofertasDaHotmartFn({ data: { ucode } }).catch(() => null)
    setCarregando(false)
    if (!r) {
      setErroDasOfertas('Não consegui carregar as ofertas. Tente de novo.')
      return
    }
    setErroDasOfertas(r.erro)
    setCarregadas(
      r.ofertas.map((o) => ({
        codigo: o.codigo,
        nome: o.nome || (o.principal ? 'Oferta principal' : 'Oferta'),
      })),
    )
  }, [ucode])

  // Produto com oferta já ligada: busca os nomes sozinho. Se falhar, ficam os códigos (e o botão).
  const temOfertaLigada = comLigacao.length > 0
  useEffect(() => {
    if (temOfertaLigada) void buscarOfertas()
  }, [temOfertaLigada, buscarOfertas])

  return (
    <section aria-labelledby={`produto-${produtoId}`} className="min-w-0">
      <Card>
        <CardHeader>
          <h3
            id={`produto-${produtoId}`}
            className="text-base leading-snug font-semibold break-words"
          >
            {nome ?? `Produto ${produtoId}`}{' '}
            <span className="font-normal text-muted-foreground">
              · {produtoId}
            </span>
          </h3>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {vazio && (
            <p className="text-sm text-muted-foreground">
              Nenhum curso marcado: a venda chega e não matricula ninguém.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Qualquer oferta libera</h3>
            <GradeDeCursos
              cursos={cursos}
              produtoId={produtoId}
              ofertaHash=""
              marcados={qualquer}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-semibold">Ofertas</h3>
              {ucode && !carregadas && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={carregando}
                  onClick={buscarOfertas}
                >
                  {carregando ? 'Carregando…' : 'Ver ofertas'}
                </Button>
              )}
            </div>
            {erroDasOfertas && (
              <p className="text-sm text-destructive" role="alert">
                {erroDasOfertas}
              </p>
            )}
            {ofertas.length === 0 && carregadas && !erroDasOfertas && (
              <p className="text-sm text-muted-foreground">
                Este produto não tem ofertas além da principal.
              </p>
            )}
            {ofertas.map((o) => (
              <div key={o.ofertaHash} className="flex flex-col gap-2">
                <h4 className="text-sm">
                  <span className="font-medium">{o.nome ?? 'Oferta'}</span>{' '}
                  <span className="text-muted-foreground">
                    · {o.ofertaHash} — também libera
                  </span>
                </h4>
                <GradeDeCursos
                  cursos={cursos}
                  produtoId={produtoId}
                  ofertaHash={o.ofertaHash}
                  marcados={o.marcados}
                  herdados={qualquer}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

// Caixinhas de curso: 2 colunas no computador, 1 no celular (alvo de toque de 44px). Salva na hora.
function GradeDeCursos({
  cursos,
  produtoId,
  ofertaHash,
  marcados,
  herdados = [],
}: {
  cursos: Curso[]
  produtoId: string
  ofertaHash: string
  marcados: CursoMarcado[]
  herdados?: CursoMarcado[]
}) {
  const router = useRouter()
  const [pendentes, setPendentes] = useState<Set<string>>(new Set())
  const [erros, setErros] = useState<Record<string, string>>({})

  async function alternar(cursoId: string, marcar: boolean) {
    setPendentes((p) => new Set(p).add(cursoId))
    setErros(({ [cursoId]: _, ...resto }) => resto)
    try {
      const fn = marcar ? marcarCursoNaOfertaFn : desmarcarCursoNaOfertaFn
      await fn({ data: { produtoId, ofertaHash, cursoId } })
      await router.invalidate()
    } catch (e) {
      setErros((r) => ({
        ...r,
        [cursoId]:
          e instanceof Error && e.message
            ? e.message
            : 'Não salvou. Tente de novo.',
      }))
    } finally {
      setPendentes((p) => {
        const novo = new Set(p)
        novo.delete(cursoId)
        return novo
      })
    }
  }

  if (cursos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        A escola ainda não tem cursos.
      </p>
    )
  }
  return (
    <ul
      aria-label={
        ofertaHash
          ? `Cursos da oferta ${ofertaHash}`
          : 'Cursos de qualquer oferta'
      }
      className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2"
    >
      {cursos.map((c) => {
        const ligado = marcados.find((m) => m.cursoId === c.id)
        const herdado =
          ofertaHash !== '' && herdados.some((h) => h.cursoId === c.id)
        const salvando = pendentes.has(c.id)
        const id = `curso-${produtoId}-${ofertaHash || 'todas'}-${c.id}`
        return (
          <li key={c.id} className="flex flex-col">
            <label
              htmlFor={id}
              aria-busy={salvando}
              className="flex min-h-11 cursor-pointer items-center gap-3 text-sm md:min-h-8"
            >
              <Checkbox
                id={id}
                checked={herdado || !!ligado}
                disabled={herdado || salvando}
                onCheckedChange={(v) => alternar(c.id, v === true)}
                className="size-5 md:size-4"
              />
              <span className="min-w-0 flex-1">
                {c.nome}
                {herdado && (
                  <span className="block text-xs text-muted-foreground">
                    já vem em qualquer oferta
                  </span>
                )}
                {!herdado && ligado?.pelaEdicao && (
                  <span className="block text-xs text-muted-foreground">
                    pela edição {ligado.pelaEdicao}
                  </span>
                )}
              </span>
              {salvando && (
                <span className="text-xs text-muted-foreground">Salvando…</span>
              )}
            </label>
            {erros[c.id] && (
              <p className="pb-1 pl-8 text-xs text-destructive" role="alert">
                {erros[c.id]}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
