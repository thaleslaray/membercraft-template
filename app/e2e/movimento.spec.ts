import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type TestInfo, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Fundação de movimento (#89): troca de tela com direção, acordeão que reverte do ponto onde está e
// esqueleto sem pulso. Os prints vão para a pasta de prints da fatia.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
// Onde vão os prints: `PRINTS_DIR` (quando quem revisa quer guardá-los) ou a pasta de saída do teste,
// que existe em qualquer máquina (o CI não tem a pasta do desenvolvedor).
const print = (testInfo: TestInfo, nome: string) =>
  process.env.PRINTS_DIR
    ? path.join(process.env.PRINTS_DIR, nome)
    : testInfo.outputPath(nome)

function prepararCurso(id: string, email: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const aulas = [1, 2, 3, 4, 5, 6]
    .map(
      (n) =>
        `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a${n}-${id}', 'm${n <= 3 ? 1 : 2}-${id}', 'Aula ${n} ${id}', '<p>Texto</p>', ${n})`,
    )
    .join('; ')
  const sql = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m1-${id}', 'c-${id}', 'Módulo um ${id}', 1)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m2-${id}', 'c-${id}', 'Módulo dois ${id}', 2)`,
    aulas,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
  ].join('; ')
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao preparar o curso: ${r.stderr}`)
}

test('entrar no curso vem da direita, voltar sai para a direita', async ({
  page,
}, testInfo) => {
  const id = unico()
  const email = `movimento-${id}@exemplo.test`
  cadastrarUsuario({ email })
  prepararCurso(id, email)
  await page.addInitScript(() => {
    // biome-ignore lint/suspicious/noExplicitAny: espiona a API do navegador
    const w = window as any
    w.__tipos = []
    // Transições começadas e terminadas: o roteador só sabe de que tela saiu depois de terminar a anterior.
    w.__comecou = 0
    w.__terminou = 0
    const original = document.startViewTransition?.bind(document)
    if (!original) return
    // biome-ignore lint/suspicious/noExplicitAny: espiona a API do navegador
    document.startViewTransition = ((arg: any) => {
      w.__tipos.push(arg?.types ?? null)
      const vt = original(arg)
      w.__comecou += 1
      vt.finished.finally(() => {
        w.__terminou += 1
      })
      vt.ready.then(() => {
        if (!w.__congelar) return
        for (const a of document.getAnimations()) {
          const alvo = (a.effect as KeyframeEffect | null)?.pseudoElement
          if (alvo?.startsWith('::view-transition')) {
            a.pause()
            a.currentTime = 150
          }
        }
      })
      return vt
    }) as typeof document.startViewTransition
  })
  await entrarPorCodigo(page, email)
  await page.goto('/')
  const link = page
    .getByRole('link', { name: new RegExp(`Curso ${id}`) })
    .first()
  await esperarReact(link)
  // Um link do Início que leva ao curso (cartão de Meus cursos).
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: gancho de teste
    ;(window as any).__tipos = []
  })
  await link.click()
  await expect(page).toHaveURL(/\/(cursos|aulas)\//)
  // A transição começa depois de o endereço mudar (o carregamento vem antes): espera ela aparecer.
  // biome-ignore lint/suspicious/noExplicitAny: gancho de teste
  const tipos = () => page.evaluate(() => (window as any).__tipos.at(-1))
  await expect.poll(tipos).toEqual(['avancar'])
  // Voltar no meio da entrada é outra coisa (o roteador ainda tem o Início como tela atual e não
  // anima): o que este teste prova é a direção de uma volta feita com a entrada já assentada.
  await expect
    .poll(() =>
      page.evaluate(() => {
        // biome-ignore lint/suspicious/noExplicitAny: gancho de teste
        const w = window as any
        return w.__comecou - w.__terminou
      }),
    )
    .toBe(0)

  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect.poll(tipos).toEqual(['voltar'])

  // Print no meio da entrada (animação congelada em 150 ms), em duas larguras.
  for (const [nome, tamanho] of [
    ['celular', { width: 390, height: 844 }],
    ['desktop', { width: 1440, height: 900 }],
  ] as const) {
    await page.setViewportSize(tamanho)
    await page.goto('/')
    const l = page
      .getByRole('link', { name: new RegExp(`Curso ${id}`) })
      .first()
    await esperarReact(l)
    // biome-ignore lint/suspicious/noExplicitAny: gancho de teste
    await page.evaluate(() => ((window as any).__congelar = true))
    await l.click()
    await page.waitForTimeout(400)
    await page.screenshot({
      path: print(testInfo, `troca-avancar-${nome}.png`),
    })
    // biome-ignore lint/suspicious/noExplicitAny: gancho de teste
    await page.evaluate(() => ((window as any).__congelar = false))
  }
})

