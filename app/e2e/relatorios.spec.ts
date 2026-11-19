import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('a equipe vê os relatórios sem CSV, e o Proprietário exporta', async ({
  page,
  browser,
}) => {
  const id = unico()
  const equipe = `equipe-${id}@exemplo.test`
  const dono = `dono-${id}@exemplo.test`
  cadastrarUsuario({ email: equipe, perfil: 'equipe' })
  cadastrarUsuario({ email: dono, perfil: 'proprietario' })

  await entrarPorCodigo(page, equipe)
  await page.goto('/painel/relatorios')
  await expect(page.getByRole('heading', { name: 'Relatórios' })).toBeVisible()
  await expect(page.getByText('Alunos ativos no período')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Exportar CSV' })).toHaveCount(0)
  await esperarReact(page.getByRole('link', { name: 'Satisfação' }))
  await page.getByRole('link', { name: 'Satisfação' }).click()
  await expect(page.getByText('NPS adaptado', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Exercícios', exact: true }).click()
  // Outras specs (quiz-correcao) podem ter deixado tentativas no D1 compartilhado:
  // a aba vale tanto vazia quanto com um quiz listado.
  await expect(
    page
      .getByText(/Nenhuma tentativa de exercício|tentativas de \d+ alunos/)
      .first(),
  ).toBeVisible()
  // A equipe não baixa o CSV nem por link direto.
  const negado = await page.request.get('/api/painel/exportar?tipo=panorama')
  expect(negado.status()).toBe(403)

  const contexto = await browser.newContext()
  const paginaDoDono = await contexto.newPage()
  await entrarPorCodigo(paginaDoDono, dono)
  await paginaDoDono.goto('/painel/relatorios')
  const baixando = paginaDoDono.waitForEvent('download')
  await paginaDoDono.getByRole('link', { name: 'Exportar CSV' }).click()
  const arquivo = await baixando
  expect(arquivo.suggestedFilename()).toMatch(/^relatorio-panorama-/)
  const conteudo = readFileSync((await arquivo.path()) ?? '', 'utf8')
  expect(conteudo).toContain('Curso;Alunos ativos;Novos')
  await contexto.close()
})
