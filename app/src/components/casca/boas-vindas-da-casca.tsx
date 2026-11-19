import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { BoasVindas } from '#/components/casca/boas-vindas'
import { boasVindasQuery } from '#/lib/configuracao-queries'
import { marcarTourVistoFn } from '#/lib/conta-fns'

/**
 * Vídeo de boas-vindas (#101), comum às duas cascas: sem vídeo configurado nada aparece. No primeiro
 * acesso abre sozinho, uma vez; assistir ou pular grava o marcador (o do tour antigo) e não volta mais.
 * `reverBoasVindas` vai para o menu do avatar (só existe com vídeo); `janela` vai no fim da casca.
 */
export function useBoasVindasDaCasca() {
  const queryClient = useQueryClient()
  const { data: boasVindas } = useQuery(boasVindasQuery)
  const [aberta, setAberta] = useState(false)
  const [primeiraVez, setPrimeiraVez] = useState(false)
  const jaAbriu = useRef(false)
  useEffect(() => {
    if (boasVindas?.url && boasVindas.abrirSozinho && !jaAbriu.current) {
      jaAbriu.current = true
      setPrimeiraVez(true)
      setAberta(true)
    }
  }, [boasVindas])
  async function marcarComoVistas() {
    if (!primeiraVez) return
    setPrimeiraVez(false)
    queryClient.setQueryData(boasVindasQuery.queryKey, (antigo) =>
      antigo ? { ...antigo, abrirSozinho: false } : antigo,
    )
    try {
      await marcarTourVistoFn()
    } catch {
      // Sem rede: aparece de novo no próximo acesso, o que é inofensivo.
    }
  }

  return {
    reverBoasVindas: boasVindas?.url ? () => setAberta(true) : undefined,
    janela: boasVindas?.url ? (
      <BoasVindas
        url={boasVindas.url}
        aberto={aberta}
        primeiraVez={primeiraVez}
        aoFechar={() => {
          setAberta(false)
          void marcarComoVistas()
        }}
        aoAssistir={() => void marcarComoVistas()}
      />
    ) : null,
  }
}
