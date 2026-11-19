// Cola do alerta ao técnico: liga a regra (`src/regras/alerta-tecnico.ts`) ao envio real de e-mail.
import { sendEmail } from '#/lib/email'
import { alertarTecnico, type Falha } from '#/regras/alerta-tecnico'

export function avisarTecnico(falha: Falha): Promise<void> {
  return alertarTecnico(falha, () => new Date(), sendEmail)
}
