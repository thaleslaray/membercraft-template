// Plugin do Better Auth para "Entrar como esta aluna". Faz o mesmo que `impersonateUser` /
// `stopImpersonating` do plugin `admin` (a sessão da aluna guarda `impersonatedBy`; a sessão original
// fica num cookie assinado `admin_session`), mas decide pelo `perfil` da escola e grava no registro de
// ações. O plugin `admin` pede colunas `role`/`banned` e um segundo modelo de papéis que duplicaria
// `regras/permissoes.ts`; por isso o plugin é próprio e só precisa da coluna `session.impersonated_by`.
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api'
import {
  deleteSessionCookie,
  expireCookie,
  setSessionCookie,
} from 'better-auth/cookies'
import { z } from 'zod'

import { getDb } from '#/db/index'
import { agora } from '#/lib/relogio'
import {
  ErroDeEntrarComo,
  expiracaoDeEntrarComo,
  MENSAGEM_EMAIL_BLOQUEADO,
  registrarEntradaComo,
  registrarSaidaDeEntrarComo,
  trocaDeEmailBloqueada,
  validarEntradaComo,
} from '#/regras/entrar-como'
import { PermissaoNegada, tratarPerfil } from '#/regras/permissoes'

const COOKIE_DA_SESSAO_ORIGINAL = 'entrar_como_sessao'

export function entrarComo(env: Env) {
  return {
    id: 'entrar-como',
    schema: {
      session: {
        fields: {
          impersonatedBy: { type: 'string', required: false, input: false },
        },
      },
    },
    hooks: {
      before: [
        {
          // A aluna não troca o e-mail enquanto a Equipe a representa.
          matcher: (contexto: { path?: string }) =>
            contexto.path === '/change-email' ||
            contexto.path === '/update-user',
          handler: createAuthMiddleware(async (ctx) => {
            const sessao = await getSessionFromCtx(ctx)
            const por = (
              sessao?.session as { impersonatedBy?: string | null } | undefined
            )?.impersonatedBy
            const mexeNoEmail =
              ctx.path === '/change-email' ||
              (ctx.body as { email?: unknown } | undefined)?.email !== undefined
            if (mexeNoEmail && trocaDeEmailBloqueada(por)) {
              throw APIError.from('FORBIDDEN', {
                message: MENSAGEM_EMAIL_BLOQUEADO,
                code: 'EMAIL_BLOQUEADO_EM_ENTRAR_COMO',
              })
            }
          }),
        },
      ],
    },
    endpoints: {
      entrarComoAluna: createAuthEndpoint(
        '/entrar-como/iniciar',
        {
          method: 'POST',
          body: z.object({ alunoId: z.string().min(1).max(200) }),
          requireHeaders: true,
        },
        async (ctx) => {
          const atual = await getSessionFromCtx(ctx, {
            disableCookieCache: true,
          })
          if (!atual) throw APIError.fromStatus('UNAUTHORIZED')
          const db = getDb(env.DB)
          const autor = {
            id: atual.user.id,
            perfil: tratarPerfil((atual.user as { perfil?: string }).perfil),
          }
          // Quem já está vendo como alguém não encadeia: primeiro volta para a própria conta.
          if ((atual.session as { impersonatedBy?: string }).impersonatedBy) {
            throw APIError.from('BAD_REQUEST', {
              message:
                'Volte para a sua conta antes de entrar como outra aluna.',
              code: 'JA_EM_ENTRAR_COMO',
            })
          }
          let aluna: Awaited<ReturnType<typeof validarEntradaComo>>
          try {
            aluna = await validarEntradaComo(db, {
              autor,
              alunoId: ctx.body.alunoId,
            })
          } catch (e) {
            if (e instanceof PermissaoNegada) {
              throw APIError.from('FORBIDDEN', {
                message: 'Você não pode entrar como uma aluna.',
                code: 'SEM_PERMISSAO',
              })
            }
            if (e instanceof ErroDeEntrarComo) {
              throw APIError.from('BAD_REQUEST', {
                message: e.message,
                code: 'ENTRADA_RECUSADA',
              })
            }
            throw e
          }
          const expiraEm = expiracaoDeEntrarComo(agora())
          const sessao = await ctx.context.internalAdapter.createSession(
            aluna.id,
            true,
            { impersonatedBy: autor.id, expiresAt: expiraEm },
            true,
          )
          if (!sessao) throw APIError.fromStatus('INTERNAL_SERVER_ERROR')
          const alvo = await ctx.context.internalAdapter.findUserById(aluna.id)
          if (!alvo) throw APIError.fromStatus('INTERNAL_SERVER_ERROR')

          const cookieOriginal = ctx.context.createAuthCookie(
            COOKIE_DA_SESSAO_ORIGINAL,
          )
          const original = atual.session.token
          deleteSessionCookie(ctx)
          await ctx.setSignedCookie(
            cookieOriginal.name,
            original,
            ctx.context.secret,
            ctx.context.authCookies.sessionToken.attributes,
          )
          await setSessionCookie(ctx, { session: sessao, user: alvo }, true)
          await registrarEntradaComo(db, agora, {
            autorId: autor.id,
            aluna,
            expiraEm,
          })
          return ctx.json({ ok: true, alunaId: aluna.id })
        },
      ),
      sairDeEntrarComo: createAuthEndpoint(
        '/entrar-como/sair',
        { method: 'POST', requireHeaders: true },
        async (ctx) => {
          const atual = await getSessionFromCtx(ctx, {
            disableCookieCache: true,
          })
          if (!atual) throw APIError.fromStatus('UNAUTHORIZED')
          const autorId = (atual.session as { impersonatedBy?: string | null })
            .impersonatedBy
          if (!autorId) {
            throw APIError.from('BAD_REQUEST', {
              message: 'Você não está vendo como uma aluna.',
              code: 'FORA_DE_ENTRAR_COMO',
            })
          }
          const cookieOriginal = ctx.context.createAuthCookie(
            COOKIE_DA_SESSAO_ORIGINAL,
          )
          const token = await ctx.getSignedCookie(
            cookieOriginal.name,
            ctx.context.secret,
          )
          const original = token
            ? await ctx.context.internalAdapter.findSession(token)
            : null
          await ctx.context.internalAdapter.deleteSession(atual.session.token)
          expireCookie(ctx, cookieOriginal)
          const db = getDb(env.DB)
          await registrarSaidaDeEntrarComo(db, agora, {
            autorId,
            alunoId: atual.user.id,
          })
          if (!original || original.session.userId !== autorId) {
            // Sem a sessão original (apagada ou vencida): a pessoa entra de novo pelo login.
            deleteSessionCookie(ctx)
            return ctx.json({ ok: true, voltou: false, alunaId: atual.user.id })
          }
          await setSessionCookie(ctx, original, false)
          return ctx.json({ ok: true, voltou: true, alunaId: atual.user.id })
        },
      ),
    },
  } satisfies import('better-auth').BetterAuthPlugin
}
