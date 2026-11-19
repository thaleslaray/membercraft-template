import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  PAGINA_NA_REGUA,
  TITULO_DA_PAGINA,
} from '#/components/casca-lume/pagina-lume'
import {
  ErroDoCampo,
  EstadoDoCampoNaTela,
  useCampoQueSalva,
} from '#/components/conta/campo-que-salva'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Recolhivel } from '#/components/ui/recolhivel'
import { Separator } from '#/components/ui/separator'
import { Textarea } from '#/components/ui/textarea'
import { EsqueletoDaConta } from '#/components/vazio/esqueletos'
import { authClient } from '#/lib/auth-client'
import {
  enviarFotoFn,
  minhaContaFn,
  removerFotoFn,
  salvarMinhaContaFn,
} from '#/lib/conta-fns'
import {
  FUSO_PADRAO,
  FUSOS_SUGERIDOS,
  formatarDataHoraNoFuso,
  fusoDoAluno,
} from '#/lib/datas'
import {
  definirPreferenciaDeEmailFn,
  preferenciasDeEmailFn,
} from '#/lib/email-fns'
import { toast } from '#/lib/toast'
import { cn } from '#/lib/utils'
import { TAMANHO_MAXIMO_DA_BIO, validarFoto } from '#/regras/minha-conta'
import { rotuloDoPerfil, tratarPerfil } from '#/regras/permissoes'

// A conta mora na casca do aluno (#88): destinos no topo, abas do pé no celular e o menu do avatar.
// O login e o primeiro acesso são exigidos pelo layout `_aluno`.
export const Route = createFileRoute('/_aluno/conta')({
  loader: () => minhaContaFn(),
  head: () => ({ meta: [{ title: 'Sua conta' }] }),
  pendingComponent: EsqueletoDaConta,
  component: AccountPage,
})

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
}

function initials(name: string, email: string) {
  const source = name.trim() || email
  return source.charAt(0).toUpperCase() || 'U'
}

// Contas vinculadas. Quem entra só por código não tem registro aqui.
function useProviderLabel() {
  const { data } = useQuery({
    queryKey: ['auth', 'accounts'],
    queryFn: async () => {
      const result = await authClient.listAccounts()
      return result.data ?? []
    },
    staleTime: 60_000,
  })
  if (!data) return null
  if (data.length === 0) return 'Código por e-mail'
  return data
    .map((account) => PROVIDER_LABELS[account.providerId] ?? account.providerId)
    .join(' + ')
}

// Interruptores dos e-mails que têm descadastro (os outros são de acesso e aviso da conta).
function EmailsDaConta() {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['conta', 'preferencias-de-email'],
    queryFn: () => preferenciasDeEmailFn(),
  })
  if (!data?.length) return null

  async function alternar(tipo: string, ativo: boolean) {
    try {
      await definirPreferenciaDeEmailFn({ data: { tipo, ativo } })
      await queryClient.invalidateQueries({
        queryKey: ['conta', 'preferencias-de-email'],
      })
    } catch {
      toast.error('Não foi possível salvar. Tente de novo.')
    }
  }

  return (
    <section className="grid gap-3" aria-labelledby="titulo-emails">
      <h2 id="titulo-emails" className="text-sm font-medium">
        E-mails que você recebe
      </h2>
      {data.map((p) => (
        <div key={p.tipo} className="flex items-start gap-3">
          <Checkbox
            id={`email-${p.tipo}`}
            className={CAIXA_44}
            checked={p.ativo}
            onCheckedChange={(marcado) =>
              void alternar(p.tipo, marcado === true)
            }
          />
          <Label htmlFor={`email-${p.tipo}`} className="grid gap-1 font-normal">
            <span className="font-medium">{p.nome}</span>
            <span className="text-sm text-muted-foreground">{p.quando}</span>
          </Label>
        </div>
      ))}
    </section>
  )
}

// Interruptor de 16 px com área de toque de 44 px no celular: o quadrado não muda, a área clicável cresce.
const CAIXA_44 =
  "toque:relative toque:after:absolute toque:after:-inset-[15px] toque:after:content-['']"

type EntradaDaConta = {
  nome?: string
  telefone?: string
  fusoHorario?: string
  bio?: string
  proximaAulaSozinha?: boolean
}

// Salva um pedaço da conta e atualiza a sessão (nome e foto aparecem no avatar da casca).
function useSalvarConta() {
  const router = useRouter()
  const queryClient = useQueryClient()
  return async (entrada: EntradaDaConta) => {
    await salvarMinhaContaFn({ data: entrada })
    await queryClient.invalidateQueries({ queryKey: ['session'] })
    await router.invalidate()
  }
}

