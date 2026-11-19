import { expect, type Page, test } from '@playwright/test'
import {
  cadastrarUsuario,
  criarEdicaoDoCurso,
  entrarPorCodigo,
  esperarNoLog,
  esperarReact,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// Sem provedor de e-mail, o `vite dev` imprime o e-mail no terminal (e2e/.dev.log): é de lá que o
// teste lê o link de entrada. O envio passa pela FILA_EMAIL de verdade (miniflare).
async function abrirMais(pagina: Page) {
  const mais = pagina.getByRole('button', { name: /^Mais/ })
  await esperarReact(mais)
  await mais.click()
  await expect(mais).toHaveAttribute('aria-expanded', 'true')
}

test('Curso liberado chega pela fila com link de entrada de uso único, e o histórico e Minha conta funcionam', async ({
  page,
  browser,
}) => {
  const id = unico()
  const equipe = `equipe-${id}@exemplo.test`
  const ana = `ana-${id}@exemplo.test`
  cadastrarUsuario({ email: equipe, perfil: 'equipe' })
  await entrarPorCodigo(page, equipe)

  await page.goto('/painel/conteudo')
  await esperarReact(page.getByLabel('Nome do novo curso'))
  await page.getByLabel('Nome do novo curso').fill(`Curso ${id}`)
  await page.getByRole('button', { name: 'Criar curso' }).click()
  await expect(page).toHaveURL(/\/painel\/conteudo\/[\w-]+$/)
  await criarEdicaoDoCurso(page, `Curso ${id}`, `Turma ${id}`)

  await page.goto('/painel/matricular')
  await esperarReact(page.getByLabel('E-mails dos alunos'))
  await page
    .getByLabel('Turma', { exact: true })
    .selectOption({ label: `Curso ${id} · Turma ${id}` })
  await page.getByLabel('E-mails dos alunos').fill(`${ana}, Ana Souza`)
  await page.getByRole('button', { name: 'Matricular' }).click()
  await expect(
    page.getByLabel('Resumo da matrícula manual').getByText('Matriculados: 1'),
  ).toBeVisible()

  // O e-mail sai pela fila: assunto do texto padrão e o link de entrada.
  const emailNoLog = await esperarNoLog(
    new RegExp(
      `para: ${ana} \\| assunto: Seu acesso a Curso ${id} está liberado[\\s\\S]*?(http://localhost:\\d+/api/auth/magic-link/verify\\?\\S+)`,
    ),
    30_000,
  )
  const link = emailNoLog[1]

  // O link entra uma vez só.
  const contexto = await browser.newContext()
  const aluna = await contexto.newPage()
  await aluna.goto(link)
  await expect(aluna).toHaveURL(/\/primeiro-acesso/)
  const outra = await browser.newContext()
  const reuso = await outra.newPage()
  await reuso.goto(link)
  await expect(reuso).toHaveURL(/\/login/)
  await outra.close()

  // A equipe vê o e-mail no histórico da aluna e reenvia o link de acesso.
  await page.goto('/painel/alunos')
  await esperarReact(page.getByLabel('Buscar aluno'))
  await page.getByLabel('Buscar aluno').fill(ana)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('link', { name: new RegExp(ana) }).click()
  const historico = page.getByLabel('E-mails enviados')
  await expect(historico.getByText('Curso liberado')).toBeVisible()
  await expect(historico.getByText('Enviado', { exact: true })).toBeVisible()
  await historico
    .getByRole('button', { name: 'Reenviar link de acesso' })
    .click()
  await expect(page.getByText(/Link de acesso na fila/)).toBeVisible()
  await esperarNoLog(
    new RegExp(`para: ${ana} \\| assunto: Seu acesso está pronto`),
    30_000,
  )

  // Minha conta: só os e-mails marcados têm interruptor, e a escolha fica.
  await expect(async () => {
    const caixa = aluna.getByRole('checkbox')
    if ((await caixa.getAttribute('data-state')) !== 'checked') {
      await caixa.click()
    }
    await expect(aluna.getByRole('button', { name: 'Continuar' })).toBeEnabled({
      timeout: 1000,
    })
  }).toPass()
  await aluna.getByRole('button', { name: 'Continuar' }).click()
  await expect(aluna).toHaveURL(/\/$/)
  await aluna.goto('/conta')
  // "Mais" começa recolhido; os e-mails ficam dentro dele.
  await abrirMais(aluna)
  const falta = aluna.getByRole('checkbox', { name: /Sentimos sua falta/ })
  await esperarReact(falta)
  await expect(falta).toBeChecked()
  await expect(
    aluna.getByRole('checkbox', { name: /Curso liberado/ }),
  ).toHaveCount(0)
  await falta.click()
  await expect(falta).not.toBeChecked()
  await aluna.reload()
  await abrirMais(aluna)
  await expect(
    aluna.getByRole('checkbox', { name: /Sentimos sua falta/ }),
  ).not.toBeChecked()
  await contexto.close()
})

test('o Proprietário edita o texto de um e-mail e vê a prévia; o código é travado', async ({
  page,
}) => {
  const id = unico()
  const dono = `dono-${id}@exemplo.test`
  cadastrarUsuario({ email: dono, perfil: 'proprietario' })
  await entrarPorCodigo(page, dono)
  await page.goto('/painel/emails')
  const cartao = page.getByLabel('Troca de e-mail', { exact: true })
  await esperarReact(cartao.getByLabel('Assunto'))
  await cartao.getByLabel('Assunto').fill(`Novo endereço ${id}`)
  await cartao.getByRole('button', { name: 'Ver prévia' }).click()
  await expect(cartao.getByText(`Assunto: Novo endereço ${id}`)).toBeVisible()
  await cartao.getByLabel('Texto').fill('Oi {{cpf}}')
  await cartao.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText(/Variável desconhecida/)).toBeVisible()
  await cartao.getByLabel('Texto').fill('Oi, {{nome}}! Agora é {{emailNovo}}.')
  await cartao.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Texto salvo.')).toBeVisible()
  await expect(cartao.getByText('Editado')).toBeVisible()
  await cartao.getByRole('button', { name: 'Voltar ao texto padrão' }).click()
  // Pede confirmação antes de apagar o texto escrito.
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Voltar ao texto padrão' })
    .click()
  await expect(page.getByText('Texto padrão restaurado.')).toBeVisible()

  const codigo = page.getByLabel('Código de acesso', { exact: true })
  await expect(codigo.getByText('Texto travado')).toBeVisible()
  await expect(codigo.getByLabel('Assunto')).toBeDisabled()
})
