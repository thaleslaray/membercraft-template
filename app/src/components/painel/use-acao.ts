import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { filasQuery } from '#/lib/filas-queries'
import { toast } from '#/lib/toast'
import { type ErrosDoFormulario, temErros } from '#/regras/painel'

/**
 * Roda uma ação do painel: avisa o resultado e recarrega os dados da tela (P4c).
 *
 *   const { executar, ocupado, erros } = useAcao()
 *   executar(() => salvarFn({ data }), 'Aula salva.', {
 *     validar: () => validarAula(dados),                          // opcional, antes de enviar
 *     campoDoErro: (msg) => (/Vimeo/.test(msg) ? 'video' : undefined), // opcional, erro do servidor
 *   })
 *
 * - `validar` devolve os erros por campo (função pura de `regras/`). Com erro, nada é enviado, os
 *   erros vão para `erros` (ligue no `CampoDoPainel`) e o foco vai ao primeiro (`AcoesDoFormulario`).
 * - Erro do servidor vira toast, a não ser que `campoDoErro` diga a que campo ele pertence: aí
 *   aparece no campo.
 * - `sucesso` pode ser uma função do resultado da ação, para o aviso depender do que ela devolveu.
 * - `erros` esvazia a cada envio. `limparErros()` esvazia à mão.
 * - Sem opções, funciona como antes (toast no erro), para as telas que ainda não migraram.
 */
export function useAcao() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [ocupado, setOcupado] = useState(false)
  const [erros, setErros] = useState<ErrosDoFormulario>({})
  async function executar<T>(
    fazer: () => Promise<T>,
    sucesso?: string | ((resultado: T) => string),
    opcoes?: {
      validar?: () => ErrosDoFormulario
      campoDoErro?: (mensagem: string) => string | undefined
    },
  ): Promise<T | undefined> {
    const invalidos = opcoes?.validar?.()
    if (invalidos && temErros(invalidos)) {
      setErros(invalidos)
      return undefined
    }
    setErros({})
    setOcupado(true)
    try {
      const resultado = await fazer()
      const aviso = typeof sucesso === 'function' ? sucesso(resultado) : sucesso
      if (aviso) toast.success(aviso)
      await router.invalidate()
      // O que a ação fez pode ter mexido nas filas: o contador do menu atualiza junto.
      await queryClient.invalidateQueries({ queryKey: filasQuery.queryKey })
      return resultado
    } catch (e) {
      const mensagem =
        e instanceof Error ? e.message : 'Não deu certo. Tente de novo.'
      const campo = opcoes?.campoDoErro?.(mensagem)
      if (campo) setErros({ [campo]: mensagem })
      else toast.error(mensagem)
      return undefined
    } finally {
      setOcupado(false)
    }
  }
  return { executar, ocupado, erros, limparErros: () => setErros({}) }
}
