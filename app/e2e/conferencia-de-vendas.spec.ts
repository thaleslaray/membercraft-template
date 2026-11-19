import { expect, test } from '@playwright/test'
import {
  cadastrarUsuario,
  criarEdicaoDoCurso,
  entrarPorCodigo,
  esperarReact,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('a equipe sobe a planilha da Voomp, vê a venda paga sem matrícula e matricula com um clique', async ({
  page,
}) => {
  const id = unico()
  const numero = Date.now()
  const proprietario = `dono-${id}@exemplo.test`
  const aluna = `bia-${id}@exemplo.test`
  const produtoId = String(numero)
  const vendaId = String(numero + 1)
  cadastrarUsuario({ email: proprietario, perfil: 'proprietario' })
  await entrarPorCodigo(page, proprietario)

  await page.goto('/painel/conteudo')
  await esperarReact(page.getByLabel('Nome do novo curso'))
  await page.getByLabel('Nome do novo curso').fill(`Curso ${id}`)
  await page.getByRole('button', { name: 'Criar curso' }).click()
  await expect(page).toHaveURL(/\/painel\/conteudo\/[\w-]+$/)

  await criarEdicaoDoCurso(page, `Curso ${id}`, `Turma ${id}`)

  await page.goto('/painel/vendas/produtos')
  await esperarReact(page.getByLabel('Id do Produto da Voomp'))
  await page.getByLabel('Id do Produto da Voomp').fill(produtoId)
  await page
    .locator('#turma-da-ligacao')
    .selectOption({ label: `Curso ${id} · Turma ${id}` })
  await page
    .getByRole('region', { name: 'Produtos da Voomp' })
    .getByRole('button', { name: 'Ligar à turma' })
    .click()
  await expect(page.getByText('Produto ligado à turma.')).toBeVisible()

  await page.goto('/painel/conferencia-de-vendas')
  await esperarReact(page.getByLabel('Planilha da Voomp (CSV ou XLSX)'))
  const csv = [
    'ID da venda;Status;Nome do cliente;E-mail;ID do produto;Produto',
    `${vendaId};Pago;Bia Lima;${aluna};${produtoId};Curso`,
    `${Number(vendaId) + 1};Reembolsado;Caio;caio-${id}@exemplo.test;${produtoId};Curso`,
  ].join('\n')
  await page.getByLabel('Planilha da Voomp (CSV ou XLSX)').setInputFiles({
    name: `vendas-semana-${id}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
  await page.getByRole('button', { name: 'Conferir planilha' }).click()
  await expect(page.getByText('Planilha conferida.')).toBeVisible()
  await expect(page).toHaveURL(/conferencia-de-vendas\?id=/)

  const linha = page.getByRole('row').filter({ hasText: aluna })
  await expect(linha.getByText('Sem matrícula')).toBeVisible()
  await expect(page.getByText('1 sem matrícula')).toBeVisible()
  await page.getByRole('button', { name: `Matricular ${aluna}` }).click()
  await expect(page.getByText('1 matrícula feita.')).toBeVisible()
  await expect(linha.getByText('Matriculada')).toBeVisible()

  // A conferência fica no histórico, com quem subiu.
  await expect(
    page.getByRole('row').filter({ hasText: `vendas-semana-${id}.csv` }),
  ).toBeVisible()
})
