import { expect, test } from '@playwright/test'
import { corpoDaFixtureHotmart } from '#/test/fixtures/hotmart'
import {
  cadastrarUsuario,
  criarEdicaoDoCurso,
  entrarPorCodigo,
  esperarReact,
  limparLigacoesDaHotmart,
  marcarCursoNoProduto,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// O produto 698441 vem da lista do servidor falso (e2e/hotmart-falsa.mjs).
const PRODUTO = '698441'

test('um aviso aprovado da Hotmart (fixture) vira matrícula e abre a aula; sem ligação fica "Sem turma"', async ({
  page,
  browser,
  request,
}) => {
  const id = unico()
  const proprietario = `dono-${id}@exemplo.test`
  const aluna = `ana-${id}@exemplo.test`
  const hottok = `hottok-e2e-${id}`
  const transacao = `HP${Date.now()}`
  limparLigacoesDaHotmart(PRODUTO)
  cadastrarUsuario({ email: proprietario, perfil: 'proprietario' })
  await entrarPorCodigo(page, proprietario)

  // Credenciais (o hottok é o que o webhook confere).
  await page.goto('/painel/vendas/plataformas')
  await esperarReact(page.getByLabel('Client ID'))
  await page.getByLabel('Client ID').fill('cid-e2e')
  await page.getByLabel('Client Secret').fill('csecret-e2e')
  await page.getByLabel('Client Token').fill('basic-e2e')
  await page.getByLabel('Hottok (assinatura do webhook)').fill(hottok)
  await page.getByRole('button', { name: 'Salvar credenciais' }).click()
  await expect(page.getByText('Credenciais salvas.')).toBeVisible()

  // Curso com um módulo e uma aula, e uma turma.
  await page.goto('/painel/conteudo')
  await esperarReact(page.getByLabel('Nome do novo curso'))
  await page.getByLabel('Nome do novo curso').fill(`Curso ${id}`)
  await page.getByRole('button', { name: 'Criar curso' }).click()
  await expect(page).toHaveURL(/\/painel\/conteudo\/[\w-]+$/)
  await page.getByLabel('Nome do novo módulo').fill('Módulo A')
  await page.getByRole('button', { name: 'Criar módulo' }).click()
  await expect(page.getByText('Módulo criado.')).toBeVisible()
  await page
    .locator('button[aria-expanded]')
    .filter({ hasText: 'Módulo A' })
    .click()
  await page.getByLabel('Título da nova aula em Módulo A').fill('Boas-vindas')
  await page
    .locator('form')
    .filter({ has: page.getByLabel('Título da nova aula em Módulo A') })
    .getByRole('button', { name: 'Criar aula' })
    .click()
  await expect(page).toHaveURL(/\/painel\/aulas\//)
  await criarEdicaoDoCurso(page, `Curso ${id}`, `Turma ${id}`, 365)

  // O webhook: sem o hottok certo é recusado.
  const aviso = corpoDaFixtureHotmart('purchase-approved', (a) => {
    a.id = `evento-${id}`
    a.data.product.id = Number(PRODUTO)
    a.data.buyer.email = aluna
    a.data.buyer.name = 'Ana Souza'
    a.data.purchase.transaction = transacao
  })
  const enviar = (corpo: string, token: string) =>
    request.post('/api/webhooks/hotmart', {
      headers: {
        'content-type': 'application/json',
        'x-hotmart-hottok': token,
      },
      data: corpo,
    })
  expect((await enviar(aviso, 'errado')).status()).toBe(401)

  // Produto sem ligação: 200 e fica "Sem turma".
  expect((await enviar(aviso, hottok)).status()).toBe(200)
  const linha = (rotulo: string) =>
    page.getByRole('row').filter({ hasText: aluna }).filter({ hasText: rotulo })
  await page.goto('/painel/vendas')
  await expect(async () => {
    await page.reload()
    await expect(linha('Compra aprovada').getByText('Sem turma')).toBeVisible({
      timeout: 2000,
    })
  }).toPass({ timeout: 30_000 })

  // Reprocessar um aviso que espera turma: continua esperando.
  const reprocessar = linha('Compra aprovada').getByRole('button', {
    name: /Reprocessar/,
  })
  await esperarReact(reprocessar)
  await reprocessar.click()
  await expect(page.getByText('Aviso reprocessado.')).toBeVisible()
  await expect(linha('Compra aprovada').getByText('Sem turma')).toBeVisible()

  // O Proprietário liga o produto à turma e a venda vira matrícula na hora.
  await marcarCursoNoProduto(page, `Curso ${id}`, PRODUTO)
  await page.goto('/painel/vendas')
  await expect(linha('Compra aprovada').getByText('Aplicada')).toBeVisible()

  // Etiqueta da plataforma na linha e filtro por plataforma.
  await expect(linha('Compra aprovada').getByText('Hotmart')).toBeVisible()
  await esperarReact(page.getByLabel('Plataforma'))
  await page.getByLabel('Plataforma').selectOption('voomp')
  await expect(page).toHaveURL(/gateway=voomp/)
  await expect(linha('Compra aprovada')).toHaveCount(0)
  await page.getByLabel('Plataforma').selectOption('hotmart')
  await expect(page).toHaveURL(/gateway=hotmart/)
  await expect(linha('Compra aprovada').getByText('Hotmart')).toBeVisible()
  await page.goto('/painel/vendas')

  // Venda já aplicada não oferece Reprocessar.
  await expect(
    linha('Compra aprovada').getByRole('button', { name: /Reprocessar/ }),
  ).toHaveCount(0)

  // Aviso repetido não cria linha nova.
  expect((await enviar(aviso, hottok)).status()).toBe(200)
  await page.reload()
  await expect(linha('Compra aprovada')).toHaveCount(1)

  // A aluna entra (a conta nasceu da venda), aceita os termos e abre a aula.
  const contexto = await browser.newContext()
  const alunaPagina = await contexto.newPage()
  await entrarPorCodigo(alunaPagina, aluna)
  await expect(alunaPagina).toHaveURL(/\/primeiro-acesso/)
  await expect(async () => {
    const caixa = alunaPagina.getByRole('checkbox')
    if ((await caixa.getAttribute('data-state')) !== 'checked') {
      await caixa.click()
    }
    await expect(
      alunaPagina.getByRole('button', { name: 'Continuar' }),
    ).toBeEnabled({ timeout: 1000 })
  }).toPass()
  await alunaPagina.getByRole('button', { name: 'Continuar' }).click()
  await expect(alunaPagina).toHaveURL(/\/$/)
  await alunaPagina
    .getByRole('link', { name: new RegExp(`Curso ${id}`) })
    .click()
  await alunaPagina.getByRole('link', { name: 'Começar' }).click()
  await expect(
    alunaPagina.getByRole('heading', { level: 1, name: 'Boas-vindas' }),
  ).toBeVisible()

  // O reembolso (creation_date mais nova) inativa a matrícula e o curso some da vitrine.
  const reembolso = corpoDaFixtureHotmart('purchase-refunded', (a) => {
    a.id = `reembolso-${id}`
    a.creation_date = Date.now() + 60_000
    a.data.product.id = Number(PRODUTO)
    a.data.buyer.email = aluna
    a.data.purchase.transaction = transacao
  })
  expect((await enviar(reembolso, hottok)).status()).toBe(200)
  await expect(async () => {
    await page.reload()
    await expect(linha('Reembolso').getByText('Aplicada')).toBeVisible({
      timeout: 2000,
    })
  }).toPass({ timeout: 30_000 })
  await alunaPagina.goto('/')
  await expect(
    alunaPagina.getByRole('link', { name: new RegExp(`Curso ${id}`) }),
  ).toHaveCount(0)
  await contexto.close()
})
