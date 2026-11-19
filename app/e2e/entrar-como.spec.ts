import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('Proprietário entra como a aluna, vê a faixa e volta para a própria conta', async ({
  page,
}) => {
  const id = unico()
  const dono = `dono-${id}@exemplo.test`
  const aluna = `aluna-${id}@exemplo.test`
  cadastrarUsuario({ email: dono, perfil: 'proprietario', nome: 'Helena Teste' })
  cadastrarUsuario({ email: aluna, nome: 'Fulana da Silva' })
  await entrarPorCodigo(page, dono)

  await page.goto(`/painel/alunos/e2e-${aluna.replace(/\W/g, '-')}`)
  const entrar = page.getByRole('button', { name: 'Entrar como esta aluna' })
  await esperarReact(entrar)
  await entrar.click()
  await expect(
    page.getByText('Você vai ver a escola como Fulana da Silva.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Entrar como', exact: true }).click()

  await expect(page).toHaveURL(/\/$/)
  const faixa = page.getByTestId('faixa-entrar-como')
  await expect(faixa).toContainText('Você está vendo como Fulana da Silva')
  await expect(
    faixa.getByRole('button', { name: 'Voltar para a minha conta' }),
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/entrar-como.png' })

  const voltar = faixa.getByRole('button', {
    name: 'Voltar para a minha conta',
  })
  await esperarReact(voltar)
  await voltar.click()
  await expect(page).toHaveURL(/\/painel\/alunos\/e2e-/)
  await expect(page.getByTestId('faixa-entrar-como')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Entrar como esta aluna' }),
  ).toBeVisible()
})

test('Equipe não entra como outra pessoa da Equipe', async ({ page }) => {
  const id = unico()
  const eq = `equipe-${id}@exemplo.test`
  const outra = `outra-${id}@exemplo.test`
  cadastrarUsuario({ email: eq, perfil: 'equipe', nome: 'Marina Teste' })
  cadastrarUsuario({ email: outra, perfil: 'equipe', nome: 'Bia Teste' })
  await entrarPorCodigo(page, eq)

  await page.goto(`/painel/alunos/e2e-${outra.replace(/\W/g, '-')}`)
  await expect(
    page.getByRole('button', { name: 'Entrar como esta aluna' }),
  ).toHaveCount(0)

  // Mesmo chamando o servidor direto, é recusado e a sessão continua a de Marina.
  const status = await page.evaluate(
    async (alvo) => {
      const r = await fetch('/api/auth/entrar-como/iniciar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alunoId: alvo }),
      })
      return r.status
    },
    `e2e-${outra.replace(/\W/g, '-')}`,
  )
  expect(status).toBe(400)
  await page.goto('/')
  await expect(page.getByTestId('faixa-entrar-como')).toHaveCount(0)
})
