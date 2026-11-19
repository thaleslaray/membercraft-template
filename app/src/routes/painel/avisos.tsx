import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { CabecalhoDaPagina, PaginaDoPainel } from '#/components/painel/pagina'
import { useAcao } from '#/components/painel/use-acao'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  ajustesDeAvisoFn,
  salvarAjustesDeAvisoFn,
} from '#/lib/notificacoes-fns'
import type { ErrosDoFormulario } from '#/regras/painel'

export const Route = createFileRoute('/painel/avisos')({
  loader: () => ajustesDeAvisoFn(),
  head: () => ({ meta: [{ title: 'Avisos · Estúdio' }] }),
  component: Avisos,
})

const CAMPOS = [
  {
    campo: 'diasAcessoExpirando',
    rotulo: 'Acesso expirando',
    ajuda: 'Quantos dias antes de a matrícula expirar o aluno é avisado.',
  },
  {
    campo: 'diasAcessoPronto',
    ligado: 'acessoProntoLigado',
    rotulo: 'Seu acesso está pronto',
    ajuda:
      'Quantos dias depois da matrícula, se o aluno nunca entrou, ele recebe o lembrete com o link de entrada.',
  },
  {
    campo: 'diasSentimosSuaFalta',
    ligado: 'sentimosSuaFaltaLigado',
    rotulo: 'Sentimos sua falta',
    ajuda:
      'Quantos dias sem acessar até o aluno receber o convite para voltar.',
  },
] as const

function Avisos() {
  const ajustes = Route.useLoaderData()
  const [valores, setValores] = useState({
    diasAcessoExpirando: String(ajustes.diasAcessoExpirando),
    diasAcessoPronto: String(ajustes.diasAcessoPronto),
    diasSentimosSuaFalta: String(ajustes.diasSentimosSuaFalta),
  })
  const [ligados, setLigados] = useState({
    acessoProntoLigado: ajustes.acessoProntoLigado,
    sentimosSuaFaltaLigado: ajustes.sentimosSuaFaltaLigado,
  })
  const { executar, ocupado, erros } = useAcao()
  const alterado =
    CAMPOS.some(({ campo }) => valores[campo] !== String(ajustes[campo])) ||
    ligados.acessoProntoLigado !== ajustes.acessoProntoLigado ||
    ligados.sentimosSuaFaltaLigado !== ajustes.sentimosSuaFaltaLigado

  function validar(): ErrosDoFormulario {
    const resultado: ErrosDoFormulario = {}
    for (const { campo } of CAMPOS) {
      const n = Number(valores[campo])
      if (!Number.isInteger(n) || n < 1 || n > 365) {
        resultado[campo] = 'Informe um número inteiro de 1 a 365 dias.'
      }
    }
    return resultado
  }

  return (
    <PaginaDoPainel>
      <CabecalhoDaPagina
        titulo="Avisos"
        contexto="Avisos agendados: rodam uma vez por dia, de madrugada, e cada aviso sai uma vez por ciclo. Conteúdo liberado não tem ajuste: sai no dia da regra de liberação."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Dias e interruptor de cada aviso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              executar(
                () =>
                  salvarAjustesDeAvisoFn({
                    data: {
                      diasAcessoExpirando: Number(valores.diasAcessoExpirando),
                      diasAcessoPronto: Number(valores.diasAcessoPronto),
                      diasSentimosSuaFalta: Number(
                        valores.diasSentimosSuaFalta,
                      ),
                      ...ligados,
                    },
                  }),
                'Dias salvos.',
                { validar },
              )
            }}
          >
            {CAMPOS.map((item) => {
              const { campo, rotulo, ajuda } = item
              const ligado = 'ligado' in item ? item.ligado : undefined
              return (
                <div key={campo} className="flex flex-col gap-3">
                  <CampoDoPainel
                    rotulo={`${rotulo} (dias)`}
                    ajuda={ajuda}
                    erro={erros[campo]}
                  >
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={365}
                      className="w-32"
                      value={valores[campo]}
                      onChange={(e) =>
                        setValores({ ...valores, [campo]: e.target.value })
                      }
                    />
                  </CampoDoPainel>
                  {ligado && (
                    <div className="flex min-h-11 items-center gap-2">
                      <Checkbox
                        id={ligado}
                        checked={ligados[ligado]}
                        onCheckedChange={(v) =>
                          setLigados({ ...ligados, [ligado]: v === true })
                        }
                      />
                      <Label htmlFor={ligado}>Ligado</Label>
                    </div>
                  )}
                </div>
              )
            })}
            <AcoesDoFormulario
              salvar="Salvar avisos"
              ocupado={ocupado}
              alterado={alterado}
              erros={erros}
            />
          </form>
        </CardContent>
      </Card>
    </PaginaDoPainel>
  )
}
