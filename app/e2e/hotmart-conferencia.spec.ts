import { expect, test } from '@playwright/test'
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
const PORTA_DA_FALSA = (Number(process.env.PORT) || 3040) + 1

test('"Conferir agora" recupera a venda que o webhook perdeu e o reembolso dela, sem efeito duplo', async ({
  page,
  request,
}) => {
  const id = unico()
  const proprietario = `dono-${id}@exemplo.test`
  const aluna = `ana-${id}@exemplo.test`
  const transacao = `HP${Date.now()}`
  limparLigacoesDaHotmart(PRODUTO)
  cadastrarUsuario({ email: proprietario, perfil: 'proprietario' })
  await entrarPorCodigo(page, proprietario)

  await page.goto('/painel/vendas/plataformas')
  await esperarReact(page.getByLabel('Client ID'))
  await page.getByLabel('Client ID').fill('cid-e2e')
  await page.getByLabel('Client Secret').fill('csecret-e2e')
  await page.getByLabel('Client Token').fill('basic-e2e')
  await page.getByLabel('Hottok (assinatura do webhook)').fill(`hottok-${id}`)
  await page.getByRole('button', { name: 'Salvar credenciais' }).click()
  await expect(page.getByText('Credenciais salvas.')).toBeVisible()

  await page.goto('/painel/conteudo')
  await esperarReact(page.getByLabel('Nome do novo curso'))
  await page.getByLabel('Nome do novo curso').fill(`Curso ${id}`)
  await page.getByRole('button', { name: 'Criar curso' }).click()
  await expect(page).toHaveURL(/\/painel\/conteudo\/[\w-]+$/)
  await criarEdicaoDoCurso(page, `Curso ${id}`, `Turma ${id}`, 365)

  await marcarCursoNoProduto(page, `Curso ${id}`, PRODUTO)

  // O histórico da Hotmart (falsa) tem uma venda aprovada que nenhum webhook trouxe.
  const venda = (status: string) => ({
    product: { id: Number(PRODUTO), name: 'Curso Falso A' },
    buyer: { email: aluna, name: 'Ana Souza' },
    purchase: {
      transaction: transacao,
      order_date: Date.now() - 60_000,
      approved_date: Date.now() - 60_000,
      status,
      is_subscription: false,
    },
  })
  const combinar = (itens: unknown[]) =>
    request.post(`http://localhost:${PORTA_DA_FALSA}/__historico`, {
      data: itens,
    })
  await combinar([venda('APPROVED')])

  const linha = (status: string) =>
    page
      .getByRole('row')
      .filter({ hasText: transacao })
      .filter({ hasText: status })
  // O botão fica na aba Vendas; o histórico, na aba Plataformas.
  const conferir = async (mensagem: RegExp) => {
    await esperarReact(
      page
        .getByRole('navigation', { name: 'Seções de Vendas' })
        .getByRole('link', { name: 'Vendas' }),
    )
    await page
      .getByRole('navigation', { name: 'Seções de Vendas' })
      .getByRole('link', { name: 'Vendas' })
      .click()
    const botao = page.getByRole('button', { name: 'Conferir com a Hotmart' })
    await esperarReact(botao)
    await botao.click()
    await expect(page.getByText(mensagem)).toBeVisible()
    await esperarReact(
      page
        .getByRole('navigation', { name: 'Seções de Vendas' })
        .getByRole('link', { name: 'Plataformas' }),
    )
    await page
      .getByRole('navigation', { name: 'Seções de Vendas' })
      .getByRole('link', { name: 'Plataformas' })
      .click()
    await expect(page).toHaveURL(/\/painel\/vendas\/plataformas/)
  }

  await page.goto('/painel/vendas')
  await conferir(/Conferência feita: 1 recuperada/)
  await expect(linha('APPROVED').getByText('Recuperada')).toBeVisible()

  // Repetir não duplica: a venda já processada não vira outra linha de "Recuperada".
  await conferir(/Conferência feita: 0 recuperada/)
  await expect(linha('APPROVED')).toHaveCount(1)

  // A Hotmart passa a dizer REFUNDED: a conferência tira o acesso.
  await combinar([venda('REFUNDED')])
  await conferir(/Conferência feita: 1 recuperada/)
  await expect(linha('REFUNDED').getByText('Recuperada')).toBeVisible()
})
