import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Casca nova (#93): barra de topo com dois destinos, abas no celular, menu do avatar, sem menu lateral
// nem tour. O Início exige login: cada teste entra com um aluno já com o primeiro acesso feito.
test.use({ bypassCSP: true })

test.beforeEach(async ({ page }) => {
  const email = `casca-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.test`
  cadastrarUsuario({ email })
  await entrarPorCodigo(page, email)
})

test('o Início abre com a barra do topo, sem menu lateral', async ({
  page,
}) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)

  const destinos = page.getByRole('navigation', { name: 'Destinos' })
  await expect(destinos.getByRole('link')).toHaveCount(2)
  await expect(
    destinos.getByRole('link', { name: 'Meus cursos' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    destinos.getByRole('link', { name: 'Comunidade' }),
  ).not.toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByRole('button', { name: 'Pesquisar aulas e vídeos' }),
  ).toBeVisible()

  // Sem menu lateral, sem trilha de migalhas, sem botão de tema solto na barra.
  await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0)
  await expect(
    page.getByRole('navigation', { name: 'breadcrumb' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /Mudar para o modo/ }),
  ).toHaveCount(0)
  // No computador as abas do pé não aparecem.
  await expect(page.getByRole('navigation', { name: 'Abas' })).toBeHidden()

  // Tokens do tema padrão (Estúdio): primária verde.
  const tema = await page.evaluate(() => {
    const raiz = document.documentElement
    return {
      tema: raiz.dataset.theme,
      primaria: getComputedStyle(raiz).getPropertyValue('--primary').trim(),
    }
  })
  expect(tema.tema).toBe('estudio')
  expect(tema.primaria).toBe('#1f4d3a')

  await expect(
    page.getByRole('heading', { name: 'Meus cursos', level: 1 }),
  ).toBeVisible()
})

test('o indicador desliza para o destino atual', async ({ page }) => {
  await page.goto('/')
  const indicador = page.getByTestId('indicador-do-destino')
  await expect(indicador).toHaveAttribute('data-destino', 'cursos')
  const x0 = (await indicador.boundingBox())?.x ?? 0
  const destinos = page.getByRole('navigation', { name: 'Destinos' })
  const comunidade = destinos.getByRole('link', { name: 'Comunidade' })
  await esperarReact(destinos)
  await expect(async () => {
    await comunidade.click()
    await expect(page).toHaveURL(/\/comunidades$/, { timeout: 1500 })
  }).toPass()
  await expect(indicador).toHaveAttribute('data-destino', 'comunidade')
  await expect(async () => {
    expect((await indicador.boundingBox())?.x ?? 0).toBeGreaterThan(x0 + 50)
  }).toPass()
  await expect(comunidade).toHaveAttribute('aria-current', 'page')

  // Um lugar do menu do avatar não marca nenhum dos dois.
  await page.goto('/pontos')
  await expect(indicador).toHaveAttribute('data-destino', 'nenhum')
})

test('o menu do avatar tem os itens, troca o modo e fecha com Esc', async ({
  page,
}) => {
  await page.goto('/')
  const botao = page.getByRole('button', { name: 'Abrir menu da conta' })
  await esperarReact(botao)
  await expect(async () => {
    await botao.click()
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 1000 })
  }).toPass()
  const menu = page.getByRole('menu')
  for (const nome of [
    'Sua conta',
    'Meus pontos',
    'Falar com a equipe',
    'Sair',
  ]) {
    await expect(menu.getByRole('menuitem', { name: nome })).toBeVisible()
  }
  // A origem da transformação é o botão (variável do Radix), não o centro do menu.
  const origem = await menu.evaluate(
    (el) => getComputedStyle(el).transformOrigin,
  )
  expect(origem).not.toBe('50% 50%')

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  // Modo escuro e de volta ao claro.
  await botao.click()
  await page.getByRole('menuitem', { name: 'Modo escuro' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await botao.click()
  await page.getByRole('menuitem', { name: 'Modo claro' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  // "Meus pontos" leva a /pontos.
  await botao.click()
  await page.getByRole('menuitem', { name: 'Meus pontos' }).click()
  await expect(page).toHaveURL(/\/pontos$/)
})

test('o sininho nasce do botão e fecha com Esc', async ({ page }) => {
  await page.goto('/')
  const sino = page.getByRole('button', { name: /^Avisos/ })
  await esperarReact(sino)
  await expect(async () => {
    await sino.click()
    await expect(page.getByRole('dialog', { name: 'Avisos' })).toBeVisible({
      timeout: 1000,
    })
  }).toPass()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Avisos' })).toBeHidden()
})

test('rotas antigas continuam abrindo, e a conta nova não vê tour', async ({
  page,
}) => {
  for (const rota of [
    '/favoritos',
    '/certificados',
    '/ranking',
    '/pontos',
    '/atendimento',
  ]) {
    const r = await page.goto(rota)
    expect(r?.status(), rota).toBe(200)
    await expect(page.getByRole('main'), rota).toBeVisible()
  }
  await expect(page.getByTestId('tour')).toHaveCount(0)
})

test('a rota de dentro tem "voltar"', async ({ page }) => {
  await page.goto('/comunidades/nova')
  await expect(
    page.getByRole('link', { name: 'Comunidade' }).last(),
  ).toBeVisible()
})

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('as abas ficam no pé e tocar na aba atual volta ao topo', async ({
    page,
  }) => {
    await page.goto('/')
    const abas = page.getByRole('navigation', { name: 'Abas' })
    await expect(abas).toBeVisible()
    await expect(abas.getByRole('link')).toHaveCount(2)
    await expect(
      page.getByRole('navigation', { name: 'Destinos' }),
    ).toBeHidden()
    await expect(
      abas.getByRole('link', { name: 'Meus cursos' }),
    ).toHaveAttribute('aria-current', 'page')

    // Barra de topo: marca, lupa e avatar; a área segura fica no estilo.
    await expect(
      page.getByRole('button', { name: 'Abrir a busca' }),
    ).toBeVisible()
    const pe = await abas.evaluate((el) => getComputedStyle(el).paddingBottom)
    expect(pe).toBe('0px') // sem entalhe no navegador de teste

    // Rola e toca na aba ativa.
    await page.evaluate(() => {
      document.body.style.minHeight = '3000px'
      window.scrollTo(0, 800)
    })
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(300)
    await esperarReact(abas.getByRole('link', { name: 'Meus cursos' }))
    await expect(async () => {
      await abas.getByRole('link', { name: 'Meus cursos' }).click()
      await expect
        .poll(() => page.evaluate(() => window.scrollY), { timeout: 1500 })
        .toBe(0)
    }).toPass()
    await expect(page).toHaveURL(/\/$/)

    // De dentro de um item, a aba ativa navega para o destino em vez de só rolar.
    await page.goto('/favoritos')
    await esperarReact(abas.getByRole('link', { name: 'Meus cursos' }))
    await expect(async () => {
      await abas.getByRole('link', { name: 'Meus cursos' }).click()
      await expect(page).toHaveURL(/\/$/, { timeout: 1500 })
    }).toPass()

    // A outra aba navega.
    await abas.getByRole('link', { name: 'Comunidade' }).click()
    await expect(page).toHaveURL(/\/comunidades$/)
  })
})
