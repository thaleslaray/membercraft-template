import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, type TestInfo, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Correção final da integração da área do aluno: a conta na casca, o rótulo da marca que saiu, o botão
// do curso numa linha, o controle Mural | Ranking no escuro, o título alinhado ao vídeo, o esqueleto só no
// primeiro carregamento, o certificado com "Copiar link" e em folha no celular, a busca ⌘K (fala, favorita,
// "ver como aluno") e o fio de atendimento acessível. Prints em PRINTS_DIR (ou na pasta do teste).
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const print = (testInfo: TestInfo, nome: string) =>
  process.env.PRINTS_DIR
    ? path.join(process.env.PRINTS_DIR, nome)
    : testInfo.outputPath(nome)

test.use({ bypassCSP: true })

const TELAS = [
  { nome: 'celular', viewport: { width: 390, height: 844 } },
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
] as const
const MODOS = ['claro', 'escuro'] as const

async function preparar(
  page: Page,
  tela: (typeof TELAS)[number],
  modo: (typeof MODOS)[number],
) {
  await page.setViewportSize(tela.viewport)
  await page.addInitScript((m) => {
    localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
  }, modo)
}

function sql(pasta: string, nome: string, linhas: string[]) {
  mkdirSync(pasta, { recursive: true })
  const arquivo = path.join(pasta, nome)
  writeFileSync(arquivo, `${linhas.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha no SQL: ${r.stderr}`)
}

const idDoUsuario = (email: string) => `e2e-${email.replace(/\W/g, '-')}`

/**
 * Um curso com três aulas de vídeo: a primeira concluída e favorita (com fala na transcrição), a segunda
 * de título bem comprido (a próxima), a terceira trancada para a turma. A aluna está matriculada.
 */
