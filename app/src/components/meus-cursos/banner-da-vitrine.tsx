import { useEffect } from 'react'
import {
  registrarCliqueDoBannerFn,
  registrarExibicaoDoBannerFn,
} from '#/lib/banner-fns'
import { urlDaImagem } from '#/lib/imagens'
import type { BannerDoAluno } from '#/regras/banners'

/**
 * Um banner só, abaixo dos cursos (sem carrossel). Conta uma exibição ao aparecer e um clique quando
 * a aluna abre o link. `semRegiao` é para quando vários aparecem numa lista que já tem nome (o Início
 * de quem não tem curso): sem ele, cada banner seria uma região com o mesmo rótulo.
 */
export function BannerDaVitrine({
  banner,
  semRegiao,
}: {
  banner: BannerDoAluno
  semRegiao?: boolean
}) {
  useEffect(() => {
    registrarExibicaoDoBannerFn({ data: { id: banner.id } }).catch(() => {})
  }, [banner.id])

  const computador = urlDaImagem(banner.imagemComputador) ?? ''
  const celular = urlDaImagem(banner.imagemCelular)
  const imagem = (
    <picture>
      {celular && <source media="(max-width: 767px)" srcSet={celular} />}
      <img
        src={computador}
        alt={banner.titulo}
        className="block h-auto w-full rounded-[var(--radius-card)] object-cover"
      />
    </picture>
  )
  const conteudo = banner.link ? (
    <a
      href={banner.link}
      {...(/^https?:/i.test(banner.link)
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : {})}
      className="block no-underline pressiona-cartao"
      onClick={() => {
        registrarCliqueDoBannerFn({ data: { id: banner.id } }).catch(() => {})
      }}
    >
      {imagem}
    </a>
  ) : (
    imagem
  )
  if (semRegiao) return conteudo
  return <section aria-label="Avisos e ofertas">{conteudo}</section>
}
