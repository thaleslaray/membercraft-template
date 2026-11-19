import { eq } from 'drizzle-orm'

import { user } from '#/db/schema'
import { lerConfiguracaoDaArea } from '#/regras/configuracao-da-area'
import { deveMostrarOTour } from '#/regras/minha-conta'
import { type Banco, comoLibsql } from '#/regras/tipos'

// Vídeo de boas-vindas da Helena (#101). `url` é o player do Vimeo escolhido no Estúdio (nulo = sem
// vídeo: nada aparece, nem o "Rever"). `abrirSozinho` vale no primeiro acesso, até assistir ou pular.
// O marcador é o `tour_visto_em` do aluno, que sobrou do tour removido na #93.
export type BoasVindas = { url: string | null; abrirSozinho: boolean }

export async function boasVindasDoAluno(
  db: Banco,
  userId: string,
): Promise<BoasVindas> {
  const { boasVindasVimeo } = await lerConfiguracaoDaArea(db)
  if (!boasVindasVimeo) return { url: null, abrirSozinho: false }
  const [conta] = await comoLibsql(db)
    .select({ tourVistoEm: user.tourVistoEm })
    .from(user)
    .where(eq(user.id, userId))
  return {
    url: boasVindasVimeo,
    abrirSozinho: conta ? deveMostrarOTour(conta) : false,
  }
}
