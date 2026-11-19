import { expect, test } from '@playwright/test'
import { corpoDaFixture } from '#/test/fixtures/voomp'
import {
  cadastrarUsuario,
  criarEdicaoDoCurso,
  entrarPorCodigo,
  esperarReact,
  lerDevVar,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('uma venda da Voomp (fixture) vira matrícula e abre a aula; o reembolso tira o acesso', async ({
  page,
  browser,
  request,
}) => {
  const id = unico()
  const numero = Date.now()
  const proprietario = `dono-${id}@exemplo.test`
  const aluna = `ana-${id}@exemplo.test`
  const produtoId = String(numero)
  const vendaId = String(numero + 1)
  cadastrarUsuario({ email: proprietario, perfil: 'proprietario' })
  await entrarPorCodigo(page, proprietario)

  // Curso com um módulo e uma aula, e uma turma com prazo.
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

  // O webhook: sem o token certo é recusado e nada é gravado.
  const aviso = (gatilho: 'sale-paid-real' | 'sale-refunded') =>
    corpoDaFixture(gatilho, (a) => {
      a.product.id = Number(produtoId)
      a.client.email = aluna
      a.client.name = 'Ana Souza'
      a.sale.id = Number(vendaId)
    })
  const enviar = (corpo: string, token = lerDevVar('VOOMP_WEBHOOK_TOKEN')) =>
    request.post('/api/webhooks/voomp', {
      headers: { 'content-type': 'application/json', 'x-webhook-token': token },
      data: corpo,
    })
  expect((await enviar(aviso('sale-paid-real'), 'errado')).status()).toBe(401)

  // Venda de produto sem ligação: responde 200 e fica "Sem turma", sem criar a conta.
  expect((await enviar(aviso('sale-paid-real'))).status()).toBe(200)
  const linha = (rotulo: string) =>
    page.getByRole('row').filter({ hasText: aluna }).filter({ hasText: rotulo })
  await page.goto('/painel/vendas')
  await expect(async () => {
    await page.reload()
    await expect(linha('Venda paga').getByText('Sem turma')).toBeVisible({
      timeout: 2000,
    })
  }).toPass({ timeout: 30_000 })

  // O Proprietário liga o produto à turma (aba Produtos) e a venda vira matrícula na hora.
  await esperarReact(
    page
      .getByRole('navigation', { name: 'Seções de Vendas' })
      .getByRole('link', { name: 'Produtos' }),
  )
  await page
    .getByRole('navigation', { name: 'Seções de Vendas' })
    .getByRole('link', { name: 'Produtos' })
    .click()
  await expect(page).toHaveURL(/\/painel\/vendas\/produtos/)
  await esperarReact(page.getByLabel('Id do Produto da Voomp'))
  await page.getByLabel('Id do Produto da Voomp').fill(produtoId)
  await page.locator('#turma-da-ligacao').selectOption({
    label: `Curso ${id} · Turma ${id}`,
  })
  await page
    .getByRole('region', { name: 'Produtos da Voomp' })
    .getByRole('button', { name: 'Ligar à turma' })
    .click()
  await expect(page.getByText('Produto ligado à turma.')).toBeVisible()
  await esperarReact(
    page
      .getByRole('navigation', { name: 'Seções de Vendas' })
      .getByRole('link', { name: 'Vendas' }),
  )
  await page
    .getByRole('navigation', { name: 'Seções de Vendas' })
    .getByRole('link', { name: 'Vendas' })
    .click()
  await expect(linha('Venda paga').getByText('Aplicada')).toBeVisible()
  await expect(
    linha('Venda paga').getByText(`Curso ${id} · Turma ${id}`),
  ).toBeVisible()

  // Editar a ligação (só o prazo) não remove nem duplica.
  await esperarReact(
    page
      .getByRole('navigation', { name: 'Seções de Vendas' })
      .getByRole('link', { name: 'Produtos' }),
  )
  await page
    .getByRole('navigation', { name: 'Seções de Vendas' })
    .getByRole('link', { name: 'Produtos' })
    .click()
  const daLigacao = page
    .getByRole('listitem')
    .filter({ hasText: `Produto ${produtoId}` })
  await daLigacao.getByRole('button', { name: /Editar/ }).click()
  await daLigacao.getByLabel('Prazo da ligação (dias)').fill('60')
  await daLigacao.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Ligação atualizada.')).toBeVisible()
  await expect(daLigacao).toHaveCount(1)
  await expect(daLigacao).toContainText('60 dias de acesso')

  // Um aviso repetido não cria linha nova.
  expect((await enviar(aviso('sale-paid-real'))).status()).toBe(200)
  await page.goto('/painel/vendas')
  await expect(linha('Venda paga')).toHaveCount(1)

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

  // O reembolso inativa a matrícula (a venda era a única origem) e o curso some da vitrine.
  expect((await enviar(aviso('sale-refunded'))).status()).toBe(200)
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
