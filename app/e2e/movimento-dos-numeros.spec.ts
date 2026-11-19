import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, type TestInfo, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Movimento que explica (#108): a barra cresce quando o valor muda com a tela aberta, o ✓ de "Concluir
// aula" se desenha (e não anima ao desmarcar) e os pontos contam do último valor visto até o novo.
test.use({ bypassCSP: true })

const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const print = (testInfo: TestInfo, nome: string) =>
  process.env.PRINTS_DIR
    ? path.join(process.env.PRINTS_DIR, nome)
    : testInfo.outputPath(nome)
const idDoUsuario = (email: string) => `e2e-${email.replace(/\W/g, '-')}`

const TELAS = [
  { nome: 'desktop', width: 1440, height: 900 },
  { nome: 'celular', width: 390, height: 844 },
] as const
const MODOS = ['claro', 'escuro'] as const

function sql(comando: string) {
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', comando],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha no SQL: ${r.stderr}`)
}

function prepararCurso(id: string, email: string, pontos: number) {
  const user = idDoUsuario(email)
  const aulas = [1, 2, 3, 4]
    .map(
      (n) =>
        `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a${n}-${id}', 'm1-${id}', 'Aula ${n} ${id}', '<p>Texto da aula</p>', ${n})`,
    )
    .join('; ')
  sql(
    [
      `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
      `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m1-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
      aulas,
      `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
      `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${user}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
      `INSERT INTO lancamento_de_pontos (id, user_id, curso_id, origem_tipo, pontos, motivo) VALUES ('l-${id}', '${user}', 'c-${id}', 'avulso', ${pontos}, 'Brinde da equipe')`,
    ].join('; '),
  )
}

async function axe(page: Page, onde: string) {
  const r = await new AxeBuilder({ page }).analyze()
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    `axe em ${onde}`,
  ).toEqual([])
}

// Câmera lenta só para o print do meio da contagem: o relógio que o requestAnimationFrame entrega
// anda a um décimo da velocidade, então a contagem de 380 ms dura quase 4 s.
async function cameraLentaDaContagem(page: Page) {
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => original((t) => cb(t * 0.1))
  })
}

test('pontos: contam do último valor visto até o novo e o leitor de tela lê só o final', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `mov-pontos-${id}@exemplo.test`
  cadastrarUsuario({ email })
  prepararCurso(id, email, 250)
  await entrarPorCodigo(page, email)
  await cameraLentaDaContagem(page)
  // O último valor visto (50) está guardado no aparelho, por usuário.
  await page.evaluate(
    ([chave]) => localStorage.setItem(chave, '50'),
    [`mk:valor:${idDoUsuario(email)}:pontos-total`],
  )

  await page.goto('/pontos')
  const total = page.getByText('Total').locator('xpath=following-sibling::p')
  const animado = total.locator('[aria-hidden="true"]')
  const final = total.locator('.sr-only')
  await esperarReact(animado)
  await expect(final).toHaveText('250')
  // O leitor de tela só vê o final: o número que anda não está na árvore de acessibilidade.
  await expect
    .poll(async () => Number((await animado.textContent()) ?? '0'))
    .toBeGreaterThan(50)
  await expect
    .poll(async () => Number((await animado.textContent()) ?? '0'))
    .toBeLessThan(250)
  await page.screenshot({ path: print(testInfo, 'pontos-no-meio.png') })
  await expect(animado).toHaveText('250', { timeout: 15_000 })
  // O valor visto passa a ser o novo.
  expect(
    await page.evaluate(
      ([chave]) => localStorage.getItem(chave),
      [`mk:valor:${idDoUsuario(email)}:pontos-total`],
    ),
  ).toBe('250')
  await axe(page, '/pontos')
})

