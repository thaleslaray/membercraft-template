import { expect, test } from '@playwright/test'
import {
  cadastrarUsuario,
  entrarPorCodigo,
  esperarReact,
  limparBanners,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('a equipe cria um banner e o aluno o vê no topo da vitrine, com exibição e clique contados', async ({
  page,
  browser,
}) => {
  limparBanners()
  const id = unico()
  const equipe = `equipe-${id}@exemplo.test`
  const aluno = `aluno-${id}@exemplo.test`
  cadastrarUsuario({ email: equipe, perfil: 'equipe' })
  cadastrarUsuario({ email: aluno, perfil: 'aluno' })
  await entrarPorCodigo(page, equipe)

  await page.goto('/painel/banners')
  await esperarReact(page.getByLabel('Título (texto alternativo)'))
  await page.getByLabel('Título (texto alternativo)').fill(`Oferta ${id}`)
  await page
    .getByLabel('Escolher arquivo: Imagem para computador')
    .setInputFiles({
      name: 'pc.png',
      mimeType: 'image/png',
      buffer: PNG,
    })
  await page
    .getByLabel('Escolher arquivo: Imagem para celular (opcional)')
    .setInputFiles({ name: 'cel.png', mimeType: 'image/png', buffer: PNG })
  await expect(
    page.getByRole('button', {
      name: 'Remover Imagem para celular (opcional)',
    }),
  ).toBeVisible()
  await page
    .getByLabel('Link (opcional)')
    .fill('https://loja.exemplo.test/oferta')
  await page.getByRole('button', { name: 'Criar banner' }).click()
  await expect(page.getByText('Banner criado.')).toBeVisible()
  await expect(page.getByText(`Oferta ${id}`, { exact: true })).toBeVisible()

  // O aluno vê o banner na vitrine; o clique abre o link em outra aba.
  const contexto = await browser.newContext()
  const paginaDoAluno = await contexto.newPage()
  await entrarPorCodigo(paginaDoAluno, aluno)
  await paginaDoAluno.goto('/')
  const imagem = paginaDoAluno.getByRole('img', { name: `Oferta ${id}` })
  await expect(imagem).toBeVisible()
  await expect(imagem.locator('xpath=ancestor::a')).toHaveAttribute(
    'href',
    'https://loja.exemplo.test/oferta',
  )
  // O banner já vem no HTML do servidor: espera o React assumir o link, senão o clique não conta.
  await esperarReact(imagem.locator('xpath=ancestor::a'))
  await Promise.all([
    // A resposta do CLIQUE (a da exibição, que vai antes, tem outro nome de função).
    paginaDoAluno.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        Buffer.from(
          r.url().split('/_serverFn/')[1]?.split('?')[0] ?? '',
          'base64url',
        )
          .toString()
          .includes('registrarCliqueDoBannerFn'),
    ),
    imagem.click(),
  ])
  await contexto.close()

  // O painel mostra as contagens.
  await expect(async () => {
    await page.reload()
    await expect(
      page
        .locator('li')
        .filter({ hasText: `Oferta ${id}` })
        .getByText(/^[1-9]\d* exibições · 1 cliques$/),
    ).toBeVisible({
      timeout: 2000,
    })
  }).toPass({ timeout: 15000 })

  // Pausar tira da vitrine do aluno.
  await esperarReact(page.getByLabel('Título (texto alternativo)'))
  const linha = page.locator('li').filter({ hasText: `Oferta ${id}` })
  await linha.getByRole('button', { name: 'Pausar' }).click()
  await expect(linha.getByText('Pausado')).toBeVisible()
})