function CampoDeTexto({
  id,
  rotulo,
  valorSalvo,
  campo,
  tipo = 'text',
  autoComplete,
  placeholder,
}: {
  id: string
  rotulo: string
  valorSalvo: string
  campo: 'nome' | 'telefone'
  tipo?: string
  autoComplete?: string
  placeholder?: string
}) {
  const salvarConta = useSalvarConta()
  const [valor, setValor] = useState(valorSalvo)
  const { estado, sair, digitar } = useCampoQueSalva({
    valorSalvo,
    salvar: (v) => salvarConta({ [campo]: v }),
  })
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{rotulo}</Label>
        <EstadoDoCampoNaTela id={id} estado={estado} />
      </div>
      <Input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => {
          setValor(e.target.value)
          digitar()
        }}
        onBlur={() => void sair(valor)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={estado.fase === 'erro' ? true : undefined}
        aria-describedby={estado.fase === 'erro' ? `erro-${id}` : undefined}
      />
      <ErroDoCampo id={id} estado={estado} />
    </div>
  )
}

function CampoSobreVoce({ valorSalvo }: { valorSalvo: string }) {
  const salvarConta = useSalvarConta()
  const [valor, setValor] = useState(valorSalvo)
  const { estado, sair, digitar } = useCampoQueSalva({
    valorSalvo,
    salvar: (v) => salvarConta({ bio: v }),
  })
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor="conta-bio">Sobre você</Label>
        <EstadoDoCampoNaTela id="conta-bio" estado={estado} />
      </div>
      <Textarea
        id="conta-bio"
        aria-describedby={
          estado.fase === 'erro'
            ? 'conta-bio-aviso erro-conta-bio'
            : 'conta-bio-aviso'
        }
        aria-invalid={estado.fase === 'erro' ? true : undefined}
        value={valor}
        onChange={(e) => {
          setValor(e.target.value)
          digitar()
        }}
        onBlur={() => void sair(valor)}
        maxLength={TAMANHO_MAXIMO_DA_BIO}
        rows={4}
      />
      <ErroDoCampo id="conta-bio" estado={estado} />
      <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
        <p id="conta-bio-aviso">
          Aparece para colegas no ranking e na comunidade.
        </p>
        <span className="shrink-0 tabular-nums">
          {valor.length}/{TAMANHO_MAXIMO_DA_BIO}
        </span>
      </div>
    </div>
  )
}

function CampoDeFuso({ valorSalvo }: { valorSalvo: string }) {
  const salvarConta = useSalvarConta()
  const [fuso, setFuso] = useState(valorSalvo)
  const { estado, sair } = useCampoQueSalva({
    valorSalvo,
    salvar: (v) => salvarConta({ fusoHorario: v }),
  })
  // O fuso que a aluna já tem entra na lista mesmo se não for um dos sugeridos.
  const fusos = FUSOS_SUGERIDOS.some((f) => f.id === fuso)
    ? FUSOS_SUGERIDOS
    : [{ id: fuso, rotulo: fuso }, ...FUSOS_SUGERIDOS]
  // A hora de agora só existe no navegador (no servidor seria outro minuto e quebraria a hidratação).
  const [agora, setAgora] = useState<Date | null>(null)
  useEffect(() => setAgora(new Date()), [])
  const agoraNoFuso = agora ? formatarDataHoraNoFuso(agora, fuso) : '...'
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor="conta-fuso">Fuso horário</Label>
        <EstadoDoCampoNaTela id="conta-fuso" estado={estado} />
      </div>
      <select
        id="conta-fuso"
        value={fuso}
        onChange={(e) => {
          setFuso(e.target.value)
          void sair(e.target.value)
        }}
        aria-describedby={
          estado.fase === 'erro' ? 'erro-conta-fuso' : undefined
        }
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {fusos.map((f) => (
          <option key={f.id} value={f.id}>
            {f.rotulo}
          </option>
        ))}
      </select>
      <ErroDoCampo id="conta-fuso" estado={estado} />
      <p className="text-sm text-muted-foreground">
        As datas e horas que você vê na área seguem este fuso (agora:{' '}
        {agoraNoFuso}). As liberações de aula continuam no horário de Brasília.
      </p>
    </div>
  )
}

