/**
 * Formulário de um nome só (criar curso, categoria, módulo ou aula): campo com rótulo visível e erro
 * embaixo, botão sempre ligado (desligado só durante o envio) e, se quiser, "Cancelar".
 *
 *   <FormularioDeNome
 *     rotulo="Novo módulo"                       // rótulo visível
 *     nomeAcessivel="Nome do novo módulo"        // nome do campo para leitor de tela (opcional)
 *     salvar="Criar módulo"
 *     valor={nome} onChange={setNome}
 *     erros={erros} ocupado={ocupado}
 *     onEnviar={enviar}
 *   />
 *
 * `erros.nome` aparece no campo. A conferência do que foi digitado é de quem usa (`validarNome`).
 */
import {
  AcoesDoFormulario,
  CampoDoPainel,
} from '#/components/painel/formulario'
import { Input } from '#/components/ui/input'
import { LIMITE_DO_NOME } from '#/regras/formulario-do-curso'
import type { ErrosDoFormulario } from '#/regras/painel'

export function FormularioDeNome({
  rotulo,
  nomeAcessivel,
  placeholder,
  salvar,
  secundario,
  valor,
  onChange,
  erros,
  ocupado,
  onEnviar,
  onCancelar,
  limite = LIMITE_DO_NOME,
}: {
  rotulo: string
  nomeAcessivel?: string
  placeholder?: string
  salvar: string
  secundario?: boolean
  valor: string
  onChange: (valor: string) => void
  erros: ErrosDoFormulario
  ocupado: boolean
  onEnviar: () => void
  onCancelar?: () => void
  limite?: number
}) {
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onEnviar()
      }}
    >
      <CampoDoPainel rotulo={rotulo} erro={erros.nome}>
        <Input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={nomeAcessivel}
          maxLength={limite}
          autoComplete="off"
        />
      </CampoDoPainel>
      <AcoesDoFormulario
        salvar={salvar}
        secundario={secundario}
        ocupado={ocupado}
        erros={erros}
        onCancelar={onCancelar}
        className="pt-0"
      />
    </form>
  )
}
