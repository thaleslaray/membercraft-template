import { useLayoutEffect, useRef, useState } from 'react'
import { querMenosMovimento } from '#/lib/menos-movimento'
import {
  chaveGuardada,
  type LugarDoValor,
  lerValorGuardado,
  pontoDePartida,
  valorNoQuadro,
} from '#/lib/valor-que-cresce'

export type OndeGuardar = { usuarioId: string; lugar: LugarDoValor }

// A duração é a do token de movimento (`--mov-lento`), não um número daqui.
function duracaoDoToken(): number {
  const bruto = getComputedStyle(document.documentElement)
    .getPropertyValue('--mov-lento')
    .trim()
  const n = Number.parseFloat(bruto)
  if (!Number.isFinite(n)) return 380
  return bruto.endsWith('ms') ? n : n * 1000
}

function lerDoAparelho(onde: OndeGuardar): number | null {
  try {
    return lerValorGuardado(
      localStorage.getItem(chaveGuardada(onde.usuarioId, onde.lugar)),
    )
  } catch {
    return null
  }
}

function guardarNoAparelho(onde: OndeGuardar, valor: number) {
  try {
    localStorage.setItem(chaveGuardada(onde.usuarioId, onde.lugar), `${valor}`)
  } catch {
    // Sem armazenamento (janela privada, bloqueio): da próxima vez o número aparece direto.
  }
}

/**
 * O número que conta do último valor visto até `valor`. Na primeira vez na tela o "visto" vem do aparelho
 * (`localStorage`, por usuário e lugar); sem ele, ou com "menos movimento", mostra o valor direto. Se
 * `valor` muda com a tela aberta, conta de onde o número está até o novo, no tempo do token `--mov-lento`.
 * Termina exatamente em `valor`. Quem lê com leitor de tela deve ler `valor`, não este número.
 */
export function useValorQueCresce(valor: number, onde?: OndeGuardar): number {
  const [exibido, setExibido] = useState(valor)
  const atual = useRef(valor)
  const primeira = useRef(true)
  const usuarioId = onde?.usuarioId
  const lugar = onde?.lugar

  useLayoutEffect(() => {
    const guarda = usuarioId && lugar ? { usuarioId, lugar } : undefined
    const menosMovimento = querMenosMovimento()
    const visto = primeira.current
      ? guarda
        ? lerDoAparelho(guarda)
        : null
      : atual.current
    primeira.current = false
    if (guarda) guardarNoAparelho(guarda, valor)

    const de = pontoDePartida({ de: visto, para: valor, menosMovimento })
    if (de === null) {
      atual.current = valor
      setExibido(valor)
      return
    }
    const duracao = duracaoDoToken()
    let inicio: number | null = null
    let id = 0
    atual.current = de
    setExibido(de)
    const quadro = (agora: number) => {
      const t0 = inicio ?? agora
      inicio = t0
      const decorrido = agora - t0
      const n = valorNoQuadro(de, valor, decorrido, duracao)
      atual.current = n
      setExibido(n)
      if (decorrido < duracao) id = requestAnimationFrame(quadro)
    }
    id = requestAnimationFrame(quadro)
    return () => cancelAnimationFrame(id)
  }, [valor, usuarioId, lugar])

  return exibido
}
