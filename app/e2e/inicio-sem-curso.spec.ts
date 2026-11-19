import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  cadastrarUsuario,
  entrarPorCodigo,
  esperarReact,
  limparAparencia,
  limparBanners,
} from '#e2e/helpers'

// Início de quem não tem curso (casca Lume, tema Ateliê): em vez da tela vazia, o e-mail da conta, os
// três passos e todos os banners da vitrine. Prints em `PRINTS_DIR`; com `ARTE_DOS_BANNERS` (pasta com
// `banner-desktop/` e `banner-celular/`), os prints saem com a arte de verdade.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..')
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const BANNERS = ['formacao', 'acessorios', 'mala', 'moda-liberta']

function executar(sql: string[]) {
  const arquivo = path.join(os.tmpdir(), `inicio-sem-curso-${unico()}.sql`)
  writeFileSync(arquivo, `${sql.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: raiz, encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao semear: ${r.stderr}`)
}

function arte(tipo: 'desktop' | 'celular', nome: string) {
  const pasta = process.env.ARTE_DOS_BANNERS
  const arquivo = pasta && path.join(pasta, `banner-${tipo}`, `${nome}.png`)
  return arquivo && existsSync(arquivo) ? readFileSync(arquivo) : PNG
}

test.afterAll(() => {
  limparBanners()
  limparAparencia()
})

test('quem não tem curso vê a conta, os três passos e a vitrine de banners', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `sem-curso-lume-${id}@exemplo.test`
  cadastrarUsuario({ email, nome: 'Fernanda Souza' })
  limparBanners()
  executar([
    'DELETE FROM aparencia',
    `INSERT INTO aparencia (id, tema, casca, mostrar_comunidade, atualizado_em) VALUES ('padrao', 'atelie', 'lume', 0, ${Date.now()})`,
    ...BANNERS.map(
      (nome, i) =>
        `INSERT INTO banner (id, titulo, imagem_computador, imagem_celular, link, publico, ativo, ordem) VALUES ('b-${nome}-${id}', 'Banner ${nome}', 'conteudo/imagens/e2e-banner-desktop-${nome}/imagem', 'conteudo/imagens/e2e-banner-celular-${nome}/imagem', 'https://loja.exemplo.test/${nome}', 'todos', 1, ${i + 1})`,
    ),
  ])
  await page.route('**/api/imagens/**e2e-banner-**', (rota) => {
    const m = rota
      .request()
      .url()
      .match(/e2e-banner-(desktop|celular)-([a-z-]+)\/imagem/)
    return rota.fulfill({
      contentType: 'image/png',
      body: m ? arte(m[1] as 'desktop' | 'celular', m[2] as string) : PNG,
    })
  })

  await entrarPorCodigo(page, email)
  await page.goto('/')
  const principal = page.getByRole('main')
  await expect(
    principal.getByRole('heading', {
      level: 1,
      name: 'Ainda não há cursos nesta conta',
    }),
  ).toBeVisible()
  await expect(principal.getByText('Boas-vindas, Fernanda')).toBeVisible()
  await expect(principal.getByText(email)).toBeVisible()

  const passos = principal.getByRole('region', { name: 'O que fazer agora' })
  await expect(passos.getByRole('listitem')).toHaveCount(3)
  await expect(
    passos.getByRole('link', { name: 'Falar com a equipe' }),
  ).toHaveAttribute('href', '/atendimento')
  await expect(
    passos.getByRole('button', { name: 'Entrar com outro e-mail' }),
  ).toBeVisible()

  // Todos os banners que valem para a pessoa, não só o primeiro.
  const vitrine = principal.getByRole('region', { name: 'Cursos da escola' })
  await expect(vitrine.getByRole('img')).toHaveCount(BANNERS.length)
  await expect(
    vitrine.getByRole('link', { name: 'Banner formacao' }),
  ).toHaveAttribute('href', 'https://loja.exemplo.test/formacao')

  // "Atualizar a página" recarrega os dados sem sair da tela.
  const atualizar = passos.getByRole('button', { name: 'Atualizar a página' })
  await esperarReact(atualizar)
  await atualizar.click()
  await expect(atualizar).toBeVisible()

  const pasta = process.env.PRINTS_DIR ?? testInfo.outputPath('prints')
  mkdirSync(pasta, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(500)
  await page.screenshot({
    path: path.join(pasta, 'inicio-sem-curso-computador.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.waitForTimeout(800)
  await page.screenshot({
    path: path.join(pasta, 'inicio-sem-curso-celular.png'),
    fullPage: true,
  })

  // Sair leva à entrada, para entrar com o e-mail da compra.
  await page.setViewportSize({ width: 1440, height: 900 })
  const sair = page.getByRole('button', { name: 'Entrar com outro e-mail' })
  await esperarReact(sair)
  await sair.click()
  await expect(page).toHaveURL(/\/login/)
})
