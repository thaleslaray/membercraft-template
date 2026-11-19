import { createServerFn } from '@tanstack/react-start'

import { getRequestSession } from '#/lib/request-session'

// Sessão ou nulo (para guardas de rota: aqui não redireciona, só informa).
// O cache da sessão em cookie (`session.cookieCache`) devolve como `Date` todo texto que parece data ISO
// (o Better Auth revive datas ao ler o cookie): `termosVersao` guarda um ISO e voltaria como Date, e a
// comparação com a versão vigente dos Termos falharia (o aluno cairia de novo em /primeiro-acesso).
// Aqui o texto volta a ser texto; `toISOString` devolve exatamente o valor original.
export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const sessao = await getRequestSession()
    if (!sessao) return null
    // A tela só precisa de id, dono e validade da sessão; o restante fica no servidor.
    const { id, userId, expiresAt } = sessao.session
    // `impersonatedBy` preenchido = a Equipe está vendo a escola como esta aluna (faixa "Você está vendo como").
    const impersonatedBy =
      (sessao.session as { impersonatedBy?: string | null }).impersonatedBy ??
      null
    const enxuta = {
      ...sessao,
      session: { id, userId, expiresAt, impersonatedBy },
    }
    const { termosVersao } = sessao.user as { termosVersao?: unknown }
    if (termosVersao instanceof Date) {
      return {
        ...enxuta,
        user: { ...sessao.user, termosVersao: termosVersao.toISOString() },
      }
    }
    return enxuta
  },
)
