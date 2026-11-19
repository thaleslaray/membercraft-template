import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  APOIO_NA_REGUA,
  BOTAO_FORTE,
  TITULO_DE_APOIO,
} from '#/components/casca-lume/pagina-lume'
import { CartaoDeCertificado } from '#/components/certificados/cartao-de-certificado'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { EsqueletoDeCertificados } from '#/components/vazio/esqueletos'
import {
  AcaoContinuarEstudando,
  TelaVazia,
} from '#/components/vazio/tela-vazia'
import { appConfig } from '#/config/app'
import { useFusoDoAluno } from '#/lib/auth-queries'
import { confirmarNomeFn, meusCertificadosFn } from '#/lib/certificados-fns'
import { toast } from '#/lib/toast'
import { LIMITE_DO_NOME } from '#/regras/certificados'

// Certificados do aluno: baixa mesmo com o acesso expirado. Antes da primeira emissão ele confirma
// como o nome sai no certificado.
export const Route = createFileRoute('/_aluno/certificados')({
  head: () => ({ meta: [{ title: `Certificados · ${appConfig.name}` }] }),
  loader: () => meusCertificadosFn(),
  pendingComponent: EsqueletoDeCertificados,
  component: Certificados,
})

function Certificados() {
  const fuso = useFusoDoAluno()
  const { certificados, nome, aguardandoNome } = Route.useLoaderData()
  const router = useRouter()
  const [texto, setTexto] = useState(nome.nome)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  // PDF ainda sendo gerado: a página se atualiza sozinha até ficar pronto, no máximo 30 vezes.
  const gerando = certificados.some((c) => c.situacao === 'gerando')
  useEffect(() => {
    if (!gerando) return
    let tentativas = 0
    const relogio = setInterval(() => {
      if (++tentativas > 30) {
        clearInterval(relogio)
        return
      }
      void router.invalidate()
    }, 4000)
    return () => clearInterval(relogio)
  }, [gerando, router])
  // A confirmação aparece enquanto o nome não foi confirmado, mesmo sem certificado ainda: o nome
  // precisa estar certo antes da primeira emissão (e2e certificados-previas).
  const precisaConfirmar = !nome.confirmado

  // Mensagem junto ao campo e foco nele: o toast sozinho some e não diz onde corrigir.
  function mostrarErro(mensagem: string) {
    setErro(mensagem)
    campo.current?.focus()
  }

  async function confirmar() {
    if (ocupado) return
    if (texto.trim().length < 3) {
      mostrarErro('Digite o nome completo (pelo menos 3 letras).')
      return
    }
    setErro(null)
    setOcupado(true)
    try {
      const { emitidos } = await confirmarNomeFn({ data: { nome: texto } })
      toast.success(
        emitidos > 0
          ? 'Nome confirmado. Estamos gerando o seu certificado.'
          : 'Nome confirmado.',
      )
      await router.invalidate()
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : 'Não deu certo.'
      toast.error(mensagem)
      mostrarErro(mensagem)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <main
      className={`flex flex-1 flex-col gap-6 mx-auto w-full max-w-[65rem] px-4 pt-6 pb-8 md:px-8 md:py-14 ${APOIO_NA_REGUA}`}
    >
      <div className="flex flex-col gap-1">
        <h1 className={`text-2xl leading-8 font-semibold ${TITULO_DE_APOIO}`}>
          Certificados
        </h1>
        <p className="text-muted-foreground">
          Os certificados dos cursos que você concluiu. Eles ficam aqui mesmo
          depois que o seu acesso termina.
        </p>
      </div>

      {precisaConfirmar && (
        <Card className="max-w-xl gap-4 p-6">
          <div className="flex flex-col gap-1">
            <h2 className="font-medium">
              {aguardandoNome
                ? 'Confirme o seu nome para receber o certificado'
                : 'Confirme como o seu nome sai no certificado'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Escreva o nome completo, do jeito que deve aparecer. Depois de
              confirmado, só a nossa equipe consegue corrigir.
            </p>
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void confirmar()
            }}
          >
            <Label htmlFor="nome-no-certificado">Nome no certificado</Label>
            <Input
              id="nome-no-certificado"
              ref={campo}
              name="name"
              autoComplete="name"
              value={texto}
              maxLength={LIMITE_DO_NOME}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? 'erro-nome-no-certificado' : undefined}
              onChange={(e) => {
                setTexto(e.target.value)
                setErro(null)
              }}
            />
            {erro && (
              <p
                id="erro-nome-no-certificado"
                className="text-sm text-destructive"
              >
                {erro}
              </p>
            )}
            <Button
              type="submit"
              className={`self-start ${BOTAO_FORTE}`}
              aria-disabled={ocupado || undefined}
            >
              Confirmar nome
            </Button>
          </form>
        </Card>
      )}

      {certificados.length === 0 ? (
        <TelaVazia
          ilustracao="fita"
          titulo="Você ainda não tem certificados"
          texto="Eles aparecem aqui quando você cumpre o que o curso pede."
          acao={<AcaoContinuarEstudando />}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {certificados.map((c) => (
            <li key={c.id}>
              <CartaoDeCertificado c={c} fuso={fuso} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
