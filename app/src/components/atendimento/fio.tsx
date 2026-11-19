import { ImagePlus, SendHorizontal, X } from 'lucide-react'
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { enviarImagem, urlDoAnexo } from '#/components/atendimento/mensagens'
import { BOTAO_FORTE } from '#/components/casca-lume/pagina-lume'
import { AvatarDaPessoa, NomeDaPessoa } from '#/components/pessoa/pessoa'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog'
import { Textarea } from '#/components/ui/textarea'
import { appConfig } from '#/config/app'
import { querMenosMovimento } from '#/lib/menos-movimento'
import { toast } from '#/lib/toast'
import { cn } from '#/lib/utils'
import type { MensagemDoFio } from '#/regras/atendimento'
import {
  LIMITE_DE_ANEXOS,
  LIMITE_DO_TEXTO,
  validarImagem,
} from '#/regras/atendimento-limites'

export type CursoDoCampo = { id: string; nome: string }

/** O que a aluna acabou de mandar e o servidor ainda não devolveu (ou recusou). */
export interface Pendente {
  chaveDeEnvio: string
  texto: string
  anexos: string[]
  cursoId: string | null
  estado: 'enviando' | 'falhou'
}

const dia = (data: Date, fuso: string) =>
  new Date(data).toLocaleDateString('pt-BR', { timeZone: fuso })