test('pontos: sem valor guardado, com o mesmo valor ou com menos movimento, aparece direto', async ({
  page,
}) => {
  const id = unico()
  const email = `mov-direto-${id}@exemplo.test`
  cadastrarUsuario({ email })
  prepararCurso(id, email, 90)
  await entrarPorCodigo(page, email)
  await cameraLentaDaContagem(page)
  const total = page.getByText('Total').locator('xpath=following-sibling::p')

  // Sem nada guardado: o número já nasce no valor final (e fica guardado).
  await page.goto('/pontos')
  await esperarReact(total.locator('.sr-only'))
  await expect(total.locator('[aria-hidden="true"]')).toHaveText('90')

  // Mesmo valor visto: nada anima.
  await page.reload()
  await esperarReact(total.locator('.sr-only'))
  await expect(total.locator('[aria-hidden="true"]')).toHaveText('90')

  // Com menos movimento, mesmo com valor antigo guardado, vai direto ao final.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(
    ([chave]) => localStorage.setItem(chave, '10'),
    [`mk:valor:${idDoUsuario(email)}:pontos-total`],
  )
  await page.reload()
  await esperarReact(total.locator('.sr-only'))
  await expect(total.locator('[aria-hidden="true"]')).toHaveText('90')

  // Armazenamento quebrado não derruba a tela.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('bloqueado')
    }
    Storage.prototype.setItem = () => {
      throw new Error('bloqueado')
    }
  })
  await page.reload()
  await esperarReact(total.locator('.sr-only'))
  await expect(total.locator('[aria-hidden="true"]')).toHaveText('90')
})

test('ranking da Comunidade: Sua posição e Seus últimos pontos contam', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `mov-ranking-${id}@exemplo.test`
  cadastrarUsuario({ email })
  prepararCurso(id, email, 300)
  await entrarPorCodigo(page, email)
  await cameraLentaDaContagem(page)
  const user = idDoUsuario(email)
  await page.evaluate(
    (a) => localStorage.setItem(a, '100'),
    `mk:valor:${user}:ranking-pontos:geral`,
  )

  await page.goto('/comunidades?aba=ranking')
  const posicao = page.getByTestId('minha-posicao')
  await esperarReact(posicao.locator('.sr-only'))
  await expect(posicao.locator('.sr-only')).toHaveText('300')
  const animado = posicao.locator('[aria-hidden="true"]')
  await expect
    .poll(async () =>
      Number(((await animado.textContent()) ?? '0').replace(/\D/g, '')),
    )
    .toBeGreaterThan(100)
  await page.screenshot({ path: print(testInfo, 'ranking-no-meio.png') })
  await expect(animado).toHaveText('300', { timeout: 15_000 })

  const ultimos = page.getByTestId('ultimos-pontos')
  // "Seus últimos pontos" não conta: o lançamento aparece direto, sem número animado.
  await expect(ultimos).toContainText('+300')
  await expect(ultimos.locator('[aria-hidden="true"]')).toHaveCount(0)
  await axe(page, '/comunidades?aba=ranking')
})

