// Cola do e-mail do código de acesso: monta a mensagem e liga a regra (`enviarCodigoDeAcesso`, em
// `src/regras/envio-de-email.ts`) ao envio real.
import { getDb } from '#/db/index'
import { sendEmail } from '#/lib/email'
import { loginCodeEmail } from '#/lib/email-templates'
import { enviarCodigoDeAcesso as registrarEEnviar } from '#/regras/envio-de-email'

export function enviarCodigoDeAcesso(env: Env, email: string, otp: string) {
  return registrarEEnviar(
    getDb(env.DB),
    () => new Date(),
    { email, otp, mensagem: loginCodeEmail({ code: otp, minutes: 10 }) },
    sendEmail,
  )
}
