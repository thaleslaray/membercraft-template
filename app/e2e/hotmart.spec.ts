import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('o Proprietário salva as credenciais da Hotmart e as vê mascaradas, sem leitura de volta', async ({
  page,
}) => {
  const email = `dono-${unico()}@exemplo.test`
  cadastrarUsuario({ email, perfil: 'proprietario' })
  await entrarPorCodigo(page, email)

  await page.goto('/painel/vendas/plataformas')
  const clientId = page.getByLabel('Client ID')
  await esperarReact(clientId)
  const segredos = {
    'Client ID': 'e2e-client-id-segredo-111',
    'Client Secret': 'e2e-client-secret-segredo-222',
    'Client Token': 'e2e-basic-segredo-333',
    'Hottok (assinatura do webhook)': 'e2e-hottok-segredo-444',
  }
  for (const [rotulo, valor] of Object.entries(segredos)) {
    await page.getByLabel(rotulo).fill(valor)
  }
  await page.getByLabel('Credencial do tipo sandbox').check()
  await page.getByRole('button', { name: 'Salvar credenciais' }).click()
  await expect(page.getByText('Credenciais salvas.')).toBeVisible()

  // Depois de salvar: campos vazios, etiqueta "Salvo", e nenhum valor na página.
  await expect(page.getByText('Salvo', { exact: true })).toHaveCount(4)
  await expect(clientId).toHaveValue('')
  await page.reload()
  await esperarReact(page.getByLabel('Client ID'))
  await expect(page.getByText('Salvo', { exact: true })).toHaveCount(4)
  await expect(page.getByLabel('Credencial do tipo sandbox')).toBeChecked()
  const html = await page.content()
  for (const valor of Object.values(segredos)) {
    expect(html).not.toContain(valor)
  }
  await expect(
    page.getByRole('button', { name: 'Testar conexão' }),
  ).toBeEnabled()

  // A troca ficou no registro de ações, sem o valor.
  await page.goto('/painel/registro')
  await expect(
    page
      .getByRole('table', { name: 'Ações registradas' })
      .getByText('Credenciais da Hotmart trocadas')
      .first(),
  ).toBeVisible()
  const registro = await page.content()
  for (const valor of Object.values(segredos)) {
    expect(registro).not.toContain(valor)
  }
})

test('quem não é Proprietário é barrado da tela da Hotmart', async ({
  page,
}) => {
  const email = `equipe-${unico()}@exemplo.test`
  cadastrarUsuario({ email, perfil: 'equipe' })
  await entrarPorCodigo(page, email)

  await page.goto('/painel/vendas/plataformas')
  await expect(page).not.toHaveURL(/plataformas/)
  await expect(page.getByRole('link', { name: 'Hotmart' })).toHaveCount(0)
})

test('os endereços antigos da Hotmart levam à aba certa e o menu tem só Vendas', async ({
  page,
}) => {
  const email = `dono-${unico()}@exemplo.test`
  cadastrarUsuario({ email, perfil: 'proprietario' })
  await entrarPorCodigo(page, email)

  await page.goto('/painel/hotmart')
  await expect(page).toHaveURL(/\/painel\/vendas\/plataformas$/)
  await page.goto('/painel/hotmart-ligacoes')
  await expect(page).toHaveURL(/\/painel\/vendas\/produtos$/)
  await page.goto('/painel/hotmart-conferencia')
  await expect(page).toHaveURL(/\/painel\/vendas$/)
  await expect(
    page.getByRole('button', { name: 'Conferir com a Hotmart' }),
  ).toBeVisible()

  for (const nome of [
    'Hotmart',
    'Ligações da Hotmart',
    'Conferência da Hotmart',
  ]) {
    await expect(
      page.getByRole('link', { name: nome, exact: true }),
    ).toHaveCount(0)
  }
  await expect(
    page
      .getByRole('navigation', { name: 'Painel da equipe' })
      .getByRole('link', { name: 'Vendas', exact: true }),
  ).toBeVisible()
})
