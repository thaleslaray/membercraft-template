import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// O CSP do app usa nonce: o axe injeta script, então precisa contornar.
test.use({ bypassCSP: true })

const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const PRINTS = process.env.PRINTS_94
const PRINTS_TEMA = process.env.TEMA_94 ?? 'claro'
const foto = (cor: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${cor}"/><circle cx="40" cy="32" r="14" fill="#fff"/><rect x="16" y="50" width="48" height="30" rx="14" fill="#fff"/></svg>`,
  )}`

function sql(comando: string) {
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', comando],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha no SQL: ${r.stderr}`)
}

// A aluna fica em 12º lugar (fora do top 10); a 1ª tem foto e bio; o resto, só iniciais.
function prepararRanking(id: string, email: string) {
  const euId = `e2e-${email.replace(/\W/g, '-')}`
  const partes = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${euId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
    `INSERT INTO lancamento_de_pontos (id, user_id, curso_id, origem_tipo, pontos, motivo) VALUES ('l-eu-${id}', '${euId}', 'c-${id}', 'avulso', 5, 'Teste')`,
  ]
  const cores = ['#b45309', '#0f766e', '#6d28d9']
  for (let i = 1; i <= 11; i++) {
    const colega = `e2e-colega${i}-${id}`
    const nome = i === 1 ? 'Marina Albuquerque de Souza' : `Colega ${i}`
    const imagem = i <= 3 ? `'${foto(cores[i - 1])}'` : 'NULL'
    const bio =
      i === 1
        ? "'Colorista em Recife. Estudo mechas e tons frios há cinco anos.'"
        : 'NULL'
    partes.push(
      `INSERT INTO user (id, name, email, email_verified, perfil, image, bio) VALUES ('${colega}', '${nome}', 'colega${i}-${id}@exemplo.test', 1, 'aluno', ${imagem}, ${bio})`,
      `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mc${i}-${id}', '${colega}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
      `INSERT INTO lancamento_de_pontos (id, user_id, curso_id, origem_tipo, pontos, motivo) VALUES ('lc${i}-${id}', '${colega}', 'c-${id}', 'avulso', ${1000 - i * 10}, 'Teste')`,
    )
  }
  sql(partes.join('; '))
}

// O D1 local é compartilhado entre os arquivos: quem sobra no ranking geral atrapalharia os outros.
function limparRanking(id: string) {
  sql(
    [
      `DELETE FROM lancamento_de_pontos WHERE curso_id = 'c-${id}'`,
      `DELETE FROM matricula WHERE turma_id = 't-${id}'`,
      `DELETE FROM user WHERE id LIKE 'e2e-colega%-${id}'`,
      `DELETE FROM turma WHERE id = 't-${id}'`,
      `DELETE FROM curso WHERE id = 'c-${id}'`,
    ].join('; '),
  )
}

async function axeSemViolacao(page: import('@playwright/test').Page) {
  const r = await new AxeBuilder({ page }).analyze()
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target)}`),
  ).toEqual([])
}

let cenaAtual: string | undefined

test.afterEach(() => {
  if (cenaAtual) limparRanking(cenaAtual)
  cenaAtual = undefined
})

async function montarCena(page: import('@playwright/test').Page) {
  const id = unico()
  const email = `gente-${id}@exemplo.test`
  cadastrarUsuario({ email, nome: 'Aluna Atual' })
  cenaAtual = id
  prepararRanking(id, email)
  await entrarPorCodigo(page, email)
  await page.goto(`/ranking?curso=c-${id}`)
  await esperarReact(page.getByRole('list', { name: 'Pódio' }))
  return id
}

test('ranking: pódio em lista ordenada, foto, selo Você na linha extra e cartão sem e-mail (desktop)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({
    colorScheme: PRINTS_TEMA === 'escuro' ? 'dark' : 'light',
  })
  const id = await montarCena(page)

  const podio = page.getByRole('list', { name: 'Pódio' })
  await expect(podio.getByRole('listitem')).toHaveCount(3)
  await expect(podio.getByRole('listitem').first()).toContainText('1º')
  await expect(podio.getByRole('listitem').first()).toContainText(
    'Marina Albuquerque de Souza',
  )
  await expect(podio.locator('img').first()).toHaveAttribute(
    'src',
    /^data:image\/svg/,
  )
  const demais = page.getByRole('list', { name: 'Demais posições' })
  await expect(demais.getByRole('listitem')).toHaveCount(8) // 4º a 10º e a linha extra
  const extra = demais.getByRole('listitem').last()
  await expect(extra).toContainText('12º')
  await expect(extra).toContainText('Aluna Atual')
  await expect(extra.getByText('Você')).toBeVisible()

  // Pódio no desktop: 2º, 1º, 3º à vista, mas 1º, 2º, 3º na leitura; o 1º no centro e mais alto.
  await page.waitForTimeout(600)
  const itens = await podio.getByRole('listitem').all()
  const caixas = await Promise.all(itens.map((i) => i.boundingBox()))
  const [c1, c2, c3] = caixas
  if (!c1 || !c2 || !c3) throw new Error('Pódio sem caixas')
  expect(c2.x).toBeLessThan(c1.x)
  expect(c1.x).toBeLessThan(c3.x)
  expect(c1.height).toBeGreaterThan(c2.height)
  expect(Math.round(c1.y + c1.height)).toBe(Math.round(c2.y + c2.height))
  expect(Math.round(c1.y + c1.height)).toBe(Math.round(c3.y + c3.height))
  if (PRINTS) {
    mkdirSync(PRINTS, { recursive: true })
    await page.screenshot({
      path: path.join(PRINTS, `desktop-podio-sem-cartao-${PRINTS_TEMA}.png`),
    })
  }

  // Cartão aberto com o mouse: foto grande, nome e bio; nunca e-mail, telefone nem pontos.
  await podio.getByRole('button', { name: /Marina Albuquerque/ }).hover()
  const cartao = page.locator('[data-slot="hover-card-content"]')
  await expect(cartao).toContainText('Marina Albuquerque de Souza')
  await expect(cartao).toContainText('Colorista em Recife')
  const texto = (await cartao.textContent()) ?? ''
  expect(texto).not.toContain('@')
  expect(texto).not.toMatch(/pontos|telefone/i)
  expect(await page.content()).not.toContain(`colega1-${id}@exemplo.test`)
  await axeSemViolacao(page)

  if (PRINTS) {
    mkdirSync(PRINTS, { recursive: true })
    await page.screenshot({
      path: path.join(PRINTS, `desktop-${PRINTS_TEMA}.png`),
    })
  }
})

test('ranking: no toque o cartão vira folha de baixo, sem violação de axe (celular)', async ({
  browser,
}) => {
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    bypassCSP: true,
    colorScheme: PRINTS_TEMA === 'escuro' ? 'dark' : 'light',
  })
  const page = await contexto.newPage()
  await montarCena(page)
  await page
    .getByRole('list', { name: 'Pódio' })
    .getByRole('button', { name: /Marina Albuquerque/ })
    .tap()
  const folha = page.getByRole('dialog')
  await expect(folha).toContainText('Colorista em Recife')
  expect((await folha.textContent()) ?? '').not.toContain('@')
  await page.waitForTimeout(600)
  await axeSemViolacao(page)
  if (PRINTS) {
    mkdirSync(PRINTS, { recursive: true })
    await page.screenshot({
      path: path.join(PRINTS, `celular-cartao-${PRINTS_TEMA}.png`),
    })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(PRINTS, `celular-ranking-${PRINTS_TEMA}.png`),
      fullPage: true,
    })
  }
  await contexto.close()
})