// A próxima aula começa sozinha depois de 5 s; aqui a aluna desliga (o player da aula lê esta opção).
function ProximaAulaSozinha({ ligada }: { ligada: boolean }) {
  const salvarConta = useSalvarConta()
  const [marcada, setMarcada] = useState(ligada)
  const { estado, sair } = useCampoQueSalva({
    valorSalvo: String(ligada),
    salvar: (v) => salvarConta({ proximaAulaSozinha: v === 'true' }),
  })
  return (
    <div className="grid gap-2">
      <div className="flex items-start gap-3">
        <Checkbox
          id="conta-proxima-aula"
          className={CAIXA_44}
          checked={marcada}
          onCheckedChange={(m) => {
            const novo = m === true
            setMarcada(novo)
            void sair(String(novo))
          }}
        />
        <Label
          htmlFor="conta-proxima-aula"
          className="grid flex-1 gap-1 font-normal"
        >
          <span className="font-medium">Começar a próxima aula sozinha</span>
          <span className="text-sm text-muted-foreground">
            Quando uma aula termina, a seguinte começa depois de 5 segundos.
          </span>
        </Label>
        <EstadoDoCampoNaTela id="conta-proxima-aula" estado={estado} />
      </div>
      <ErroDoCampo id="conta-proxima-aula" estado={estado} />
    </div>
  )
}

// Anel em volta da foto enquanto ela sobe (o envio passa pelo Worker, sem porcentagem: o anel gira).
function AnelDeEnvio() {
  return (
    <svg
      viewBox="0 0 36 36"
      aria-hidden="true"
      data-testid="anel-da-foto"
      className="pointer-events-none absolute -inset-1.5 size-[calc(100%+0.75rem)] animate-spin [animation-duration:1.1s]"
    >
      <circle
        cx="18"
        cy="18"
        r="16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="26 78"
        className="text-brand"
      />
    </svg>
  )
}

