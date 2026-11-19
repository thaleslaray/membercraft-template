import * as React from "react"
import { cn } from "#/lib/utils"
import { ChevronDownIcon } from "lucide-react"
import { Accordion as AccordionPrimitive } from "radix-ui"

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}

// Ajustes do projeto: `seta="inicio"` põe a seta antes do texto, apontando para a direita quando fechado
// (como nos módulos da área antiga); `nivel` escolhe o título que envolve o gatilho (h3 por padrão).
function AccordionTrigger({
  className,
  children,
  seta = "fim",
  nivel = 3,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  seta?: "inicio" | "fim"
  nivel?: 2 | 3 | 4
}) {
  const Titulo = `h${nivel}` as const
  const icone =
    seta === "inicio" ? (
      <ChevronDownIcon className="pointer-events-none size-6 shrink-0 -rotate-90 text-foreground transition-transform duration-lento ease-saida" />
    ) : (
      <ChevronDownIcon className="pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-lento ease-saida" />
    )
  return (
    <AccordionPrimitive.Header asChild>
      <Titulo className="flex">
        <AccordionPrimitive.Trigger
          data-slot="accordion-trigger"
          className={cn(
            "flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-[color,background-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 in-data-[area=painel]:focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
            seta === "inicio"
              ? "[&[data-state=open]>svg:first-child]:rotate-0"
              : "[&[data-state=open]>svg:last-child]:rotate-180",
            className
          )}
          {...props}
        >
          {seta === "inicio" && icone}
          {children}
          {seta === "fim" && icone}
        </AccordionPrimitive.Trigger>
      </Titulo>
    </AccordionPrimitive.Header>
  )
}

// Altura por `grid-template-rows` (movimento.css, `.recolhe`): `forceMount` mantém o conteúdo no DOM para a
// transição poder voltar do ponto onde está; fechado, fica invisível e fora da árvore de acessibilidade.
// A transição mora num filho porque o Radix zera a `transition-duration` inline do próprio Content.
function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      forceMount
      className="text-sm"
      {...props}
    >
      <div className="recolhe">
        <div className="recolhe-miolo">
          <div className={cn("pt-0 pb-4", className)}>{children}</div>
        </div>
      </div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