/** "Hoje", "Ontem" ou a data por extenso, no fuso da aluna. */
export function rotuloDoDia(data: Date, agora: Date, fuso: string): string {
  const d = dia(data, fuso)
  if (d === dia(agora, fuso)) return 'Hoje'
  if (d === dia(new Date(agora.getTime() - 86_400_000), fuso)) return 'Ontem'
  return new Date(data).toLocaleDateString('pt-BR', {
    timeZone: fuso,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const hora = (data: Date, fuso: string) =>
  new Date(data).toLocaleTimeString('pt-BR', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
  })

type Item =
  | { tipo: 'dia'; chave: string; rotulo: string }
  | { tipo: 'mensagem'; chave: string; mensagem: MensagemDoFio }
  | { tipo: 'pendente'; chave: string; pendente: Pendente }

function Anexos({ anexos, ao }: { anexos: string[]; ao: (c: string) => void }) {
  if (anexos.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2">
      {anexos.map((chave) => (
        <li key={chave}>
          <button
            type="button"
            onClick={() => ao(chave)}
            className="pressiona-cartao block cursor-zoom-in overflow-hidden rounded-xl outline-offset-2"
            aria-label="Abrir imagem"
          >
            <img
              src={urlDoAnexo(chave)}
              alt="Imagem anexada"
              className="max-h-44 max-w-full object-cover"
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

function Bolha({
  lado,
  autor,
  texto,
  anexos,
  hora: horario,
  rodape,
  ao,
}: {
  lado: 'aluna' | 'equipe'
  /** Quem escreveu, para o leitor de tela ("Você" ou o nome da equipe). */
  autor: string
  texto: string
  anexos: string[]
  hora: string
  rodape?: React.ReactNode
  ao: (c: string) => void
}) {
  const daAluna = lado === 'aluna'
  return (
    <div
      className={cn(
        'flex max-w-[85%] flex-col gap-1.5 rounded-2xl px-3.5 py-2.5 md:max-w-[75%]',
        daAluna
          ? 'self-end rounded-br-md bg-primary text-primary-foreground in-data-[casca=lume]:bg-(--bolha-aluna-fundo) in-data-[casca=lume]:text-(--bolha-aluna-tinta)'
          : 'rounded-bl-md bg-muted text-foreground',
      )}
    >
      <span className="sr-only">
        {autor}, {horario}:
      </span>
      {texto && (
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
          {texto}
        </p>
      )}
      <Anexos anexos={anexos} ao={ao} />
      <span
        className={cn(
          'text-[11px] tabular-nums',
          daAluna
            ? 'text-primary-foreground/80 in-data-[casca=lume]:text-(--bolha-aluna-hora)'
            : 'text-foreground/75',
        )}
      >
        {horario}
        {rodape}
      </span>
    </div>
  )
}

/** As mensagens em bolhas, com separadores por dia. A equipe vem com foto, nome e selo. */
export function ListaDoFio({
  mensagens,
  pendentes,
  fuso,
  agora,
  enviadaRecente,
  aoTentarDeNovo,
}: {
  mensagens: MensagemDoFio[]
  pendentes: Pendente[]
  fuso: string
  agora: Date
  /** Mostra "Enviada" na última mensagem da aluna logo depois de o servidor confirmar. */
  enviadaRecente: boolean
  aoTentarDeNovo: (p: Pendente) => void
}) {
  const [aberta, setAberta] = useState<string | null>(null)
  const itens = useMemo(() => {
    const lista: Item[] = []
    let ultimoDia = ''
    const empurrarDia = (data: Date, chave: string) => {
      const d = dia(data, fuso)
      if (d !== ultimoDia) {
        ultimoDia = d
        lista.push({
          tipo: 'dia',
          chave,
          rotulo: rotuloDoDia(data, agora, fuso),
        })
      }
    }
    for (const m of mensagens) {
      empurrarDia(m.criadoEm, `d-${m.id}`)
      lista.push({ tipo: 'mensagem', chave: m.id, mensagem: m })
    }
    for (const p of pendentes) {
      empurrarDia(agora, `d-${p.chaveDeEnvio}`)
      lista.push({ tipo: 'pendente', chave: p.chaveDeEnvio, pendente: p })
    }
    return lista
  }, [mensagens, pendentes, fuso, agora])

  const ultimaDaAluna = [...mensagens]
    .reverse()
    .find((m) => m.autor !== 'equipe')

  return (
    <>
      <div role="log" aria-live="polite" aria-label="Conversa com a equipe">
        <ol className="flex flex-col gap-2">
          {itens.map((item, i) => {
            if (item.tipo === 'dia') {
              return (
                <li
                  key={item.chave}
                  className="my-2 flex justify-center text-xs font-medium text-muted-foreground"
                >
                  {item.rotulo}
                </li>
              )
            }
            if (item.tipo === 'pendente') {
              const p = item.pendente
              return (
                <li
                  key={item.chave}
                  data-flip={item.chave}
                  className="nasce-da-mensagem flex flex-col items-end gap-1"
                >
                  <Bolha
                    lado="aluna"
                    autor="Você"
                    texto={p.texto}
                    anexos={p.anexos}
                    hora={hora(agora, fuso)}
                    ao={setAberta}
                  />
                  {p.estado === 'enviando' ? (
                    <span className="text-xs text-muted-foreground">
                      Enviando…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-xs text-destructive">
                      Não foi.
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs toque:h-11"
                        onClick={() => aoTentarDeNovo(p)}
                      >
                        Tentar de novo
                      </Button>
                    </span>
                  )}
                </li>
              )
            }
            const m = item.mensagem
            const daEquipe = m.autor === 'equipe'
            // Foto e nome só quando a pessoa muda, como nas conversas do celular.
            const anterior = itens[i - 1]
            const mesmaPessoa =
              anterior?.tipo === 'mensagem' &&
              anterior.mensagem.autor === m.autor &&
              anterior.mensagem.autorNome === m.autorNome
            if (!daEquipe) {
              return (
                <li key={item.chave} className="flex flex-col items-end gap-1">
                  <Bolha
                    lado="aluna"
                    autor="Você"
                    texto={m.texto}
                    anexos={m.anexos}
                    hora={hora(m.criadoEm, fuso)}
                    rodape={
                      m.origem === 'email' ? <span> · por e-mail</span> : null
                    }
                    ao={setAberta}
                  />
                  {enviadaRecente && ultimaDaAluna?.id === m.id && (
                    <span className="text-xs text-muted-foreground">
                      Enviada
                    </span>
                  )}
                </li>
              )
            }
            const pessoa = {
              nome: m.autorNome,
              imagem: m.autorImagem,
              bio: null,
              daEquipe: true,
            }
            return (
              <li key={item.chave} className="flex items-end gap-2">
                <span
                  className={cn('w-8 shrink-0', mesmaPessoa && 'invisible')}
                >
                  {!mesmaPessoa && <AvatarDaPessoa pessoa={pessoa} />}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  {!mesmaPessoa && (
                    <span className="text-xs">
                      <NomeDaPessoa pessoa={pessoa} />
                    </span>
                  )}
                  <Bolha
                    lado="equipe"
                    autor={m.autorNome}
                    texto={m.texto}
                    anexos={m.anexos}
                    hora={hora(m.criadoEm, fuso)}
                    rodape={
                      m.origem === 'email' ? <span> · por e-mail</span> : null
                    }
                    ao={setAberta}
                  />
                </div>
              </li>
            )
          })}
        </ol>
      </div>
      <Dialog
        open={aberta !== null}
        onOpenChange={(o) => !o && setAberta(null)}
      >
        <DialogContent className="max-w-3xl border-0 bg-transparent p-0 shadow-none sm:max-w-3xl">
          <DialogTitle className="sr-only">Imagem</DialogTitle>
          <DialogDescription className="sr-only">
            Imagem enviada na conversa
          </DialogDescription>
          {aberta && (
            <img
              src={urlDoAnexo(aberta)}
              alt="Imagem anexada, em tamanho grande"
              className="max-h-[85svh] w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Campo preso ao pé: cresce com o texto (até 6 linhas), ⌘/Ctrl+Enter envia, curso opcional. */
export function CampoDoFio({
  cursos,
  aoEnviar,
}: {
  cursos: CursoDoCampo[]
  aoEnviar: (m: {
    texto: string
    anexos: string[]
    cursoId: string | null
  }) => void
}) {
  const [texto, setTexto] = useState('')
  // `⌘` no Mac, `Ctrl` no resto; a dica só aparece com mouse e teclado (ver variante `ponteiro-fino`).
  const [teclaDeEnvio, setTeclaDeEnvio] = useState('Ctrl')
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setTeclaDeEnvio('⌘')
  }, [])
  const [anexos, setAnexos] = useState<string[]>([])
  const [cursoId, setCursoId] = useState('')
  const [subindo, setSubindo] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const idDoAviso = useId()

  async function escolher(arquivos: FileList | null) {
    if (!arquivos) return
    setSubindo(true)
    try {
      let total = anexos.length
      for (const arquivo of Array.from(arquivos)) {
        if (total >= LIMITE_DE_ANEXOS) {
          toast.error(`Anexe no máximo ${LIMITE_DE_ANEXOS} imagens.`)
          break
        }
        const erro = validarImagem({
          tipo: arquivo.type,
          tamanho: arquivo.size,
        })
        if (erro) {
          toast.error(erro)
          continue
        }
        const chave = await enviarImagem(arquivo)
        total++
        setAnexos((atuais) => [...atuais, chave])
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para enviar.')
    } finally {
      setSubindo(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const excedeu = texto.length > LIMITE_DO_TEXTO
  const vazio = texto.trim() === '' && anexos.length === 0

  function enviar() {
    if (subindo) return
    // Botão sempre ligado (o desligado em vinho pálido não se lê): o aviso fica junto ao campo e
    // nada vazio ou grande demais vai ao servidor.
    if (vazio || excedeu) {
      setAviso(
        vazio
          ? 'Escreva uma mensagem antes de enviar.'
          : `A mensagem passa de ${LIMITE_DO_TEXTO.toLocaleString('pt-BR')} caracteres.`,
      )
      campo.current?.focus()
      return
    }
    setAviso(null)
    aoEnviar({ texto: texto.trim(), anexos, cursoId: cursoId || null })
    setTexto('')
    setAnexos([])
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {anexos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {anexos.map((chave) => (
            <li key={chave} className="relative">
              <img
                src={urlDoAnexo(chave)}
                alt="Imagem para anexar"
                className="size-16 rounded-lg object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="absolute -top-2 -right-2 size-6 rounded-full"
                aria-label="Remover imagem"
                onClick={() => setAnexos((a) => a.filter((c) => c !== chave))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={entrada}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          aria-label="Anexar imagens"
          onChange={(e) => escolher(e.target.files)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="toque:size-11"
          aria-label={subindo ? 'Enviando a imagem…' : 'Anexar imagem'}
          disabled={subindo || anexos.length >= LIMITE_DE_ANEXOS}
          onClick={() => entrada.current?.click()}
        >
          <ImagePlus />
        </Button>
        <Textarea
          ref={campo}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setAviso(null)
          }}
          onKeyDown={aoTeclar}
          rows={1}
          placeholder="Escreva para a equipe"
          aria-label="Mensagem"
          aria-invalid={excedeu || aviso ? true : undefined}
          aria-describedby={aviso ? idDoAviso : undefined}
          className="max-h-36 min-h-10 resize-none overflow-y-auto rounded-2xl py-2.5 leading-5"
        />
        <Button
          type="button"
          size="icon"
          aria-label="Enviar"
          className={`${BOTAO_FORTE} toque:size-11`}
          disabled={subindo}
          onClick={enviar}
        >
          <SendHorizontal />
        </Button>
      </div>
      {aviso && (
        <p id={idDoAviso} className="text-sm text-destructive">
          {aviso}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {cursos.length > 0 ? (
          <label className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0">Sobre um curso?</span>
            <select
              value={cursoId}
              onChange={(e) => setCursoId(e.target.value)}
              aria-label="Curso (opcional)"
              className="h-7 toque:h-11 min-w-0 max-w-[14rem] truncate rounded-md border border-input bg-transparent px-2 text-xs"
            >
              <option value="">Não, outro assunto</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span />
        )}
        <span
          className={cn(
            excedeu ? 'text-destructive' : 'sem-ponteiro-fino:hidden',
          )}
        >
          {excedeu
            ? `${texto.length.toLocaleString('pt-BR')} / ${LIMITE_DO_TEXTO.toLocaleString('pt-BR')} caracteres`
            : `${teclaDeEnvio} Enter para enviar`}
        </span>
      </div>
    </div>
  )
}

export const TEMPO_DE_RESPOSTA = appConfig.atendimento.tempoDeResposta

/** Mantém a tela na última mensagem: ao abrir sem animação; ao mandar, suave só se a pessoa pediu movimento. */
export function useNoFimDoFio(dependencia: number) {
  const primeira = useRef(true)
  useLayoutEffect(() => {
    // Sem mensagens não há fim a alcançar: rolar esconderia o título e cortaria a ilustração.
    if (dependencia === 0) return
    const quer = !querMenosMovimento()
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: primeira.current || !quer ? 'auto' : 'smooth',
    })
    primeira.current = false
  }, [dependencia])
}

export function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return agora
}