function semear(pasta: string, id: string, email: string, fala: string) {
  const userId = idDoUsuario(email)
  const agora = Date.now()
  sql(pasta, `semente-${id}.sql`, [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso final ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo final ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, vimeo_id, ordem) VALUES ('v1-${id}', 'm-${id}', 'Zebra livre ${id}', '', 'x${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, vimeo_id, ordem) VALUES ('v2-${id}', 'm-${id}', 'Uma aula com um título muito, muito comprido, para conferir que o botão principal do curso continua numa linha só ${id}', '', '76979871', 2)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, vimeo_id, ordem) VALUES ('v3-${id}', 'm-${id}', 'Zebra trancada ${id}', '', '76979871', 3)`,
    `INSERT INTO transcricao (vimeo_id, arquivo) VALUES ('x${id}', 'a.vtt')`,
    `INSERT INTO trecho_da_transcricao (vimeo_id, inicio, texto, texto_busca) VALUES ('x${id}', 95, 'agora a ${fala} no comprimento', 'agora a ${fala} no comprimento')`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${agora - 86_400_000})`,
    `INSERT INTO regra_de_liberacao (id, turma_id, aula_id, tipo) VALUES ('r-${id}', 't-${id}', 'v3-${id}', 'bloqueado')`,
    `INSERT INTO progresso_da_aula (id, user_id, aula_id, aberta_em, concluida_em) VALUES ('p-${id}', '${userId}', 'v1-${id}', ${agora}, ${agora})`,
    `INSERT INTO favorito (user_id, aula_id, created_at) VALUES ('${userId}', 'v1-${id}', ${agora})`,
  ])
}

async function entrar(page: Page, email: string) {
  await entrarPorCodigo(page, email)
}

async function abrirBuscaRapida(page: Page, url = '/') {
  await page.goto(url)
  const gatilho = page.getByRole('button', {
    name: /Pesquisar aulas e vídeos|Abrir a busca/,
  })
  await esperarReact(gatilho)
  await expect(async () => {
    await page.keyboard.press('Control+k')
    await expect(
      page.getByRole('dialog', { name: 'Busca rápida' }),
    ).toBeVisible({ timeout: 1500 })
  }).toPass()
}

for (const tela of TELAS) {
  for (const modo of MODOS) {
    test(`conta na casca, curso, aula, Comunidade e Meus pontos: ${tela.nome} ${modo}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(180_000)
      await preparar(page, tela, modo)
      const id = unico()
      const email = `final-${id}@exemplo.test`
      cadastrarUsuario({ email, nome: 'Aluna Final' })
      semear(
        testInfo.outputDir,
        id,
        email,
        `hidratacao${id.replace(/\W/g, '')}`,
      )
      await entrar(page, email)
      const celular = tela.nome === 'celular'

      // A1: a conta usa a casca do aluno (destinos no topo, abas do pé no celular), sem o cabeçalho do site.
      await page.goto('/conta')
      await esperarReact(page.getByRole('heading', { name: 'Sua conta' }))
      if (celular) {
        await expect(
          page.getByRole('navigation', { name: 'Abas' }),
        ).toBeVisible()
      } else {
        await expect(
          page
            .getByRole('navigation', { name: 'Destinos' })
            .getByRole('link', { name: 'Meus cursos' }),
        ).toBeVisible()
      }
      await expect(
        page.getByRole('button', { name: 'Abrir menu da conta' }),
      ).toBeVisible()
      await page.waitForTimeout(400)
      await page.screenshot({
        path: print(testInfo, `a1-conta-${tela.nome}-${modo}.png`),
      })

      // A2: sem o rótulo da marca acima do título, em nenhuma página do aluno.
      for (const rota of ['/conta', '/pontos', '/busca', '/comunidades']) {
        await page.goto(rota)
        await expect(page.getByRole('main')).toBeVisible()
        await expect(
          page.getByRole('main').getByText('Helena Duarte', { exact: true }),
          rota,
        ).toHaveCount(0)
      }

      // A3: o botão principal do curso fica numa linha e o nome inteiro segue no nome acessível.
      await page.goto(`/cursos/c-${id}`)
      const botao = page.getByRole('main').getByRole('link', {
        name: /^Continuar: Uma aula com um título muito/,
      })
      await esperarReact(botao)
      await expect(botao).toContainText('Continuar:')
      expect((await botao.boundingBox())?.height ?? 999).toBeLessThanOrEqual(48)
      await expect(botao).toHaveAccessibleName(
        new RegExp(
          `conferir que o botão principal do curso continua numa linha só ${id}$`,
        ),
      )
      await page.screenshot({
        path: print(testInfo, `a3-curso-${tela.nome}-${modo}.png`),
      })

      // A5: Mural | Ranking: no escuro o segmento ativo é mais claro que o trilho.
      await page.goto('/comunidades')
      const abas = page.getByRole('navigation', {
        name: 'Seções da Comunidade',
      })
      await esperarReact(abas)
      const luminancias = await abas.evaluate((nav) => {
        // Pinta o trilho e, por cima, o indicador num pixel, para ler a cor que a pessoa vê.
        const ctx = document.createElement('canvas').getContext('2d', {
          willReadFrequently: true,
        }) as CanvasRenderingContext2D
        const lum = () => {
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
          return (r + g + b) / 3
        }
        const pintar = (css: string) => {
          ctx.fillStyle = css
          ctx.fillRect(0, 0, 1, 1)
        }
        pintar(getComputedStyle(nav).backgroundColor)
        const trilho = lum()
        const ind = nav.querySelector('[data-indicador]') as HTMLElement
        pintar(getComputedStyle(ind).backgroundColor)
        return { trilho, ativo: lum() }
      })
      if (modo === 'escuro') {
        expect(luminancias.ativo).toBeGreaterThan(luminancias.trilho)
      }
      await page.screenshot({
        path: print(testInfo, `a5-comunidade-${tela.nome}-${modo}.png`),
      })

      // A7: "Seus últimos pontos" não tem número animado (nada fica oculto para o leitor de tela).
      await page.goto('/comunidades?aba=ranking')
      await expect(page.getByTestId('ultimos-pontos')).toBeVisible()
      await expect(
        page.getByTestId('ultimos-pontos').locator('[aria-hidden="true"]'),
      ).toHaveCount(0)
    })
  }
}

test('a aula de vídeo limitada em altura alinha barra, título e módulo à borda do vídeo', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `final-aula-${id}@exemplo.test`
  cadastrarUsuario({ email })
  semear(testInfo.outputDir, id, email, `fala${id.replace(/\W/g, '')}`)
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrar(page, email)
  await page.goto(`/aulas/v2-${id}`)
  const titulo = page.getByRole('heading', { level: 1 })
  await esperarReact(titulo)
  const video = page.locator('iframe').first()
  await expect(video).toBeVisible()
  const quadro = (await video.locator('xpath=..').boundingBox()) as {
    x: number
    width: number
  }
  const x = async (l: ReturnType<Page['locator']>) =>
    (await l.boundingBox())?.x ?? -999
  expect(Math.abs((await x(titulo)) - quadro.x)).toBeLessThanOrEqual(2)
  const barra = page.getByRole('main').locator('div.h-12').first()
  expect(Math.abs((await x(barra)) - quadro.x)).toBeLessThanOrEqual(2)
  await page.waitForTimeout(500)
  await page.screenshot({ path: print(testInfo, 'a6-aula-desktop.png') })
})

