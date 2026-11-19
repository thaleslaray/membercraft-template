import { eq } from 'drizzle-orm'

import { appConfig } from '#/config/app'
import { configuracaoDaArea } from '#/db/schema'
import { prepararRegistro } from '#/regras/registro-de-acoes'
import type { Banco, Relogio } from '#/regras/tipos'
import { interpretarVimeo, urlDoPlayer } from '#/regras/vimeo'

/**
 * Configuração da área (#64): Termos de uso, política de privacidade e contato de suporte,
 * editados pelo Proprietário. Uma linha só (id `padrao`); sem ela valem os padrões abaixo.
 * A versão dos Termos mora aqui: mudá-la pede novo aceite de todo aluno (ver `pendenciasDoPrimeiroAcesso`).
 */

export type ConfiguracaoDaArea = {
  termosVersao: string
  termosTexto: string
  privacidadeTexto: string
  suporteEmail: string
  /** Endereço do player do Vimeo do vídeo de boas-vindas; nulo = sem vídeo. */
  boasVindasVimeo: string | null
  atualizadoEm: Date | null
}

export type EntradaDaConfiguracao = {
  termosTexto?: string
  privacidadeTexto?: string
  suporteEmail?: string
  /** Link do Vimeo do vídeo de boas-vindas; vazio tira o vídeo. */
  boasVindasVimeo?: string
  /** Marcar quando a mudança nos Termos for para valer: vira versão nova e todo aluno aceita de novo. */
  exigirNovoAceite?: boolean
}

export class ErroDeConfiguracao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeConfiguracao'
  }
}

export const TEXTO_PADRAO_DOS_TERMOS =
  'Texto provisório. Os termos de uso definitivos entram antes da abertura da área de membros.'
export const TEXTO_PADRAO_DA_PRIVACIDADE =
  'Texto provisório. A política de privacidade definitiva entra antes da abertura da área de membros.'

export const configuracaoPadrao: ConfiguracaoDaArea = {
  termosVersao: appConfig.termos.versao,
  termosTexto: TEXTO_PADRAO_DOS_TERMOS,
  privacidadeTexto: TEXTO_PADRAO_DA_PRIVACIDADE,
  suporteEmail: appConfig.supportEmail,
  boasVindasVimeo: null,
  atualizadoEm: null,
}

const ID = 'padrao'
const LIMITE_DO_TEXTO = 100_000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function lerConfiguracaoDaArea(
  db: Banco,
): Promise<ConfiguracaoDaArea> {
  const [linha] = await db
    .select()
    .from(configuracaoDaArea)
    .where(eq(configuracaoDaArea.id, ID))
  if (!linha) return configuracaoPadrao
  return {
    termosVersao: linha.termosVersao,
    termosTexto: linha.termosTexto,
    privacidadeTexto: linha.privacidadeTexto,
    suporteEmail: linha.suporteEmail,
    boasVindasVimeo: linha.boasVindasVimeo,
    atualizadoEm: linha.atualizadoEm,
  }
}

function conferirTexto(valor: string, rotulo: string): string {
  const texto = valor.trim()
  if (!texto) throw new ErroDeConfiguracao(`${rotulo} não pode ficar vazio.`)
  if (texto.length > LIMITE_DO_TEXTO) {
    throw new ErroDeConfiguracao(`${rotulo} está longo demais.`)
  }
  return texto
}

const HOSTS_DO_VIMEO = new Set([
  'vimeo.com',
  'www.vimeo.com',
  'player.vimeo.com',
])

