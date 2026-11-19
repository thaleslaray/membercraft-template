import { Link, useRouter } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { BOTAO_FORTE } from '#/components/casca-lume/pagina-lume'
import { BannerDaVitrine } from '#/components/meus-cursos/banner-da-vitrine'
import { Button } from '#/components/ui/button'
import { sairDaConta } from '#/lib/sair'
import { cn } from '#/lib/utils'
import type { BannerDoAluno } from '#/regras/banners'

const ALVO_DE_TOQUE = 'toque:h-11'

/**
 * Início de quem entrou e não tem nenhum curso (casca Lume). Em vez de uma tela vazia, responde as
 * três dúvidas de quem chega aqui (com que e-mail entrei, por que o curso não apareceu, com quem
 * falo) e mostra todos os banners que valem para a pessoa, como vitrine da escola. Página de
 * revista: texto direto no papel, passos separados por fio e a cor fica com as ilustrações.
 */
export function InicioSemCurso({
  nome,
  email,
  banners,
}: {
  nome: string
  email: string
  banners: BannerDoAluno[]
}) {
  const router = useRouter()
  const [atualizando, setAtualizando] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const primeiroNome = nome.trim().split(/\s+/)[0]

  return (
    <main className="flex flex-1 flex-col pb-20">
      <header className="grid max-w-[46rem] gap-3 box-content px-(--pad) pt-12 lume-cel:pt-7">
        <span className="font-manuscrito text-[clamp(22px,1.9vw,28px)] leading-none text-muted-foreground">
          {primeiroNome ? `Boas-vindas, ${primeiroNome}` : 'Boas-vindas'}
        </span>
        <h1 className="font-display text-[clamp(28px,3.6vw,48px)] leading-[1.06] tracking-[-0.025em] text-balance">
          Ainda não há cursos nesta conta
        </h1>
        <p className="max-w-[38rem] text-[17px] leading-relaxed text-muted-foreground lume-cel:text-base">
          Você entrou com{' '}
          <strong className="font-semibold text-foreground [overflow-wrap:anywhere]">
            {email}
          </strong>
          . Quando uma compra é confirmada nesse e-mail, o curso aparece aqui.
        </p>
      </header>

      <section aria-label="O que fazer agora" className="px-(--pad) pt-10">
        <ul className="grid max-w-[1100px] border-t border-border lume-tela:grid-cols-3">
          <Passo
            titulo="Acabou de comprar?"
            texto="A liberação costuma levar alguns minutos depois que o pagamento é aprovado."
          >
            <Button
              variant="outline"
              className={ALVO_DE_TOQUE}
              aria-disabled={atualizando}
              onClick={() => {
                if (atualizando) return
                setAtualizando(true)
                void router.invalidate().finally(() => setAtualizando(false))
              }}
            >
              {atualizando ? 'Atualizando…' : 'Atualizar a página'}
            </Button>
          </Passo>
          <Passo
            titulo="Comprou com outro e-mail?"
            texto="O curso fica no e-mail usado na compra. Saia e entre de novo com ele."
          >
            <Button
              variant="outline"
              className={ALVO_DE_TOQUE}
              aria-disabled={saindo}
              onClick={() => {
                if (saindo) return
                setSaindo(true)
                void sairDaConta().catch(() => setSaindo(false))
              }}
            >
              {saindo ? 'Saindo…' : 'Entrar com outro e-mail'}
            </Button>
          </Passo>
          <Passo
            titulo="Não é nenhum dos dois?"
            texto="A equipe confere a sua compra e libera o acesso."
          >
            <Button asChild className={cn(BOTAO_FORTE, ALVO_DE_TOQUE)}>
              <Link to="/atendimento">Falar com a equipe</Link>
            </Button>
          </Passo>
        </ul>
      </section>

      {banners.length > 0 && (
        <section
          aria-label="Cursos da escola"
          className="grid gap-4 px-(--pad) pt-14 lume-cel:pt-10"
        >
          <h2 className="font-display text-lg leading-6 tracking-[-0.02em]">
            Conheça os cursos da escola
          </h2>
          <ul
            className={cn(
              'grid max-w-[1500px] gap-5',
              banners.length > 1 && 'lume-tela:grid-cols-2',
            )}
          >
            {banners.map((b) => (
              <li key={b.id}>
                <BannerDaVitrine banner={b} semRegiao />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

/** Um passo: pergunta, uma linha de resposta e a ação. Sem caixa; o fio separa um do outro. */
function Passo({
  titulo,
  texto,
  children,
}: {
  titulo: string
  texto: string
  children: ReactNode
}) {
  return (
    <li className="grid grid-rows-[auto_1fr_auto] justify-items-start gap-2 border-b border-border py-6 lume-tela:border-b-0 lume-tela:border-l lume-tela:px-7 lume-tela:py-7 lume-tela:first:border-l-0 lume-tela:first:pl-0">
      <h2 className="text-[17px] leading-snug font-semibold text-foreground">
        {titulo}
      </h2>
      <p className="max-w-[30ch] text-[15px] leading-relaxed text-muted-foreground lume-cel:max-w-none">
        {texto}
      </p>
      <div className="pt-2">{children}</div>
    </li>
  )
}
