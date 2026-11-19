import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Fim do vídeo (#104): o cartão da próxima aula, a contagem de 5 s, "Ficar aqui", a preferência
// "Tocar a próxima sozinha" e o marco que abre no fim do vídeo. O Vimeo não toca no e2e: o gancho de
// desenvolvimento `window.__simularFimDoVideo` dispara o evento de fim.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test.use({ bypassCSP: true })

function sql(arquivo: string, linhas: string[]) {
  writeFileSync(arquivo, `${linhas.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha no SQL: ${r.stderr}`)
}

function preferenciaNoBanco(email: string): boolean {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
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
      `SELECT proxima_aula_sozinha AS v FROM user WHERE id = '${userId}'`,
    ],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  const saida = JSON.parse(r.stdout) as { results: { v: number }[] }[]
  return saida[0].results[0].v === 1
}

// Módulo 1: v1, v2 e v3 (a v3 trancada) e uma quarta, longa de título. Módulo 2: w1 e w2 (w1 já concluída,
// então terminar a w2 fecha o módulo; o curso ainda tem o módulo 1 aberto).
function prepararCurso(id: string, email: string, pasta: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const aula = (
    aid: string,
    mod: string,
    titulo: string,
    ordem: number,
    vimeo: string | null = '76979871',
  ) =>
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, vimeo_id, ordem) VALUES ('${aid}-${id}', '${mod}-${id}', '${titulo}', '', ${vimeo ? `'${vimeo}'` : 'NULL'}, ${ordem})`
  sql(path.join(pasta, `fim-${id}.sql`), [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso do fim do vídeo ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m1-${id}', 'c-${id}', 'Módulo 1 ${id}', 1)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m2-${id}', 'c-${id}', 'Módulo 2 ${id}', 2)`,
    aula('v1', 'm1', `Primeira aula ${id}`, 1),
    aula(
      'v2',
      'm1',
      `Segunda aula com um título bem comprido para conferir a quebra de linha no cartão do fim do vídeo ${id}`,
      2,
    ),
    aula('v3', 'm1', `Terceira aula trancada ${id}`, 3),
    aula('w1', 'm2', `Aula W1 ${id}`, 1),
    aula('w2', 'm2', `Aula W2 ${id}`, 2),
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
    `INSERT INTO regra_de_liberacao (id, turma_id, aula_id, tipo) VALUES ('r-${id}', 't-${id}', 'v3-${id}', 'bloqueado')`,
    `INSERT INTO progresso_da_aula (id, user_id, aula_id, aberta_em, concluida_em) VALUES ('p-${id}', '${userId}', 'w1-${id}', ${Date.now()}, ${Date.now()})`,
  ])
}

async function abrir(page: Page, email: string, id: string, aula: string) {
  await entrarPorCodigo(page, email)
  await page.goto(`/aulas/${aula}-${id}`)
  await esperarReact(page.getByRole('button', { name: 'Mais opções da aula' }))
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __simularFimDoVideo?: unknown })
        .__simularFimDoVideo === 'function',
  )
}

const fimDoVideo = (page: Page, concluir = false) =>
  page.evaluate((c) => {
    ;(
      window as unknown as {
        __simularFimDoVideo: (o?: { concluir?: boolean }) => void
      }
    ).__simularFimDoVideo({ concluir: c })
  }, concluir)

const cartao = (page: Page) => page.getByRole('region', { name: 'Fim da aula' })

async function novoAluno(
  page: Page,
  testInfo: { outputPath: (n: string) => string },
  prefixo: string,
) {
  const id = unico()
  const email = `${prefixo}-${id}@exemplo.test`
  cadastrarUsuario({ email })
  prepararCurso(id, email, testInfo.outputPath('.'))
  await page.setViewportSize({ width: 1440, height: 900 })
  return { id, email }
}

