import { Eye } from 'lucide-react'
import { type PointerEvent as EventoDeCursor, useRef, useState } from 'react'
import { estiloDoCampo } from '#/components/certificados/previa-do-certificado'
import { CampoDeImagem } from '#/components/painel/campo-de-arquivo'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { SelectNativo } from '#/components/ui/select-nativo'
import { urlDaImagem } from '#/lib/imagens'
import { toast } from '#/lib/toast'
import {
  ALINHAMENTOS,
  type Alinhamento,
  type CampoDoModelo,
  COR_PADRAO_DO_CAMPO,
  FONTES,
  type Fonte,
  type Lado,
  NOMES_DOS_CAMPOS,
  type NomeDoCampo,
} from '#/regras/certificado-modelo'

const ROTULO_DO_CAMPO: Record<NomeDoCampo, string> = {
  nome: 'Nome do aluno',
  curso: 'Nome do curso',
  data: 'Data de conclusão',
  codigo: 'Código de validação',
  qr: 'QR code',
}
const ROTULO_DA_FONTE: Record<Fonte, string> = {
  helvetica: 'Sem serifa',
  times: 'Com serifa',
  courier: 'Máquina de escrever',
  allura: 'Cursiva (Allura)',
}
const ROTULO_DO_ALINHAMENTO: Record<Alinhamento, string> = {
  esquerda: 'Esquerda',
  centro: 'Centro',
  direita: 'Direita',
}
export interface EstadoDoModelo {
  ativo: boolean
  frente: string | null
  verso: string | null
  campos: CampoDoModelo[]
  todasAsAulas: boolean
  pontosMinimos: number
}

const campoNovo = (campo: NomeDoCampo, lado: Lado): CampoDoModelo => ({
  campo,
  lado,
  x: 0.5,
  y: 0.5,
  tamanho: campo === 'qr' ? 80 : 24,
  fonte: 'helvetica',
  negrito: false,
  cor: COR_PADRAO_DO_CAMPO,
  alinhamento: 'centro',
})

const limitar = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min))
const porcento = (fracao: number) => Math.round(fracao * 1000) / 10

