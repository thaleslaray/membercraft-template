import * as React from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}

// Menu lateral do painel vira gaveta na tela estreita (menos de 768 px) e também na tela baixa
// (menos de 500 px de altura, como um celular deitado), onde o menu fixo deixaria itens fora da dobra.
const ALTURA_MINIMA_DO_MENU_FIXO = 500
const CONSULTA_DA_GAVETA = `(max-width: ${MOBILE_BREAKPOINT - 1}px), (max-height: ${ALTURA_MINIMA_DO_MENU_FIXO - 1}px)`

export function useMenuEmGaveta() {
  const [gaveta, setGaveta] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(CONSULTA_DA_GAVETA)
    const onChange = () => setGaveta(mql.matches)
    mql.addEventListener('change', onChange)
    setGaveta(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return gaveta
}
