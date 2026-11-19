import { Award, Bookmark, Home, Moon, Search, Sun } from 'lucide-react'
import type { CSSProperties } from 'react'
import { fundoComVeu, Marca } from '#/components/casca/marca'
import { Button } from '#/components/ui/button'
import { Progress } from '#/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { appConfig } from '#/config/app'
import type { ThemeId } from '#/config/themes'
import type { CascaDoAluno } from '#/regras/aparencia'
import { variaveisDaMarca } from '#/regras/aparencia-cor'

export type Rascunho = {
  tema: ThemeId
  casca: CascaDoAluno
  mostrarComunidade: boolean
  corDaMarca: string | null
  logoUrl: string | null
  faviconUrl: string | null
  fundoDoMenuUrl: string | null
  fundoDoLoginUrl: string | null
}

export type Modo = 'claro' | 'escuro'

/**
 * Prévia ao vivo da aparência (#63). Não é uma imitação com cores copiadas: o
 * bloco recebe `data-theme` e a classe `dark`, então os MESMOS blocos de tokens
 * de styles.css se aplicam aqui dentro, e a cor da marca entra como variáveis
 * inline, igual ao que `cssDaMarca` faz no <head> depois de salvar.
 */
export function PreviaDaAparencia({
  rascunho,
  modo,
  onModo,
}: {
  rascunho: Rascunho
  modo: Modo
  onModo: (modo: Modo) => void
}) {
  const vars = rascunho.corDaMarca
    ? variaveisDaMarca(rascunho.corDaMarca, rascunho.tema)[modo]
    : {}
  return (
    <section aria-label="Prévia" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Prévia ao vivo</h2>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={modo}
          onValueChange={(v) => v && onModo(v as Modo)}
          aria-label="Modo da prévia"
        >
          <ToggleGroupItem value="claro" aria-label="Prévia no modo claro">
            <Sun className="size-3.5" aria-hidden="true" />
            Claro
          </ToggleGroupItem>
          <ToggleGroupItem value="escuro" aria-label="Prévia no modo escuro">
            <Moon className="size-3.5" aria-hidden="true" />
            Escuro
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div
        data-theme={rascunho.tema}
        data-testid="previa"
        className={`${modo === 'escuro' ? 'dark ' : ''}flex flex-col gap-3 rounded-[var(--radius-card)] border bg-surface p-3 font-sans text-foreground`}
        style={vars as CSSProperties}
      >
        <TelaDoAluno rascunho={rascunho} />
        <TelaDeEntrar rascunho={rascunho} />
      </div>
      <p className="text-xs text-muted-foreground">
        A área do aluno e a tela de entrar, no tema e na cor escolhidos. Cada
        aluno ainda escolhe entre claro e escuro pelo botão da lua.
      </p>
    </section>
  )
}

function TelaDoAluno({ rascunho }: { rascunho: Rascunho }) {
  return (
    <div className="grid aspect-[16/10] grid-cols-[112px_1fr] overflow-hidden rounded-[var(--radius)] border bg-sidebar text-[10px] shadow-[var(--shadow-card)]">
      <div className="relative flex flex-col gap-2 p-2 text-sidebar-foreground">
        {rascunho.fundoDoMenuUrl ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: fundoComVeu(
                rascunho.fundoDoMenuUrl,
                '--sidebar',
              ),
            }}
          />
        ) : null}
        <div className="relative scale-[0.8] origin-top-left">
          <Marca logoUrl={rascunho.logoUrl} />
        </div>
        <div className="relative mt-1 flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 rounded-[var(--radius-btn)] bg-sidebar-accent px-1.5 py-1 font-medium text-sidebar-accent-foreground">
            <Home className="size-3" aria-hidden="true" />
            Início
          </span>
          <span className="flex items-center gap-1.5 px-1.5 py-1">
            <Bookmark className="size-3" aria-hidden="true" />
            Favoritos
          </span>
          <span className="flex items-center gap-1.5 px-1.5 py-1">
            <Award className="size-3" aria-hidden="true" />
            Certificados
          </span>
        </div>
      </div>
      <div className="m-1 flex flex-col rounded-[var(--radius)] border bg-background">
        <div className="flex h-7 items-center gap-2 border-b px-2">
          <span className="font-medium">Início</span>
          <span className="ml-auto flex h-4 w-20 items-center gap-1 rounded-[var(--radius-btn)] border px-1 text-muted-foreground">
            <Search className="size-2.5" aria-hidden="true" />
            Buscar…
          </span>
        </div>
        <div className="flex flex-col gap-2 p-2">
          <span className="text-xs font-semibold">Continuar assistindo</span>
          <div className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border bg-card p-2 text-card-foreground">
            <span className="text-muted-foreground">Curso de exemplo</span>
            <span className="font-medium">Aula 4 · continuar</span>
            <Progress value={38} className="h-1" />
          </div>
          <div className="flex gap-1.5">
            <Button size="xs">Continuar</Button>
            <Button size="xs" variant="outline">
              Ver programa
            </Button>
          </div>
          <span className="text-brand underline underline-offset-2">
            Um link na cor da marca
          </span>
        </div>
      </div>
    </div>
  )
}

function TelaDeEntrar({ rascunho }: { rascunho: Rascunho }) {
  return (
    <div className="grid aspect-[16/7] grid-cols-2 overflow-hidden rounded-[var(--radius)] border bg-background text-[10px] shadow-[var(--shadow-card)]">
      <div
        aria-hidden="true"
        className="bg-cover bg-center bg-muted"
        style={
          rascunho.fundoDoLoginUrl
            ? { backgroundImage: `url("${rascunho.fundoDoLoginUrl}")` }
            : undefined
        }
      />
      <div className="flex flex-col justify-center gap-1.5 p-3">
        <div className="scale-[0.8] origin-top-left">
          <Marca logoUrl={rascunho.logoUrl} />
        </div>
        <span className="text-xs font-semibold">Entrar</span>
        <span className="text-muted-foreground">
          Sem senha: enviamos um código para o seu e-mail.
        </span>
        <span className="h-5 rounded-[var(--radius-btn)] border bg-background px-1.5 leading-5 text-muted-foreground">
          voce@exemplo.com
        </span>
        <Button size="xs" className="w-full">
          Continuar com e-mail
        </Button>
        <span className="sr-only">{appConfig.name}</span>
      </div>
    </div>
  )
}