test('aula de texto: ✓ se desenha ao concluir, desmarcar não anima e a barra do módulo cresce', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const id = unico()
  const email = `mov-aula-${id}@exemplo.test`
  cadastrarUsuario({ email })
  prepararCurso(id, email, 10)
  await entrarPorCodigo(page, email)
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.goto(`/aulas/a2-${id}`)
  const concluir = page.getByRole('button', { name: 'Concluir aula' })
  await esperarReact(concluir)
  await page.keyboard.press('l')
  const barra = page
    .getByRole('progressbar', { name: 'Progresso do módulo' })
    .locator('[data-slot="progress-indicator"]')
  await expect(barra).toBeAttached()
  await page.waitForTimeout(600)
  // Nada animou ao abrir a tela.
  expect(await barra.evaluate((e) => e.getAnimations().length)).toBe(0)
  const marca = concluir.locator('path[data-desenhado]')
  expect(await marca.evaluate((e) => e.getAnimations().length)).toBe(0)
  await expect(marca).toHaveAttribute('data-desenhado', 'false')

  // Concluir desenha o ✓ em 300 ms e a barra cresce com scaleX (nunca width).
  await expect(async () => {
    await concluir.click()
    await expect(page.getByRole('button', { name: 'Concluída' })).toBeVisible({
      timeout: 2000,
    })
  }).toPass()
  const desenhando = page
    .getByRole('button', { name: 'Concluída' })
    .locator('path[data-desenhado]')
  const duracao = await desenhando.evaluate(
    (e) => getComputedStyle(e).transitionDuration,
  )
  expect(duracao).toBe('0.3s')
  await expect
    .poll(() => barra.evaluate((e) => getComputedStyle(e).transform))
    .toMatch(/^matrix\(0\.2[0-9.]*, 0, 0, 1, 0, 0\)$/)
  expect(
    await barra.evaluate((e) =>
      e
        .getAnimations()
        .map((a) => (a as CSSTransition).transitionProperty)
        .join(),
    ),
  ).not.toContain('width')

  // Desmarcar não anima o ✓.
  await page.getByRole('button', { name: 'Concluída' }).click()
  const pendente = page
    .getByRole('button', { name: 'Concluir aula' })
    .locator('path[data-desenhado]')
  await expect(pendente).toHaveAttribute('data-desenhado', 'false')
  expect(
    await pendente.evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe('0s')
  expect(await pendente.evaluate((e) => e.getAnimations().length)).toBe(0)

  // Prints: estado final e um quadro no meio do ✓, nas duas telas e nos dois modos.
  for (const tela of TELAS) {
    for (const modo of MODOS) {
      await page.setViewportSize({ width: tela.width, height: tela.height })
      await page.emulateMedia({
        colorScheme: modo === 'escuro' ? 'dark' : 'light',
      })
      await page.goto(`/aulas/a3-${id}`)
      const botao = page.getByRole('button', { name: 'Concluir aula' })
      await esperarReact(botao)
      await botao.scrollIntoViewIfNeeded()
      await botao.click()
      // Congela a transição no meio.
      await expect(
        page.getByRole('button', { name: 'Concluída' }),
      ).toBeVisible()
      await page.evaluate(() => {
        for (const a of document.getAnimations()) {
          a.pause()
          a.currentTime = 150
        }
      })
      await page.screenshot({
        path: print(testInfo, `aula-meio-${tela.nome}-${modo}.png`),
      })
      await page.evaluate(() => {
        for (const a of document.getAnimations()) a.finish()
      })
      await page.screenshot({
        path: print(testInfo, `aula-final-${tela.nome}-${modo}.png`),
      })
      if (tela.nome === 'desktop' && modo === 'claro') await axe(page, 'aula')
      // Volta ao estado pendente para a próxima rodada.
      await page.getByRole('button', { name: 'Concluída' }).click()
      await expect(
        page.getByRole('button', { name: 'Concluir aula' }),
      ).toBeVisible()
    }
  }
})

test('prints dos números e das barras nas duas telas e nos dois modos', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const id = unico()
  const email = `mov-prints-${id}@exemplo.test`
  cadastrarUsuario({ email })
  prepararCurso(id, email, 1250)
  await entrarPorCodigo(page, email)
  for (const tela of TELAS) {
    for (const modo of MODOS) {
      await page.setViewportSize({ width: tela.width, height: tela.height })
      await page.emulateMedia({
        colorScheme: modo === 'escuro' ? 'dark' : 'light',
      })
      for (const [rota, nome] of [
        ['/pontos', 'pontos'],
        ['/comunidades?aba=ranking', 'ranking'],
        [`/cursos/c-${id}`, 'curso'],
        ['/', 'meus-cursos'],
      ] as const) {
        await page.goto(rota)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(700)
        await page.screenshot({
          path: print(testInfo, `${nome}-final-${tela.nome}-${modo}.png`),
        })
      }
    }
  }
})