test('trocar o filtro da busca não mostra o esqueleto da página: o conteúdo antigo fica apagado', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `final-filtro-${id}@exemplo.test`
  cadastrarUsuario({ email })
  semear(testInfo.outputDir, id, email, `fala${id.replace(/\W/g, '')}`)
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrar(page, email)
  await page.goto(`/busca?q=Zebra&filtro=todos`)
  const filtros = page.getByRole('navigation', { name: 'Filtros da busca' })
  await esperarReact(filtros)
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')

  // Devagar: toda chamada ao servidor demora 1,5 s (mais que os 300 ms do esqueleto).
  await page.route('**/_serverFn/**', async (rota) => {
    await new Promise((r) => setTimeout(r, 1500))
    await rota.continue()
  })
  await filtros.getByRole('link', { name: /^Aulas/ }).click()
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  await page.waitForTimeout(800)
  await expect(page.locator('[data-esqueleto]')).toHaveCount(0)
  await expect(page.getByRole('main')).toHaveAttribute('data-pendente', 'true')
  await page.screenshot({ path: print(testInfo, 'a9-busca-carregando.png') })
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false', {
    timeout: 10_000,
  })
  await expect(page).toHaveURL(/filtro=aulas/)
})

test('busca ⌘K: fala sem o texto da transcrição, subtítulo curto, estrela da favorita e "ver como aluno"', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000)
  const id = unico()
  const email = `final-busca-${id}@exemplo.test`
  const emailEquipe = `final-busca-eq-${id}@exemplo.test`
  const fala = `hidratacao${id.replace(/\W/g, '')}`
  cadastrarUsuario({ email })
  cadastrarUsuario({ email: emailEquipe, perfil: 'equipe' })
  semear(testInfo.outputDir, id, email, fala)
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrar(page, email)
  await abrirBuscaRapida(page)
  const caixa = page.getByRole('combobox', { name: 'Buscar nos seus cursos' })

  // A12: a linha de "Falado no vídeo" mostra "Módulo · Curso" e o minuto, sem o texto da fala.
  await caixa.fill(fala)
  const falado = page.getByRole('group', { name: 'Falado no vídeo' })
  await expect(falado.getByRole('option')).toHaveCount(1)
  await expect(falado.getByRole('option')).toContainText(
    `Módulo final ${id} · Curso final ${id}`,
  )
  await expect(falado.getByRole('option')).not.toContainText('no comprimento')
  await expect(falado.getByRole('option')).toContainText('aos 1:35')
  await page.screenshot({ path: print(testInfo, 'a12-busca-fala-desktop.png') })

  // A12: nas aulas o subtítulo é "Módulo · Curso", curto. C16: a favorita traz a estrela.
  await caixa.fill('Zebra')
  const aulas = page.getByRole('group', { name: 'Aulas' })
  const livre = aulas.getByRole('option', { name: /Zebra livre/ })
  await expect(livre).toContainText(`Módulo final ${id} · Curso final ${id}`)
  await expect(livre.getByRole('img', { name: 'salva' })).toBeVisible()
  await expect(
    aulas.getByRole('option', { name: /Zebra trancada/ }).getByRole('img', {
      name: 'salva',
    }),
  ).toHaveCount(0)
  await page.screenshot({
    path: print(testInfo, 'c16-busca-favorita-desktop.png'),
  })

  // C18: a equipe vendo como a turma: a aula trancada para a turma aparece com cadeado na ⌘K.
  const contexto = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const eq = await contexto.newPage()
  await entrar(eq, emailEquipe)
  await abrirBuscaRapida(eq, `/cursos/c-${id}`)
  await eq
    .getByRole('combobox', { name: 'Buscar nos seus cursos' })
    .fill(`Zebra trancada ${id}`)
  const semComo = eq.getByRole('option', { name: /Zebra trancada/ })
  await expect(semComo).toBeVisible()
  await expect(semComo).not.toHaveAttribute('aria-disabled', 'true')
  await abrirBuscaRapida(eq, `/cursos/c-${id}?como=t-${id}`)
  await eq
    .getByRole('combobox', { name: 'Buscar nos seus cursos' })
    .fill(`Zebra trancada ${id}`)
  await expect(
    eq.getByRole('option', { name: /Zebra trancada/ }),
  ).toHaveAttribute('aria-disabled', 'true')
  // Na página de busca também.
  await eq.goto(`/busca?q=Zebra+trancada+${id}&filtro=todos&como=t-${id}`)
  await expect(
    eq.getByRole('main').getByRole('listitem').filter({ hasText: id }),
  ).toContainText('Conteúdo bloqueado')
  await contexto.close()
})