// Editor do modelo: os campos ficam sobre a imagem da frente (ou do verso) e se arrastam; os números
// ao lado fazem o ajuste fino. "Prévia em PDF" gera o arquivo de verdade com dados de exemplo.
export function EditorDeModelo({
  cursoNome,
  estado,
  onChange,
}: {
  cursoNome: string
  estado: EstadoDoModelo
  onChange: (proximo: EstadoDoModelo) => void
}) {
  const [lado, setLado] = useState<Lado>('frente')
  const [selecionado, setSelecionado] = useState<NomeDoCampo>('nome')
  const [gerando, setGerando] = useState(false)
  const palco = useRef<HTMLDivElement>(null)
  const imagem = lado === 'frente' ? estado.frente : estado.verso
  const camposDoLado = estado.campos.filter((c) => c.lado === lado)
  const atual = camposDoLado.find((c) => c.campo === selecionado)

  const exemplo: Record<Exclude<NomeDoCampo, 'qr'>, string> = {
    nome: 'Maria da Conceição Souza',
    curso: cursoNome,
    data: new Date().toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    codigo: 'ABCD-2345',
  }

  function mudar(campo: NomeDoCampo, parte: Partial<CampoDoModelo>) {
    onChange({
      ...estado,
      campos: estado.campos.map((c) =>
        c.campo === campo && c.lado === lado ? { ...c, ...parte } : c,
      ),
    })
  }

  function alternar(campo: NomeDoCampo, ligado: boolean) {
    onChange({
      ...estado,
      campos: ligado
        ? [...estado.campos, campoNovo(campo, lado)]
        : estado.campos.filter((c) => !(c.campo === campo && c.lado === lado)),
    })
    if (ligado) setSelecionado(campo)
  }

  function arrastar(campo: NomeDoCampo, e: EventoDeCursor<HTMLElement>) {
    const caixa = palco.current?.getBoundingClientRect()
    if (!caixa) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelecionado(campo)
    const mover = (ev: PointerEvent) => {
      mudar(campo, {
        x: limitar((ev.clientX - caixa.left) / caixa.width, 0, 1),
        y: limitar((ev.clientY - caixa.top) / caixa.height, 0, 1),
      })
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  async function previa() {
    if (!estado.frente) return
    setGerando(true)
    try {
      const resposta = await fetch('/api/painel/certificados/previa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          frente: estado.frente,
          verso: estado.verso,
          campos: estado.campos,
        }),
      })
      if (!resposta.ok) {
        const json = (await resposta.json().catch(() => ({}))) as {
          erro?: string
        }
        throw new Error(json.erro ?? 'Não deu para gerar a prévia.')
      }
      const url = URL.createObjectURL(await resposta.blob())
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não deu para gerar.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center gap-3">
        <CardTitle className="text-base">Modelo</CardTitle>
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={lado === 'frente' ? 'default' : 'outline'}
            onClick={() => setLado('frente')}
          >
            Frente
          </Button>
          <Button
            type="button"
            size="sm"
            variant={lado === 'verso' ? 'default' : 'outline'}
            onClick={() => setLado('verso')}
          >
            Verso
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!estado.frente || gerando}
            onClick={previa}
          >
            <Eye />
            {gerando ? 'Gerando…' : 'Prévia em PDF'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoDeImagem
            rotulo="Imagem da frente (PNG ou JPEG)"
            valor={estado.frente}
            aceitar="image/png,image/jpeg"
            onChange={(chave) => onChange({ ...estado, frente: chave })}
          />
          <CampoDeImagem
            rotulo="Imagem do verso (opcional)"
            valor={estado.verso}
            aceitar="image/png,image/jpeg"
            onChange={(chave) => onChange({ ...estado, verso: chave })}
          />
        </div>

        {!imagem ? (
          <p className="text-sm text-muted-foreground">
            {lado === 'frente'
              ? 'Envie a imagem da frente para posicionar os campos.'
              : 'Envie a imagem do verso para posicionar campos nele.'}
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div
              ref={palco}
              className="relative w-full select-none overflow-hidden rounded-md border bg-muted"
              style={{ containerType: 'inline-size' }}
              data-testid="palco-do-certificado"
            >
              <img
                src={urlDaImagem(imagem) ?? ''}
                alt={`Modelo do certificado, ${lado}`}
                className="block w-full"
                draggable={false}
              />
              {camposDoLado.map((c) => {
                const escolhido = c.campo === selecionado
                return (
                  <button
                    key={c.campo}
                    type="button"
                    aria-label={`Arrastar ${ROTULO_DO_CAMPO[c.campo]}`}
                    data-campo={c.campo}
                    onPointerDown={(e) => arrastar(c.campo, e)}
                    style={{ ...estiloDoCampo(c), touchAction: 'none' }}
                    className={`absolute cursor-move whitespace-nowrap rounded-sm outline-offset-2 ${
                      escolhido
                        ? 'outline outline-2 outline-primary'
                        : 'outline outline-1 outline-dashed outline-primary/40'
                    } ${c.campo === 'qr' ? 'grid place-items-center bg-white text-[1.4cqw] font-medium text-black' : ''}`}
                  >
                    {c.campo === 'qr' ? 'QR' : exemplo[c.campo]}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">
                  Campos na {lado}
                </legend>
                {NOMES_DOS_CAMPOS.map((nome) => {
                  const ligado = camposDoLado.some((c) => c.campo === nome)
                  return (
                    <div key={nome} className="flex items-center gap-2">
                      <Checkbox
                        id={`campo-${lado}-${nome}`}
                        checked={ligado}
                        onCheckedChange={(v) => alternar(nome, v === true)}
                      />
                      <Label
                        htmlFor={`campo-${lado}-${nome}`}
                        className="flex-1 font-normal"
                      >
                        {ROTULO_DO_CAMPO[nome]}
                      </Label>
                      {ligado && nome !== selecionado && (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => setSelecionado(nome)}
                        >
                          Ajustar
                        </Button>
                      )}
                    </div>
                  )
                })}
              </fieldset>

              {atual && (
                <fieldset className="flex flex-col gap-3 rounded-md border p-3">
                  <legend className="px-1 text-sm font-medium">
                    {ROTULO_DO_CAMPO[atual.campo]}
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    <NumeroDoCampo
                      rotulo="Horizontal (%)"
                      valor={porcento(atual.x)}
                      min={0}
                      max={100}
                      onChange={(v) =>
                        mudar(atual.campo, { x: limitar(v / 100, 0, 1) })
                      }
                    />
                    <NumeroDoCampo
                      rotulo="Vertical (%)"
                      valor={porcento(atual.y)}
                      min={0}
                      max={100}
                      onChange={(v) =>
                        mudar(atual.campo, { y: limitar(v / 100, 0, 1) })
                      }
                    />
                    <NumeroDoCampo
                      rotulo={
                        atual.campo === 'qr' ? 'Lado (pt)' : 'Tamanho (pt)'
                      }
                      valor={atual.tamanho}
                      min={atual.campo === 'qr' ? 40 : 6}
                      max={atual.campo === 'qr' ? 300 : 200}
                      onChange={(v) => mudar(atual.campo, { tamanho: v })}
                    />
                    {atual.campo !== 'qr' && (
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="cor-do-campo">Cor</Label>
                        <input
                          id="cor-do-campo"
                          type="color"
                          value={atual.cor}
                          className="h-9 w-full rounded-md border bg-transparent"
                          onChange={(e) =>
                            mudar(atual.campo, { cor: e.target.value })
                          }
                        />
                      </div>
                    )}
                  </div>
                  {atual.campo !== 'qr' && (
                    <>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="fonte-do-campo">Fonte</Label>
                        <SelectNativo
                          id="fonte-do-campo"
                          value={atual.fonte}
                          onChange={(e) =>
                            mudar(atual.campo, {
                              fonte: e.target.value as Fonte,
                            })
                          }
                        >
                          {FONTES.map((f) => (
                            <option key={f} value={f}>
                              {ROTULO_DA_FONTE[f]}
                            </option>
                          ))}
                        </SelectNativo>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="alinhamento-do-campo">
                          Alinhamento
                        </Label>
                        <SelectNativo
                          id="alinhamento-do-campo"
                          value={atual.alinhamento}
                          onChange={(e) =>
                            mudar(atual.campo, {
                              alinhamento: e.target.value as Alinhamento,
                            })
                          }
                        >
                          {ALINHAMENTOS.map((a) => (
                            <option key={a} value={a}>
                              {ROTULO_DO_ALINHAMENTO[a]}
                            </option>
                          ))}
                        </SelectNativo>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="negrito-do-campo"
                          checked={atual.negrito}
                          onCheckedChange={(v) =>
                            mudar(atual.campo, { negrito: v === true })
                          }
                        />
                        <Label
                          htmlFor="negrito-do-campo"
                          className="font-normal"
                        >
                          Negrito
                        </Label>
                      </div>
                    </>
                  )}
                </fieldset>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function NumeroDoCampo({
  rotulo,
  valor,
  min,
  max,
  onChange,
}: {
  rotulo: string
  valor: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const id = `numero-${rotulo.replace(/\W+/g, '-')}`
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step="any"
        inputMode="decimal"
        value={valor}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(v)) onChange(v)
        }}
      />
    </div>
  )
}
