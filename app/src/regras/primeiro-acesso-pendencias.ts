// Parte pura do primeiro acesso: o navegador importa daqui (sem o schema do banco).
import type { Perfil } from '#/regras/permissoes'

export type Pendencias = { precisaNome: boolean; precisaTermos: boolean }

// A Equipe é cadastrada por um Proprietário: só o aluno passa pelo primeiro acesso.
export function pendenciasDoPrimeiroAcesso(
  usuario: { perfil: Perfil; name: string; termosVersao: string | null },
  versaoAtualDosTermos: string,
): Pendencias {
  if (usuario.perfil !== 'aluno') {
    return { precisaNome: false, precisaTermos: false }
  }
  return {
    precisaNome: !usuario.name.trim(),
    precisaTermos: usuario.termosVersao !== versaoAtualDosTermos,
  }
}