test('certificado: o curso copia o link de validação e, no celular, as duas folhas sobem de baixo', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const id = unico()
  const email = `final-cert-${id}@exemplo.test`
  cadastrarUsuario({ email, nome: 'Aluna Certificada' })
  const userId = idDoUsuario(email)
  const agora = Date.now()
  const codigo = `Z${Math.random().toString(36).slice(2, 5).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')}`
  sql(testInfo.outputDir, `cert-${id}.sql`, [
    `UPDATE user SET nome_no_certificado = 'Aluna Certificada Souza', nome_confirmado_em = ${agora} WHERE id = '${userId}'`,
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso certificado ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a-${id}', 'm-${id}', 'Aula ${id}', '<p>x</p>', 1)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${agora - 86_400_000})`,
    `INSERT INTO progresso_da_aula (id, user_id, aula_id, aberta_em, concluida_em) VALUES ('p-${id}', '${userId}', 'a-${id}', ${agora}, ${agora})`,
    `INSERT INTO modelo_de_certificado (id, curso_id, ativo, frente, campos) VALUES ('mc-${id}', 'c-${id}', 1, 'imagens/inexistente-${id}.png', '[]')`,
    `INSERT INTO certificado (id, user_id, curso_id, codigo, nome, curso_nome, concluido_em, emitido_em, pdf_estado, pdf_chave) VALUES ('ce-${id}', '${userId}', 'c-${id}', '${codigo}', 'Aluna Certificada Souza', 'Curso certificado ${id}', ${agora}, ${agora}, 'pronto', 'certificados/${id}.pdf')`,
  ])
  await page.setViewportSize({ width: 390, height: 844 })
  // A frente do modelo é uma imagem do R2; aqui uma folha creme com moldura, para a prévia aparecer.
  await page.route('**/api/imagens/**', (rota) =>
    rota.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1123 794"><rect width="1123" height="794" fill="#faf6ec"/><rect x="30" y="30" width="1063" height="734" fill="none" stroke="#96784a" stroke-width="6"/></svg>',
    }),
  )
  await entrar(page, email)

  // Página do curso (#97): a folha tem "Copiar link de validação" ao lado de "Baixar PDF".
  await page.goto(`/cursos/c-${id}`)
  const previa = page
    .getByRole('region', { name: 'Certificado' })
    .getByRole('button')
    .first()
  await esperarReact(previa)
  await expect(async () => {
    await previa.click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1500 })
  }).toPass()
  const folha = page.getByRole('dialog')
  await expect(
    folha.getByRole('button', { name: /Copiar link de validação/ }),
  ).toBeVisible()
  // Espera a folha parar de subir (o Drawer anima) antes de medir e tirar o print.
  await expect(async () => {
    const y1 = (await folha.boundingBox())?.y
    await page.waitForTimeout(300)
    expect((await folha.boundingBox())?.y).toBe(y1)
  }).toPass()
  await expect(
    folha.getByRole('button', { name: /Copiar link de validação/ }),
  ).toBeInViewport()
  const caixaDoCurso = (await folha.boundingBox()) as {
    y: number
    height: number
  }
  expect(
    Math.round(caixaDoCurso.y + caixaDoCurso.height),
  ).toBeGreaterThanOrEqual(840)
  await page.screenshot({
    path: print(testInfo, 'a10-folha-do-curso-celular.png'),
  })
  await page.keyboard.press('Escape')

  // Página de certificados (#98): no celular o certificado grande também é folha de baixo para cima.
  await page.goto('/certificados')
  const gatilho = page.getByRole('button', { name: /Abrir em tamanho grande/ })
  await esperarReact(gatilho)
  await expect(async () => {
    await gatilho.click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1500 })
  }).toPass()
  const folhaGrande = page.getByRole('dialog')
  await expect(async () => {
    const y1 = (await folhaGrande.boundingBox())?.y
    await page.waitForTimeout(300)
    expect((await folhaGrande.boundingBox())?.y).toBe(y1)
  }).toPass()
  const caixa = (await page.getByRole('dialog').boundingBox()) as {
    y: number
    height: number
  }
  expect(Math.round(caixa.y + caixa.height)).toBeGreaterThanOrEqual(840)
  expect(caixa.y).toBeGreaterThan(40)
  await page.screenshot({
    path: print(testInfo, 'a11-folha-de-certificados-celular.png'),
  })
})

test('fio de atendimento: conversa é um log com aviso educado, e cada mensagem diz quem e quando', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `final-fio-${id}@exemplo.test`
  cadastrarUsuario({ email, nome: 'Aluna do Fio' })
  await page.setViewportSize({ width: 390, height: 844 })
  await entrar(page, email)
  await page.goto('/atendimento')
  const campo = page.getByLabel('Mensagem')
  await esperarReact(campo)
  await campo.fill(`Preciso de ajuda ${id}`)
  await campo.press('Control+Enter')
  const fio = page.getByRole('log', { name: 'Conversa com a equipe' })
  await expect(fio).toHaveAttribute('aria-live', 'polite')
  await expect(fio.getByText(`Preciso de ajuda ${id}`)).toBeVisible()
  await expect(
    fio.locator('.sr-only').filter({ hasText: /^Você, .+:$/ }),
  ).toHaveCount(1)
  await expect(fio.getByText('Enviada')).toBeVisible()
  await page.screenshot({ path: print(testInfo, 'c17-fio-celular.png') })
})
