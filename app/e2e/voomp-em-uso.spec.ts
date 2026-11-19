import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('a Voomp só aparece em Vendas e Produtos depois de ligada na aba Plataformas', async ({
  page,
}) => {
  const email = `dono-${unico()}@exemplo.test`
  cadastrarUsuario({ email, perfil: 'proprietario' })
  await entrarPorCodigo(page, email)

  // Desligar de início (o banco do e2e é compartilhado): o cartão mostra o estado atual.
  await page.goto('/painel/vendas/plataformas')
  const interruptor = page.getByLabel('Usar a Voomp')
  await esperarReact(interruptor)
  if (await interruptor.isChecked()) {
    await interruptor.click()
    await expect(page.getByText('Voomp desligada.')).toBeVisible()
  }

  // Sem Voomp em uso (e sem aviso/ligação dela): nada de Voomp fora de Plataformas.
  // Se outro teste já criou aviso da Voomp, ela conta como em uso e este trecho não vale.
  const emUso = await page.getByText('Em uso', { exact: true }).isVisible()
  if (!emUso) {
    await page.goto('/painel/vendas')
    await expect(page.getByLabel('Situação')).toBeVisible()
    await expect(page.getByLabel('Plataforma')).toHaveCount(0)
    await page.goto('/painel/vendas/produtos')
    await expect(page.getByLabel('Produtos da Voomp')).toHaveCount(0)

    await page.goto('/painel/vendas/plataformas')
    await expect(page.getByText('/api/webhooks/voomp')).toHaveCount(0)
    await esperarReact(page.getByLabel('Usar a Voomp'))
    await page.getByLabel('Usar a Voomp').click()
    await expect(page.getByText('Voomp ligada.')).toBeVisible()
  }

  await expect(page.getByText('/api/webhooks/voomp')).toBeVisible()
  await expect(page.getByText('x-webhook-token')).toBeVisible()

  await page.goto('/painel/vendas')
  await expect(page.getByLabel('Plataforma')).toBeVisible()
  await page.goto('/painel/vendas/produtos')
  await expect(page.getByLabel('Produtos da Voomp')).toBeVisible()
})
