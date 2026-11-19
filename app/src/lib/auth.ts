import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP, magicLink } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { getDb } from '#/db/index'
import { entrarComo } from '#/lib/auth-entrar-como'
import { enviarCodigoDeAcesso } from '#/lib/email-codigo'
import { emProducaoDeVerdade } from '#/lib/producao'
import { perfilDoUsuario } from '#/regras/equipe'
import { tratarPerfil } from '#/regras/permissoes'
import { expiracaoDaSessao, expiracaoNaRenovacao } from '#/regras/sessao'

// Teto da sessão (aluno: 30 dias, renovando a cada 1 dia de uso). A Equipe tem 7 dias: o prazo
// real de cada sessão é definido pelos hooks de `session` abaixo, por perfil.
const THIRTY_DAYS = 60 * 60 * 24 * 30
const ONE_DAY = 60 * 60 * 24

// Validade do link de entrada dos e-mails "Curso liberado" e "Seu acesso está pronto": 24 horas, uso único.
const VALIDADE_DO_LINK_DE_ENTRADA = 60 * 60 * 24

export interface OpcoesDoAuth {
  /**
   * Quem pede um link de entrada (`gerarLinkDeEntrada`) recebe a URL aqui. O Better Auth não envia
   * nada sozinho: o e-mail sai pela fila, com o texto editável. Sem esta função, pedir link não faz nada.
   */
  capturarLinkDeEntrada?: (dados: { email: string; url: string }) => void
}

// Factory por request: em Workers, env só existe durante a requisição.
export function getAuth(env: Env, opcoes: OpcoesDoAuth = {}) {
  return betterAuth({
    database: drizzleAdapter(getDb(env.DB), { provider: 'sqlite' }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // Sem login com senha: só o código por e-mail (plugin emailOTP abaixo).
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: THIRTY_DAYS,
      updateAge: ONE_DAY,
      // Sessão (com os campos extras do usuário) num cookie assinado por 60 s: o getSession não vai
      // ao D1 a cada chamada. Quem altera o usuário por fora do Better Auth chama `renovarSessaoNoCookie`.
      cookieCache: { enabled: true, maxAge: 60, strategy: 'compact' },
    },
    user: {
      additionalFields: {
        perfil: { type: 'string', required: false, input: false },
        termosVersao: { type: 'string', required: false, input: false },
        termosAceitoEm: { type: 'date', required: false, input: false },
        // Minha conta (#64): alterados só pelas server functions de `conta-fns.ts`.
        telefone: { type: 'string', required: false, input: false },
        fusoHorario: { type: 'string', required: false, input: false },
        bio: { type: 'string', required: false, input: false },
        tourVistoEm: { type: 'date', required: false, input: false },
        // "Começar a próxima aula sozinha" (#99/#104): a aula lê da sessão; muda por `salvarMinhaContaFn`.
        proximaAulaSozinha: { type: 'boolean', required: false, input: false },
      },
    },
    databaseHooks: {
      // O prazo da sessão depende do perfil: aluno 30 dias, Equipe 7. A renovação com o uso
      // (a cada 1 dia) segue a mesma regra.
      session: {
        create: {
          before: async (sessao) => {
            // "Entrar como": a validade (1 hora) vem de quem criou a sessão; o perfil não a muda.
            if ((sessao as { impersonatedBy?: string }).impersonatedBy) {
              return { data: sessao }
            }
            const perfil = await perfilDoUsuario(getDb(env.DB), sessao.userId)
            return {
              data: {
                ...sessao,
                expiresAt: expiracaoDaSessao(perfil, new Date()),
              },
            }
          },
        },
        update: {
          before: async (dados, contexto) => {
            // A renovação acontece dentro do getSession, que já guarda o usuário no contexto. Se o
            // contexto vier vazio, `expiracaoNaRenovacao` cai no prazo mais curto, nunca em 30 dias.
            if (!dados.expiresAt) return
            // "Entrar como" não renova com o uso: vale 1 hora e acabou.
            if (
              (
                contexto?.context.session?.session as
                  | { impersonatedBy?: string | null }
                  | undefined
              )?.impersonatedBy
            ) {
              const { expiresAt: _naoRenova, ...resto } = dados
              return { data: resto }
            }
            const usuario = contexto?.context.session?.user as
              | { perfil?: string }
              | undefined
            const perfil = usuario ? tratarPerfil(usuario.perfil) : undefined
            return {
              data: {
                ...dados,
                expiresAt: expiracaoNaRenovacao(
                  perfil,
                  new Date(),
                  dados.expiresAt as Date,
                ),
              },
            }
          },
        },
      },
    },
    advanced: {
      // getSession lê sessão e usuário num JOIN só (relação em src/db/schema.ts): 1 ida ao D1, não 2 em fila.
      database: { joins: true },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        // Só e-mail cadastrado recebe código; o login nunca cria usuário.
        disableSignUp: true,
        // Só o hash do código fica no banco (tabela `verification`).
        storeOTP: 'hashed',
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== 'sign-in') return
          // Erro de envio é lançado de propósito: aparece no log.
          const result = await enviarCodigoDeAcesso(env, email, otp)
          console.log(
            `[email] envio de código: provedor=${result.provider} enviado=${result.sent} id=${result.id ?? '-'}`,
          )
          if (result.provider === 'console') {
            // Sem provedor de e-mail em produção, o código nunca vai para o log: falha fechada.
            if (emProducaoDeVerdade(env.AMBIENTE, import.meta.env.DEV)) {
              throw new Error('Nenhum provedor de e-mail configurado.')
            }
            console.warn(`[auth] código de login para ${email}: ${otp}`)
          }
        },
      }),
      // Link de entrada de uso único (o token é consumido na primeira visita). Só quem já tem conta.
      magicLink({
        expiresIn: VALIDADE_DO_LINK_DE_ENTRADA,
        disableSignUp: true,
        storeToken: 'hashed',
        sendMagicLink: ({ email, url }) =>
          opcoes.capturarLinkDeEntrada?.({ email, url }),
      }),
      entrarComo(env),
      // tanstackStartCookies() deve ser SEMPRE o último plugin
      tanstackStartCookies(),
    ],
  })
}
