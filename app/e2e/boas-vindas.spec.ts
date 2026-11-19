import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { appConfig } from '#/config/app'
import {
  cadastrarUsuario,
  entrarPorCodigo,
  esperarReact,
  limparConfiguracaoDaArea,
} from '#e2e/helpers'

// Vídeo de boas-vindas da Helena (#101): o Proprietário escolhe o link do Vimeo no Estúdio; com vídeo, o
// primeiro acesso abre a janela uma vez (Pular grava o marcador); sem vídeo, nada aparece.
test.use({ bypassCSP: true })

const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const LINK = 'https://vimeo.com/76979871'
const PLAYER = 'https://player.vimeo.com/video/76979871'

function sql(comando: string) {
  const r = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'escola',
      '--local',
      '--json',
      '--command',
      comando,
    ],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha no D1 local: ${r.stderr}`)
  return r.stdout
}

function configurarVideo(url: string | null) {
  limparConfiguracaoDaArea()
  if (!url) return
  sql(
    `INSERT INTO configuracao_da_area (id, termos_versao, termos_texto, privacidade_texto, suporte_email, boas_vindas_vimeo, atualizado_em) VALUES ('padrao', '${appConfig.termos.versao}', 'Termos', 'Privacidade', '${appConfig.supportEmail}', '${url}', 1000)`,
  )
}

const marcadorDe = (email: string) =>
  sql(`SELECT tour_visto_em FROM user WHERE email = '${email}'`)

const janela = (page: Page) =>
  page.getByRole('dialog', { name: 'Boas-vindas da Helena' })

test.afterAll(() => limparConfiguracaoDaArea())

test('só o Proprietário muda o vídeo, só com link do Vimeo, e a troca vai para o registro', async ({
  page,
  browser,
}) => {
  limparConfiguracaoDaArea()
  const id = unico()
  const dono = `bv-dono-${id}@exemplo.test`
  const equipe = `bv-equipe-${id}@exemplo.test`
  cadastrarUsuario({ email: dono, perfil: 'proprietario' })
  cadastrarUsuario({ email: equipe, perfil: 'equipe' })

  // A Equipe não chega à tela de configurações.
  const contextoEquipe = await browser.newContext()
  const paginaEquipe = await contextoEquipe.newPage()
  await entrarPorCodigo(paginaEquipe, equipe)
  await paginaEquipe.goto('/painel/configuracoes')
  await expect(paginaEquipe).not.toHaveURL(/configuracoes/)
  await contextoEquipe.close()

  await entrarPorCodigo(page, dono)
  await page.goto('/painel/configuracoes')
  const campo = page.getByLabel('Link do vídeo no Vimeo')
  await esperarReact(campo)

  await campo.fill('https://www.youtube.com/watch?v=abcdefghijk')
  await page.getByRole('button', { name: 'Salvar configurações' }).click()
  await expect(page.getByText(/Cole um link do Vimeo/)).toBeVisible()

  await campo.fill(LINK)
  await page.getByRole('button', { name: 'Salvar configurações' }).click()
  await expect(page.getByText('Configurações salvas.')).toBeVisible()

  await page.goto('/painel/registro')
  await expect(
    page.getByRole('cell', { name: 'Vídeo de boas-vindas alterado' }).first(),
  ).toBeVisible()
  await page.goto('/painel/configuracoes')
  await expect(page.getByLabel('Link do vídeo no Vimeo')).toHaveValue(PLAYER)
})

test('com vídeo, o primeiro acesso mostra a janela uma vez e "Pular" grava o marcador', async ({
  page,
}) => {
  configurarVideo(PLAYER)
  const email = `bv-aluno-${unico()}@exemplo.test`
  cadastrarUsuario({ email, tourVisto: false })
  await entrarPorCodigo(page, email)
  await page.goto('/')

  await expect(janela(page)).toBeVisible()
  await expect(page.locator(`iframe[src="${PLAYER}"]`)).toBeVisible()
  expect(marcadorDe(email)).toContain('null')

  await page.getByRole('button', { name: 'Pular' }).click()
  await expect(janela(page)).toHaveCount(0)
  await expect.poll(() => marcadorDe(email)).not.toContain('null')

  // Não volta sozinha, nem em outra tela.
  await page.reload()
  await esperarReact(page.getByRole('button', { name: 'Abrir menu da conta' }))
  await page.waitForTimeout(600)
  await expect(janela(page)).toHaveCount(0)

  // "Rever as boas-vindas" no avatar abre de novo, com "Fechar".
  await expect(async () => {
    await page.getByRole('button', { name: 'Abrir menu da conta' }).click()
    await expect(
      page.getByRole('menuitem', { name: 'Rever as boas-vindas' }),
    ).toBeVisible({ timeout: 1000 })
  }).toPass()
  await page.getByRole('menuitem', { name: 'Rever as boas-vindas' }).click()
  await expect(janela(page)).toBeVisible()
  await page.getByRole('button', { name: 'Fechar' }).click()
  await expect(janela(page)).toHaveCount(0)
})

test('sem vídeo, o primeiro acesso não mostra nada e o avatar não oferece rever', async ({
  page,
}) => {
  configurarVideo(null)
  const email = `bv-sem-${unico()}@exemplo.test`
  cadastrarUsuario({ email, tourVisto: false })
  await entrarPorCodigo(page, email)
  await page.goto('/')
  await esperarReact(page.getByRole('button', { name: 'Abrir menu da conta' }))
  await page.waitForTimeout(800)

  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(marcadorDe(email)).toContain('null')
  await expect(async () => {
    await page.getByRole('button', { name: 'Abrir menu da conta' }).click()
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 1000 })
  }).toPass()
  await expect(
    page.getByRole('menuitem', { name: 'Rever as boas-vindas' }),
  ).toHaveCount(0)
})

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]
for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`prints e axe: ${tela.nome} ${modo}`, async ({ page }, testInfo) => {
      test.setTimeout(90_000)
      const pasta = process.env.PRINTS_DIR ?? testInfo.outputDir
      await page.setViewportSize(tela.viewport)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      configurarVideo(PLAYER)
      const id = unico()
      const aluno = `bv-print-${id}@exemplo.test`
      cadastrarUsuario({ email: aluno, tourVisto: false })
      await entrarPorCodigo(page, aluno)
      await page.goto('/')
      await expect(janela(page)).toBeVisible()
      await page.waitForTimeout(700)
      await page.screenshot({
        path: path.join(pasta, `boas-vindas-${tela.nome}-${modo}.png`),
      })
      const { AxeBuilder } = await import('@axe-core/playwright')
      const r = await new AxeBuilder({ page })
        .disableRules(['region'])
        // O conteúdo do iframe do Vimeo é de terceiros.
        .exclude('iframe')
        .analyze()
      expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual(
        [],
      )

      if (tela.nome === 'desktop' && modo === 'claro') {
        // A tela do Estúdio com o campo.
        const dono = `bv-print-dono-${id}@exemplo.test`
        cadastrarUsuario({ email: dono, perfil: 'proprietario' })
        const contexto = await page.context().browser()?.newContext({
          viewport: tela.viewport,
        })
        const estudio = await contexto?.newPage()
        if (!estudio || !contexto) throw new Error('sem contexto')
        await entrarPorCodigo(estudio, dono)
        await estudio.goto('/painel/configuracoes')
        const campo = estudio.getByLabel('Link do vídeo no Vimeo')
        await esperarReact(campo)
        await campo.scrollIntoViewIfNeeded()
        await estudio.screenshot({
          path: path.join(pasta, 'estudio-campo-desktop-claro.png'),
        })
        await contexto.close()
      }
    })
  }
}