test('o módulo do curso reverte do ponto onde está, sem salto', async ({
  page,
}, testInfo) => {
  const id = unico()
  const email = `acordeao-${id}@exemplo.test`
  cadastrarUsuario({ email })
  prepararCurso(id, email)
  await entrarPorCodigo(page, email)
  await page.goto(`/cursos/c-${id}`)
  const gatilho = page.getByRole('button', { name: /Módulo dois/ })
  await esperarReact(gatilho)
  const conteudo = page
    .locator('[data-slot="accordion-content"] > .recolhe')
    .nth(1)

  const altura = () =>
    conteudo.evaluate((el) => el.getBoundingClientRect().height)
  // O curso abre os módulos com aula por fazer (#97): fecha o segundo para partir do estado fechado.
  if ((await gatilho.getAttribute('aria-expanded')) === 'true') {
    await gatilho.click()
    await expect(conteudo).toBeHidden()
    await page.waitForTimeout(600)
  }
  // Fechado: altura 0 e fora da árvore de acessibilidade.
  expect(await altura()).toBe(0)
  await expect(conteudo).toBeHidden()

  const congelar = (ms: number) =>
    conteudo.evaluate((el, t) => {
      for (const a of el.getAnimations()) {
        a.pause()
        a.currentTime = t
      }
    }, ms)
  const soltar = () =>
    conteudo.evaluate((el) => {
      for (const a of el.getAnimations()) a.play()
    })
  await gatilho.click()
  await congelar(120)
  const meio = await altura()
  expect(meio).toBeGreaterThan(0)
  await page.screenshot({
    path: print(testInfo, 'acordeao-aberto-no-meio.png'),
  })
  await soltar()
  // Inverte no meio da abertura: a altura parte de onde estava, sem pular.
  await gatilho.click()
  const depoisDeInverter = await altura()
  expect(depoisDeInverter).toBeGreaterThan(0)
  expect(Math.abs(depoisDeInverter - meio)).toBeLessThan(meio * 0.5)
  await congelar(60)
  await page.screenshot({
    path: print(testInfo, 'acordeao-revertido-no-meio.png'),
  })
  await soltar()
  await page.waitForTimeout(600)
  expect(await altura()).toBe(0)

  // Abre de verdade: conteúdo visível e aulas acessíveis.
  await gatilho.click()
  await expect(
    page.getByRole('link', { name: new RegExp(`Aula 4 ${id}`) }),
  ).toBeVisible()
  await page.screenshot({ path: print(testInfo, 'acordeao-aberto.png') })
})

test('o esqueleto não pulsa e menos movimento troca deslize por esmaecimento', async ({
  page,
}) => {
  await page.goto('/login')
  const css = await page.evaluate(() => {
    const el = document.createElement('div')
    el.setAttribute('data-slot', 'skeleton')
    el.className = 'esqueleto'
    document.body.appendChild(el)
    const estilo = getComputedStyle(el)
    return {
      nome: estilo.animationName,
      iteracoes: estilo.animationIterationCount,
    }
  })
  expect(css.nome).toBe('aparecer')
  expect(css.iteracoes).toBe('1')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const tokens = await page.evaluate(() => {
    const e = getComputedStyle(document.documentElement)
    return {
      lento: e.getPropertyValue('--mov-lento').trim(),
      rapido: e.getPropertyValue('--mov-rapido').trim(),
    }
  })
  expect(tokens).toEqual({ lento: '120ms', rapido: '0ms' })
})
