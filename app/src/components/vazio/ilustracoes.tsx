// Ilustrações das telas vazias (#107). Desenho da sessão principal: traço de uma cor só, currentColor.
// Não editar o traço sem revisão visual.
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

export function IlustracaoCabide(props: P) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M42 26a6 6 0 1 1 9.2 5.1c-2 1.2-3.2 2.4-3.2 4.9" />
      <path d="M48 36 17 59.5c-1.8 1.4-.8 4.5 1.5 4.5h59c2.3 0 3.3-3.1 1.5-4.5L48 36Z" />
    </svg>
  )
}

export function IlustracaoTecido(props: P) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M16 24h64" />
      <path d="M20 24c2 18-2 34 2 50 6-3 10 2 14 0s8-3 12 0 8 2 12 0 8-3 14 0c4-16 0-32 2-50" />
      <path
        d="M34 24c1.5 16-1 30 2 50M48 24c-1.5 16 1 32 0 50M62 24c1.5 16-1 30-2 50"
        opacity={0.45}
      />
    </svg>
  )
}

export function IlustracaoCartela(props: P) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <g transform="rotate(-24 48 74)">
        <rect x="40" y="16" width="16" height="58" rx="3" />
        <path d="M40 30h16M40 44h16" opacity={0.45} />
      </g>
      <g transform="rotate(24 48 74)">
        <rect x="40" y="16" width="16" height="58" rx="3" />
        <path d="M40 30h16M40 44h16" opacity={0.45} />
      </g>
      <rect
        x="40"
        y="16"
        width="16"
        height="58"
        rx="3"
        className="fill-background"
      />
      <path d="M40 30h16M40 44h16" opacity={0.45} />
      <circle cx="48" cy="66" r="2.5" />
    </svg>
  )
}

export function IlustracaoFitaMetrica(props: P) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="36" cy="44" r="18" />
      <circle cx="36" cy="44" r="4" />
      <path d="M36 62h46a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H30" />
      <path d="M42 62v4M50 62v6M58 62v4M66 62v6M74 62v4" opacity={0.45} />
    </svg>
  )
}

export function IlustracaoLinhaEAgulha(props: P) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M22 80 65 27a4.6 4.6 0 0 1 7.4 5.4Z" />
      <path d="m66.6 30.4 2.6 2" opacity={0.6} />
      <path d="M70 31c9 3 12 12 5 17s-19 2-23 10 4 15 15 13" />
    </svg>
  )
}

export function IlustracaoCarretel(props: P) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="28" y="20" width="40" height="7" rx="2" />
      <rect x="28" y="69" width="40" height="7" rx="2" />
      <path d="M34 27v42M62 27v42" />
      <path
        d="M34 34h28M34 40h28M34 46h28M34 52h28M34 58h28M34 64h28"
        opacity={0.45}
      />
      <path d="M62 58c8 2 12 8 18 6" />
    </svg>
  )
}