test('o cartão anuncia a próxima, conta 5 s e abre a próxima aula sozinho', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const { id, email } = await novoAluno(page, testInfo, 'fim-conta')
  await abrir(page, email, id, 'v1')

  await expect(cartao(page)).toHaveCount(0)
  await fimDoVideo(page)
  await expect(cartao(page)).toBeVisible()
  await expect(cartao(page).getByText(`Primeira aula ${id}`)).toBeVisible()
  await expect(cartao(page).getByText(/concluída/)).toBeVisible()
  await expect(
    cartao(page).getByText(/Segunda aula com um título/),
  ).toBeVisible()
  await expect(cartao(page).getByText(/Próxima aula em \d s/)).toBeVisible()
  // "Ficar aqui" já vem focado: Enter cancela sem procurar o botão.
  await expect(
    cartao(page).getByRole('button', { name: 'Ficar aqui' }),
  ).toBeFocused()
  // As cinco carinhas da avaliação estão no cartão.
  await expect(
    cartao(page).getByRole('radiogroup', { name: 'Nota da aula, de 1 a 5' }),
  ).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/aulas/v1-${id}$`))
  await expect(page).toHaveURL(new RegExp(`/aulas/v2-${id}$`), {
    timeout: 12_000,
  })
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Segunda aula',
  )
})

test('o mouse em cima pausa a contagem; ao sair ela segue', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const { id, email } = await novoAluno(page, testInfo, 'fim-pausa')
  await abrir(page, email, id, 'v1')
  await fimDoVideo(page)
  await cartao(page).hover()
  await page.waitForTimeout(7000)
  await expect(page).toHaveURL(new RegExp(`/aulas/v1-${id}$`))
  await expect(cartao(page)).toBeVisible()
  await page.mouse.move(2, 2)
  await expect(page).toHaveURL(new RegExp(`/aulas/v2-${id}$`), {
    timeout: 12_000,
  })
})

test('aba em segundo plano cancela a contagem, e ao voltar a próxima não começa sozinha', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const { id, email } = await novoAluno(page, testInfo, 'fim-aba')
  await abrir(page, email, id, 'v1')
  await fimDoVideo(page)
  await expect(cartao(page).getByText(/Próxima aula em/)).toBeVisible()

  // Simula a aba indo para segundo plano e voltando (o navegador de teste está sempre visível).
  const trocarVisibilidade = (oculta: boolean) =>
    page.evaluate((o) => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => o,
      })
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (o ? 'hidden' : 'visible'),
      })
      document.dispatchEvent(new Event('visibilitychange'))
    }, oculta)
  await trocarVisibilidade(true)
  await expect(cartao(page).getByText(/Próxima aula em/)).toHaveCount(0)
  await trocarVisibilidade(false)
  await page.waitForTimeout(7000)
  await expect(page).toHaveURL(new RegExp(`/aulas/v1-${id}$`))
  await expect(cartao(page)).toBeVisible()
  await expect(cartao(page).getByText(/Próxima aula em/)).toHaveCount(0)
  // A escolha continua à mão.
  await cartao(page).getByRole('button', { name: 'Assistir agora' }).click()
  await expect(page).toHaveURL(new RegExp(`/aulas/v2-${id}$`))
})

test('"Ficar aqui" e Esc fecham o cartão e ficam na aula', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const { id, email } = await novoAluno(page, testInfo, 'fim-ficar')
  await abrir(page, email, id, 'v1')

  await fimDoVideo(page)
  await cartao(page).getByRole('button', { name: 'Ficar aqui' }).click()
  await expect(cartao(page)).toHaveCount(0)
  await page.waitForTimeout(6000)
  await expect(page).toHaveURL(new RegExp(`/aulas/v1-${id}$`))

  await fimDoVideo(page)
  await expect(cartao(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(cartao(page)).toHaveCount(0)
  await page.waitForTimeout(6000)
  await expect(page).toHaveURL(new RegExp(`/aulas/v1-${id}$`))
})

test('avaliar no cartão cancela a contagem, e "Assistir agora" abre a próxima', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const { id, email } = await novoAluno(page, testInfo, 'fim-avalia')
  await abrir(page, email, id, 'v1')
  await fimDoVideo(page)
  await cartao(page)
    .getByRole('radio', { name: /4 de 5/ })
    .click()
  await expect(cartao(page).getByText(/Próxima aula em/)).toHaveCount(0)
  await expect(cartao(page).getByText(/Sua nota: 4 de 5/)).toBeVisible()
  await page.waitForTimeout(6000)
  await expect(page).toHaveURL(new RegExp(`/aulas/v1-${id}$`))
  await cartao(page).getByRole('button', { name: 'Assistir agora' }).click()
  await expect(page).toHaveURL(new RegExp(`/aulas/v2-${id}$`))
})

test('com a preferência desligada no menu ⋯ o cartão não conta, e ela fica na conta', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const { id, email } = await novoAluno(page, testInfo, 'fim-pref')
  await abrir(page, email, id, 'v1')
  expect(preferenciaNoBanco(email)).toBe(true)

  await page.getByRole('button', { name: 'Mais opções da aula' }).click()
  const item = page.getByRole('menuitemcheckbox', {
    name: 'Tocar a próxima sozinha',
  })
  await expect(item).toBeChecked()
  await item.click()
  await expect.poll(() => preferenciaNoBanco(email)).toBe(false)

  // Vale em outra visita: a sessão traz a preferência.
  await page.reload()
  await esperarReact(page.getByRole('button', { name: 'Mais opções da aula' }))
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __simularFimDoVideo?: unknown })
        .__simularFimDoVideo === 'function',
  )
  await fimDoVideo(page)
  await expect(cartao(page)).toBeVisible()
  await expect(cartao(page).getByText(/Próxima aula em/)).toHaveCount(0)
  await expect(
    cartao(page).getByRole('button', { name: 'Assistir agora' }),
  ).toBeVisible()
  await page.waitForTimeout(7000)
  await expect(page).toHaveURL(new RegExp(`/aulas/v1-${id}$`))

  // E liga de novo.
  await cartao(page).getByRole('button', { name: 'Ficar aqui' }).click()
  await page.getByRole('button', { name: 'Mais opções da aula' }).click()
  await page
    .getByRole('menuitemcheckbox', { name: 'Tocar a próxima sozinha' })
    .click()
  await expect.poll(() => preferenciaNoBanco(email)).toBe(true)
})

test('próxima trancada mostra o cadeado, sem contagem nem "Assistir agora"', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const { id, email } = await novoAluno(page, testInfo, 'fim-cadeado')
  await abrir(page, email, id, 'v2')
  await fimDoVideo(page)
  await expect(cartao(page)).toBeVisible()
  await expect(
    cartao(page).getByText('A próxima aula está trancada'),
  ).toBeVisible()
  await expect(cartao(page).getByText(/Próxima aula em/)).toHaveCount(0)
  await expect(
    cartao(page).getByRole('button', { name: 'Assistir agora' }),
  ).toHaveCount(0)
  await page.waitForTimeout(6000)
  await expect(page).toHaveURL(new RegExp(`/aulas/v2-${id}$`))
})

test('o marco do módulo abre no fim do vídeo, no lugar do cartão', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const { id, email } = await novoAluno(page, testInfo, 'fim-marco')
  await abrir(page, email, id, 'w2')
  // A conclusão (aos 90%) não abre nada por cima do vídeo...
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // ...a tela do módulo vem no fim do vídeo, sem o cartão.
  await fimDoVideo(page, true)
  await expect(
    page.getByRole('dialog').getByText('Módulo concluído'),
  ).toBeVisible()
  await expect(cartao(page)).toHaveCount(0)
})

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]

for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`prints e axe do fim do vídeo: ${tela.nome} ${modo}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(180_000)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      const pasta = process.env.PRINTS_DIR ?? testInfo.outputPath('.')
      const { id, email } = await novoAluno(page, testInfo, 'fim-prints')
      await page.setViewportSize(tela.viewport)
      const foto = (nome: string) =>
        page.screenshot({
          path: path.join(pasta, `${nome}-${tela.nome}-${modo}.png`),
        })
      const axe = async (onde: string) => {
        const { AxeBuilder } = await import('@axe-core/playwright')
        const r = await new AxeBuilder({ page })
          .disableRules(['region'])
          .analyze()
        expect(
          r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
          `axe em ${onde}`,
        ).toEqual([])
      }

      await abrir(page, email, id, 'v1')
      await page.waitForTimeout(800)
      await foto('video-e-titulo')
      await axe(`vídeo ${tela.nome} ${modo}`)

      await fimDoVideo(page)
      await expect(cartao(page)).toBeVisible()
      await page.waitForTimeout(1200)
      await foto('cartao-contagem')
      await axe(`cartão com contagem ${tela.nome} ${modo}`)
      await cartao(page).getByRole('button', { name: 'Ficar aqui' }).click()

      // Próxima trancada, título comprido.
      await page.goto(`/aulas/v2-${id}`)
      await esperarReact(
        page.getByRole('button', { name: 'Mais opções da aula' }),
      )
      await page.waitForFunction(
        () =>
          typeof (window as unknown as { __simularFimDoVideo?: unknown })
            .__simularFimDoVideo === 'function',
      )
      await fimDoVideo(page)
      await expect(cartao(page)).toBeVisible()
      await page.waitForTimeout(400)
      await foto('cartao-trancada')
      await axe(`cartão trancada ${tela.nome} ${modo}`)
    })
  }
}
