import { expect, test } from '@playwright/test'
import {
  cadastrarUsuario,
  entrarPorCodigo,
  esperarNoLog,
  esperarReact,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// Um PNG de 1x1 pixel.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==',
  'base64',
)

test('a aluna fala com a equipe num fio só: sem assunto, a resposta aparece no fio e, depois de Resolvida, a próxima mensagem abre outra conversa no painel', async ({
  page,
  browser,
}) => {
  const id = unico()
  const ana = `ana-${id}@exemplo.test`
  const equipe = `equipe-${id}@exemplo.test`
  cadastrarUsuario({ email: ana, nome: 'Ana Souza' })
  cadastrarUsuario({ email: equipe, perfil: 'equipe', nome: 'Carla Equipe' })

  // Pelo menu do avatar, "Falar com a equipe" leva ao fio.
  await entrarPorCodigo(page, ana)
  await page.goto('/')
  const botaoDoMenu = page.getByRole('button', {
    name: 'Abrir menu da conta',
  })
  await esperarReact(botaoDoMenu)
  await expect(async () => {
    await botaoDoMenu.click()
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 1000 })
  }).toPass()
  await page.getByRole('menuitem', { name: 'Falar com a equipe' }).click()
  await expect(page).toHaveURL(/\/atendimento$/)

  // Sem lista, assunto nem estados: só o campo e o tempo de resposta.
  await expect(
    page.getByText('A equipe costuma responder em até 1 dia útil.'),
  ).toBeVisible()
  await expect(page.getByLabel('Assunto')).toHaveCount(0)
  await expect(page.getByText('Nova conversa')).toHaveCount(0)

  // Escreve com uma imagem e envia com ⌘Enter.
  const campo = page.getByLabel('Mensagem')
  await esperarReact(campo)
  await campo.fill(`Ajuda ${id}`)
  await page.getByLabel('Anexar imagens').setInputFiles({
    name: 'tela.png',
    mimeType: 'image/png',
    buffer: PNG,
  })
  await expect(page.getByAltText('Imagem para anexar')).toBeVisible()
  await campo.press('Control+Enter')
  const fio = page.getByRole('log', { name: 'Conversa com a equipe' })
  await expect(fio.getByText(`Ajuda ${id}`)).toBeVisible()
  await expect(fio.getByAltText('Imagem anexada')).toBeVisible()
  await expect
    .poll(() =>
      fio
        .getByAltText('Imagem anexada')
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBeGreaterThan(0)
  await expect(page.getByText('Hoje', { exact: true })).toBeVisible()
  // Nenhum estado de conversa à mostra.
  await expect(page.getByText('Aberta', { exact: true })).toHaveCount(0)

  // A equipe vê a conversa (assunto tirado do começo da mensagem) e responde.
  const contextoDaEquipe = await browser.newContext()
  const painel = await contextoDaEquipe.newPage()
  await entrarPorCodigo(painel, equipe)
  await painel.goto('/painel/atendimento')
  await painel.getByRole('link', { name: new RegExp(`Ajuda ${id}`) }).click()
  await expect(painel).toHaveURL(/\/painel\/atendimento\/[\w-]+$/)
  await esperarReact(painel.getByLabel('Mensagem'))
  await painel.getByLabel('Mensagem').fill('Já liberei, tente de novo.')
  await painel.getByRole('button', { name: 'Responder' }).click()
  await expect(painel.getByText('Resposta enviada.')).toBeVisible()

  // O e-mail sai com o código da conversa no assunto.
  await esperarNoLog(
    new RegExp(
      `para: ${ana} \\| assunto: Resposta ao seu atendimento: Ajuda ${id} \\[Atendimento #[A-Z0-9]{6}\\]`,
    ),
    30_000,
  )

  // A resposta aparece no fio, com o nome e o selo Equipe.
  await page.reload()
  await expect(page.getByText('Já liberei, tente de novo.')).toBeVisible()
  await expect(page.getByText('Carla Equipe').first()).toBeVisible()
  await expect(page.getByText('Equipe', { exact: true })).toBeVisible()

  // A aluna continua a mesma conversa.
  await esperarReact(page.getByLabel('Mensagem'))
  await page.getByLabel('Mensagem').fill('Funcionou, obrigada!')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(page.getByText('Funcionou, obrigada!')).toBeVisible()

  // A equipe resolve.
  await painel.reload()
  const resolver = painel.getByRole('button', {
    name: 'Marcar como resolvida',
  })
  await esperarReact(resolver)
  await resolver.click()
  await expect(painel.getByText('Conversa resolvida.')).toBeVisible()

  // Depois de Resolvida, a próxima mensagem abre outra conversa no painel...
  await page.reload()
  await esperarReact(page.getByLabel('Mensagem'))
  await page.getByLabel('Mensagem').fill(`Outra dúvida ${id}`)
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(page.getByText(`Outra dúvida ${id}`)).toBeVisible()
  await painel.goto('/painel/atendimento')
  await expect(
    painel.getByRole('link', { name: new RegExp(`Outra dúvida ${id}`) }),
  ).toBeVisible()
  await painel.goto('/painel/atendimento?estado=resolvida')
  await expect(
    painel.getByRole('link', { name: new RegExp(`Ajuda ${id}`) }),
  ).toBeVisible()

  // ...mas para a aluna é o mesmo fio, com tudo em ordem.
  await page.reload()
  const textos = await fio.locator('p').allInnerTexts()
  expect(textos).toEqual([
    `Ajuda ${id}`,
    'Já liberei, tente de novo.',
    'Funcionou, obrigada!',
    `Outra dúvida ${id}`,
  ])
  await contextoDaEquipe.close()
})

test('os links antigos do atendimento abrem o fio', async ({ page }) => {
  const ana = `ana-${unico()}@exemplo.test`
  cadastrarUsuario({ email: ana, nome: 'Ana Souza' })
  await entrarPorCodigo(page, ana)
  for (const rota of ['/atendimento/nova', '/atendimento/qualquer-conversa']) {
    await page.goto(rota)
    await expect(page).toHaveURL(/\/atendimento$/)
    await expect(page.getByLabel('Mensagem')).toBeVisible()
  }
})
