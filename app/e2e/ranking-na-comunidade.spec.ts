import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// O CSP do app usa nonce: o axe injeta script, então precisa contornar.
test.use({ bypassCSP: true })

const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const PRINTS = process.env.PRINTS_DIR

function sql(comando: string) {
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', comando],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha no SQL: ${r.stderr}`)
}

const NOME_LONGO =
  'Maria Aparecida Fernandes de Albuquerque Cavalcanti Nascimento Souza'

interface Cena {
  id: string
  email: string
  curso: string
}

// Curso com matrícula da aluna. `colegas` = pontos de cada colega (a posição 1 em diante); o
// colega 1 tem nome longo, os dois do meio empatam e ninguém tem foto. A aluna fica com 5 pontos.
function prepararCena(
  email: string,
  id: string,
  colegas: number[],
  pontosDaAluna: number,
) {
  const euId = `e2e-${email.replace(/\W/g, '-')}`
  const partes = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${euId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
  ]
  if (pontosDaAluna > 0) {
    partes.push(
      `INSERT INTO lancamento_de_pontos (id, user_id, curso_id, origem_tipo, pontos, motivo) VALUES ('l-eu-${id}', '${euId}', 'c-${id}', 'avulso', ${pontosDaAluna}, 'Brinde da equipe')`,
    )
  }
  colegas.forEach((pontos, indice) => {
    const i = indice + 1
    const colega = `e2e-colega${i}-${id}`
    const nome = i === 1 ? NOME_LONGO : `Colega ${i}`
    partes.push(
      `INSERT INTO user (id, name, email, email_verified, perfil) VALUES ('${colega}', '${nome}', 'colega${i}-${id}@exemplo.test', 1, 'aluno')`,
      `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mc${i}-${id}', '${colega}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
      `INSERT INTO lancamento_de_pontos (id, user_id, curso_id, origem_tipo, pontos, motivo) VALUES ('lc${i}-${id}', '${colega}', 'c-${id}', 'avulso', ${pontos}, 'Teste')`,
    )
  })
  sql(partes.join('; '))
}

// O D1 local é compartilhado entre os arquivos: nada pode sobrar no ranking geral.
function limpar(id: string) {
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

async function axeSemViolacao(page: Page) {
  const r = await new AxeBuilder({ page }).analyze()
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target)}`),
  ).toEqual([])
}

let cenaAtual: string | undefined
test.afterEach(() => {
  if (cenaAtual) limpar(cenaAtual)
  cenaAtual = undefined
})

// 11 colegas acima da aluna (empate no 2º lugar entre os colegas 2 e 3): ela é a 12ª, fora do top 10.
const COLEGAS_ACIMA = [900, 800, 800, 700, 690, 680, 670, 660, 650, 640, 630]

function montar(colegas: number[], pontosDaAluna: number): Cena {
  const id = unico()
  const email = `rank-${id}@exemplo.test`
  cadastrarUsuario({ email, nome: 'Aluna Atual' })
  cenaAtual = id
  prepararCena(email, id, colegas, pontosDaAluna)
  return { id, email, curso: `Curso ${id}` }
}

test('Comunidade tem as abas Mural e Ranking, e o Ranking mostra pódio, posição e últimos pontos', async ({
  page,
}) => {
  const cena = montar(COLEGAS_ACIMA, 5)
  await entrarPorCodigo(page, cena.email)
  await page.goto('/comunidades')

  const abas = page.getByRole('navigation', { name: 'Seções da Comunidade' })
  await expect(abas.getByRole('link', { name: 'Mural' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await esperarReact(abas)
  await abas.getByRole('link', { name: 'Ranking' }).click()
  await expect(page).toHaveURL(/\/comunidades\?aba=ranking/)
  await expect(abas.getByRole('link', { name: 'Ranking' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(
    page.getByRole('heading', { name: 'Comunidade', exact: true }),
  ).toBeVisible()
  // A aba Ranking não carrega o mural.
  await expect(page.getByLabel('Ranking de')).toBeVisible()
  await expect(page.getByRole('search')).toHaveCount(0)

  // Escolhe o curso no seletor (não é fileira de botões).
  await page.getByLabel('Ranking de').selectOption({ label: cena.curso })
  await expect(page).toHaveURL(new RegExp(`curso=c-${cena.id}`))

  const podio = page.getByRole('list', { name: 'Pódio' })
  await expect(podio.getByRole('listitem')).toHaveCount(3)
  await expect(podio.getByRole('listitem').first()).toContainText(NOME_LONGO)
  // Empate: os dois colegas dividem o 2º lugar.
  await expect(podio.getByRole('listitem').nth(1)).toContainText('2º')
  await expect(podio.getByRole('listitem').nth(2)).toContainText('2º')

  // No desktop o 1º fica no centro, mesmo com o empate repetindo o "2º".
  await page.waitForTimeout(600)
  const [c1, c2, c3] = await Promise.all(
    [0, 1, 2].map((i) => podio.getByRole('listitem').nth(i).boundingBox()),
  )
  if (!c1 || !c2 || !c3) throw new Error('Pódio sem caixas')
  expect(c2.x).toBeLessThan(c1.x)
  expect(c1.x).toBeLessThan(c3.x)

  const minha = page.getByTestId('minha-posicao')
  await expect(minha).toContainText('12º')
  await expect(minha).toContainText('5 pontos')
  await expect(
    page
      .getByRole('list', { name: 'Demais posições' })
      .getByRole('listitem')
      .last(),
  ).toContainText('Você')

  const ultimos = page.getByTestId('ultimos-pontos')
  await expect(ultimos).toContainText('Brinde da equipe')
  await expect(ultimos).toContainText('+5')
  await ultimos.getByRole('link', { name: 'Ver meus pontos' }).click()
  await expect(page).toHaveURL(/\/pontos/)
  await expect(page.getByRole('heading', { name: 'Meus pontos' })).toBeVisible()
})

test('"Meus pontos" no avatar abre o extrato', async ({ page }) => {
  const cena = montar(COLEGAS_ACIMA, 5)
  await entrarPorCodigo(page, cena.email)
  await page.goto('/comunidades?aba=ranking')
  await esperarReact(page.getByTestId('ultimos-pontos'))
  await expect(async () => {
    await page.getByRole('button', { name: 'Abrir menu da conta' }).click()
    await expect(
      page.getByRole('menuitem', { name: 'Meus pontos' }),
    ).toBeVisible({ timeout: 1000 })
  }).toPass()
  await page.getByRole('menuitem', { name: 'Meus pontos' }).click()
  await expect(page).toHaveURL(/\/pontos/)
  await expect(page.getByText('Brinde da equipe')).toBeVisible()
})

test('o link antigo /ranking abre a aba Ranking da Comunidade, com o curso', async ({
  page,
}) => {
  const cena = montar(COLEGAS_ACIMA, 5)
  await entrarPorCodigo(page, cena.email)

  const resposta = await page.goto(`/ranking?curso=c-${cena.id}`)
  expect(resposta?.status()).toBe(200)
  await expect(page).toHaveURL(
    new RegExp(`/comunidades\\?aba=ranking&curso=c-${cena.id}`),
  )
  await expect(page.getByRole('list', { name: 'Pódio' })).toBeVisible()
  await expect(page.getByLabel('Ranking de')).toHaveValue(`c-${cena.id}`)

  await page.goto('/ranking')
  await expect(page).toHaveURL(/\/comunidades\?aba=ranking$/)
  await expect(
    page.getByRole('navigation', { name: 'Seções da Comunidade' }),
  ).toBeVisible()
  // Comunidade segue marcada como destino do topo.
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Comunidade' }).first(),
  ).toHaveAttribute('aria-current', 'page')
})

test('ninguém com pontos: o Ranking diz isso e os últimos pontos também', async ({
  page,
}) => {
  const cena = montar([], 0)
  await entrarPorCodigo(page, cena.email)
  await page.goto(`/comunidades?aba=ranking&curso=c-${cena.id}`)
  await expect(
    page.locator('[data-slot="empty"][data-ilustracao="fita"]'),
  ).toContainText('Ninguém pontuou ainda')
  await expect(page.getByTestId('ultimos-pontos')).toContainText(
    'Você ainda não tem pontos',
  )
})

test('prints e axe do Ranking: celular e desktop, claro e escuro', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const cena = montar(COLEGAS_ACIMA, 5)
  const tamanhos = [
    { nome: 'celular', width: 390, height: 844, mobile: true },
    { nome: 'desktop', width: 1440, height: 900, mobile: false },
  ]
  for (const t of tamanhos) {
    for (const tema of ['claro', 'escuro'] as const) {
      const contexto = await browser.newContext({
        viewport: { width: t.width, height: t.height },
        hasTouch: t.mobile,
        isMobile: t.mobile,
        bypassCSP: true,
        colorScheme: tema === 'escuro' ? 'dark' : 'light',
      })
      const page = await contexto.newPage()
      await entrarPorCodigo(page, cena.email)
      await page.goto(`/comunidades?aba=ranking&curso=c-${cena.id}`)
      await esperarReact(page.getByRole('list', { name: 'Pódio' }))
      await page.waitForTimeout(700)
      await axeSemViolacao(page)
      // Sem rolagem horizontal, nem com nome longo.
      const sobra = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      )
      expect(sobra, `${t.nome}-${tema}`).toBeLessThanOrEqual(0)
      if (PRINTS) {
        mkdirSync(PRINTS, { recursive: true })
        await page.screenshot({
          path: path.join(PRINTS, `ranking-${t.nome}-${tema}.png`),
          fullPage: true,
        })
      }
      await contexto.close()
    }
  }
})
