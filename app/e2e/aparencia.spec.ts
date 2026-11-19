import { expect, test } from '@playwright/test'
import {
  cadastrarUsuario,
  entrarPorCodigo,
  esperarReact,
  limparAparencia,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// A aparência vale para todos: cada teste deixa o padrão de volta para os outros specs.
test.afterEach(() => limparAparencia())

test('o Proprietário troca o tema e a cor, vê o aviso de contraste, salva e restaura', async ({
  page,
}) => {
  const email = `dona-${unico()}@exemplo.test`
  cadastrarUsuario({ email, perfil: 'proprietario' })
  await entrarPorCodigo(page, email)

  await page.goto('/estudio/aparencia')
  const hex = page.getByRole('textbox', { name: 'Código hex da cor da marca' })
  await esperarReact(hex)

  // Um cinza médio não dá contraste nem com texto branco nem com texto escuro.
  await hex.fill('#7a7a7a')
  await expect(page.getByText('Aviso de contraste')).toBeVisible()
  await hex.fill('#8a1c3a')
  await expect(page.getByText('Aviso de contraste')).toBeHidden()

  await page.getByText('Neutro', { exact: true }).click()
  // A prévia já mostra o tema escolhido antes de salvar.
  await expect(page.getByTestId('previa')).toHaveAttribute(
    'data-theme',
    'neutro',
  )

  await page.getByRole('button', { name: 'Salvar aparência' }).click()
  await expect(page.getByText('Aparência salva')).toBeVisible()

  // Vale para a área inteira, renderizado no servidor.
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'neutro')
  const primaria = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--primary')
      .trim(),
  )
  expect(primaria).toBe('#8a1c3a')

  // Restaurar padrão volta ao Estúdio.
  await page.goto('/estudio/aparencia')
  const restaurar = page.getByRole('button', { name: 'Restaurar padrão' })
  await esperarReact(restaurar)
  await restaurar.click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Restaurar', exact: true })
    .click()
  await expect(page.getByText('restaurada ao padrão')).toBeVisible()
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'estudio')
})

test('aluno não entra na tela de aparência', async ({ page }) => {
  const email = `aluno-${unico()}@exemplo.test`
  cadastrarUsuario({ email })
  await entrarPorCodigo(page, email)
  await page.goto('/estudio/aparencia')
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('heading', { name: 'Meus cursos', level: 1 }),
  ).toBeVisible()
})