function FotoDaConta({ nome, email }: { nome: string; email: string }) {
  const conta = Route.useLoaderData()
  const router = useRouter()
  const queryClient = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState(false)
  // A foto nova aparece na hora (endereço local); `null` na prévia = removida; `undefined` = a do servidor.
  const [previa, setPrevia] = useState<string | null | undefined>(undefined)
  const [erroDaFoto, setErroDaFoto] = useState<string | null>(null)
  const foto = previa === undefined ? conta.foto : previa

  useEffect(() => {
    return () => {
      if (previa) URL.revokeObjectURL(previa)
    }
  }, [previa])

  async function depoisDeMudar() {
    await queryClient.invalidateQueries({ queryKey: ['session'] })
    await router.invalidate()
    setPrevia(undefined)
  }

  async function escolher(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0]
    event.target.value = ''
    if (!arquivo) return
    setErroDaFoto(null)
    const motivo = validarFoto({ tipo: arquivo.type, tamanho: arquivo.size })
    if (motivo) {
      setErroDaFoto(motivo)
      return
    }
    setPrevia(URL.createObjectURL(arquivo))
    setOcupado(true)
    try {
      const dados = new FormData()
      dados.set('arquivo', arquivo)
      await enviarFotoFn({ data: dados })
      await depoisDeMudar()
    } catch (e) {
      // Volta para a foto de antes e diz o motivo.
      setPrevia(undefined)
      setErroDaFoto(
        e instanceof Error ? e.message : 'Não foi possível enviar a foto.',
      )
    } finally {
      setOcupado(false)
    }
  }

  async function remover() {
    setErroDaFoto(null)
    setPrevia(null)
    setOcupado(true)
    try {
      await removerFotoFn()
      await depoisDeMudar()
    } catch {
      setPrevia(undefined)
      setErroDaFoto('Não foi possível remover a foto.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <Avatar size="lg" className="data-[size=lg]:size-20">
          {foto ? <AvatarImage src={foto} alt="Sua foto de perfil" /> : null}
          <AvatarFallback className="text-lg">
            {initials(nome, email)}
          </AvatarFallback>
        </Avatar>
        {ocupado && <AnelDeEnvio />}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input
          ref={entrada}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          tabIndex={-1}
          className="sr-only"
          aria-label="Escolher foto"
          data-testid="campo-foto"
          onChange={(e) => void escolher(e)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="toque:h-11"
          disabled={ocupado}
          onClick={() => entrada.current?.click()}
        >
          {foto ? 'Trocar foto' : 'Enviar foto'}
        </Button>
        {foto ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="toque:h-11"
            disabled={ocupado}
            onClick={() => void remover()}
          >
            Remover
          </Button>
        ) : null}
        <p
          role="status"
          aria-live="polite"
          data-testid="estado-foto"
          className="w-full text-xs text-muted-foreground"
        >
          {ocupado ? 'Enviando…' : 'PNG, JPEG, WebP ou GIF, até 2 MB.'}
        </p>
        {erroDaFoto && (
          <p
            role="alert"
            data-testid="erro-foto"
            className="w-full text-sm text-destructive"
          >
            {erroDaFoto}
          </p>
        )}
      </div>
    </div>
  )
}

function AccountPage() {
  const { session } = Route.useRouteContext()
  const conta = Route.useLoaderData()
  const queryClient = useQueryClient()
  const user = session.user
  const provider = useProviderLabel()
  const [leaving, setLeaving] = useState(false)
  const [maisAberto, setMaisAberto] = useState(false)
  const fuso = conta.fusoHorario

  // Encerra só a sessão deste aparelho; os outros aparelhos continuam conectados.
  async function leave() {
    setLeaving(true)
    await authClient.signOut()
    await queryClient.invalidateQueries({ queryKey: ['session'] })
    window.location.assign('/')
  }

  return (
    <main
      className={`mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-10 md:px-8 md:pb-16 ${PAGINA_NA_REGUA}`}
    >
      <div className="flex flex-col gap-1 pt-6 md:pt-12">
        <h1
          className={`text-2xl leading-8 font-semibold tracking-[-0.01em] ${TITULO_DA_PAGINA}`}
        >
          Sua conta
        </h1>
      </div>

      <section
        aria-label="Seu perfil"
        className="flex min-w-0 flex-col gap-6 rounded-lg border bg-card p-4 shadow-xs md:p-6"
      >
        <FotoDaConta nome={conta.nome} email={user.email} />
        <CampoDeTexto
          id="conta-nome"
          rotulo="Nome"
          campo="nome"
          valorSalvo={conta.nome}
          autoComplete="name"
        />
        <CampoSobreVoce valorSalvo={conta.bio ?? ''} />
        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
      </section>

      <section
        aria-label="Mais"
        className="rounded-lg border bg-card shadow-xs"
      >
        <button
          type="button"
          aria-expanded={maisAberto}
          aria-controls="conta-mais"
          onClick={() => setMaisAberto((a) => !a)}
          className="pressiona-linha flex w-full items-center justify-between gap-3 rounded-lg px-4 py-4 text-left md:px-6"
        >
          <span className="grid gap-0.5">
            <span className="text-base font-medium">Mais</span>
            <span className="text-sm text-muted-foreground">
              Telefone, fuso, e-mails e sessão.
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-5 shrink-0 text-muted-foreground transition-transform duration-lento ease-saida',
              maisAberto && 'rotate-180',
            )}
          />
        </button>
        <Recolhivel id="conta-mais" aberto={maisAberto}>
          <div className="flex flex-col gap-6 px-4 pb-6 md:px-6">
            <Separator />
            <CampoDeTexto
              id="conta-telefone"
              rotulo="Telefone"
              campo="telefone"
              tipo="tel"
              valorSalvo={conta.telefone ?? ''}
              autoComplete="tel"
              placeholder="(11) 91234-5678"
            />
            <CampoDeFuso valorSalvo={fusoDoAluno(conta.fusoHorario)} />
            <Separator />
            <ProximaAulaSozinha ligada={conta.proximaAulaSozinha} />
            <Separator />
            <EmailsDaConta />
            <Separator />
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  Perfil: {rotuloDoPerfil(tratarPerfil(user.perfil))}
                </Badge>
                {provider ? (
                  <Badge variant="secondary">Entrou com: {provider}</Badge>
                ) : null}
                <Badge variant="outline">
                  E-mail verificado: {user.emailVerified ? 'sim' : 'não'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Conta criada em {formatarDataHoraNoFuso(user.createdAt, fuso)}
                {user.termosAceitoEm
                  ? `. Termos aceitos em ${formatarDataHoraNoFuso(user.termosAceitoEm, fuso)}`
                  : ''}
                . Fuso:{' '}
                {fusoDoAluno(fuso) === FUSO_PADRAO
                  ? 'Brasília'
                  : fusoDoAluno(fuso)}
                .
              </p>
              <p className="text-sm text-muted-foreground">
                Sair encerra o acesso só neste aparelho. Nos outros você
                continua conectado.
              </p>
              <Button
                variant="outline"
                disabled={leaving}
                onClick={() => void leave()}
                className="w-fit"
              >
                {leaving ? 'Saindo...' : 'Sair deste aparelho'}
              </Button>
            </div>
          </div>
        </Recolhivel>
      </section>
    </main>
  )
}