// Só link do Vimeo: a primeira URL do que foi colado (serve o iframe inteiro) precisa ser de um
// endereço do Vimeo. Devolve o endereço do player, o mesmo que a aula usa.
function conferirVimeo(entrada: string): string {
  const url = /https:\/\/[^\s"'<>]+/.exec(entrada)?.[0]
  let host = ''
  try {
    host = url ? new URL(url).hostname : ''
  } catch {}
  const video = HOSTS_DO_VIMEO.has(host) && url ? interpretarVimeo(url) : null
  if (!video) {
    throw new ErroDeConfiguracao(
      'Cole um link do Vimeo, como https://vimeo.com/123456789.',
    )
  }
  return urlDoPlayer(video.id, video.hash)
}

/**
 * Interruptor "Usar a Voomp" (#146): grava só ele e mantém o resto da configuração.
 * Sem linha ainda, cria uma com os padrões.
 */
export async function definirVoompLigada(
  db: Banco,
  relogio: Relogio,
  ligada: boolean,
  autorId?: string,
): Promise<void> {
  const agora = relogio()
  await db
    .insert(configuracaoDaArea)
    .values({
      id: ID,
      termosVersao: configuracaoPadrao.termosVersao,
      termosTexto: configuracaoPadrao.termosTexto,
      privacidadeTexto: configuracaoPadrao.privacidadeTexto,
      suporteEmail: configuracaoPadrao.suporteEmail,
      voompLigada: ligada,
      atualizadoEm: agora,
      atualizadoPor: autorId ?? null,
    })
    .onConflictDoUpdate({
      target: configuracaoDaArea.id,
      set: {
        voompLigada: ligada,
        atualizadoEm: agora,
        atualizadoPor: autorId ?? null,
      },
    })
}

/**
 * Salva o que veio e mantém o resto. A versão dos Termos só muda com `exigirNovoAceite`
 * (a versão nova é o instante da edição, sempre diferente da anterior).
 */
export async function salvarConfiguracaoDaArea(
  db: Banco,
  relogio: Relogio,
  entrada: EntradaDaConfiguracao,
  autorId?: string,
): Promise<ConfiguracaoDaArea> {
  const atual = await lerConfiguracaoDaArea(db)
  const agora = relogio()

  let suporteEmail = atual.suporteEmail
  if (entrada.suporteEmail !== undefined) {
    suporteEmail = entrada.suporteEmail.trim()
    if (!EMAIL.test(suporteEmail)) {
      throw new ErroDeConfiguracao('Informe um e-mail de suporte válido.')
    }
  }
  let boasVindasVimeo = atual.boasVindasVimeo
  if (entrada.boasVindasVimeo !== undefined) {
    boasVindasVimeo = entrada.boasVindasVimeo.trim()
      ? conferirVimeo(entrada.boasVindasVimeo)
      : null
  }
  const proxima = {
    termosVersao: entrada.exigirNovoAceite
      ? agora.toISOString()
      : atual.termosVersao,
    termosTexto:
      entrada.termosTexto !== undefined
        ? conferirTexto(entrada.termosTexto, 'O texto dos Termos de uso')
        : atual.termosTexto,
    privacidadeTexto:
      entrada.privacidadeTexto !== undefined
        ? conferirTexto(
            entrada.privacidadeTexto,
            'O texto da política de privacidade',
          )
        : atual.privacidadeTexto,
    suporteEmail,
    boasVindasVimeo,
  }
  const gravar = db
    .insert(configuracaoDaArea)
    .values({
      id: ID,
      ...proxima,
      atualizadoEm: agora,
      atualizadoPor: autorId ?? null,
    })
    .onConflictDoUpdate({
      target: configuracaoDaArea.id,
      set: { ...proxima, atualizadoEm: agora, atualizadoPor: autorId ?? null },
    })
  // Trocar ou tirar o vídeo entra no Registro de ações, na mesma escrita (tudo ou nada).
  if (boasVindasVimeo !== atual.boasVindasVimeo) {
    await db.batch([
      gravar,
      prepararRegistro(db, relogio, {
        autorId: autorId ?? null,
        acao: 'boas-vindas-alterada',
        detalhe: { video: boasVindasVimeo ?? 'removido' },
      }),
    ])
  } else {
    await gravar
  }
  return { ...proxima, atualizadoEm: agora }
}
