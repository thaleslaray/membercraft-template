import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Telas vazias e esqueletos (#107): o mesmo componente com ilustração e ação em toda tela vazia do aluno;
// esqueletos parados, com aria-busy, só em carregamento lento e sem salto quando o conteúdo chega.
// Prints: `PRINTS_DIR` (pasta de prints da fatia) ou a pasta de saída do teste.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIdDe = (email: string) => `e2e-${email.replace(/\W/g, '-')}`

test.use({ bypassCSP: true })

function pastaDosPrints(testInfo: TestInfo) {
  const pasta = process.env.PRINTS_DIR ?? testInfo.outputPath('prints')
  mkdirSync(pasta, { recursive: true })
  return pasta
}

function sql(comando: string) {
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', comando],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha no SQL: ${r.stderr}`)
}

function semearCurso(id: string, email: string) {
  const aulas = [1, 2, 3]
    .map(
      (n) =>
        `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a${n}-${id}', 'm1-${id}', 'Aula ${n} ${id}', '<p>Texto</p>', ${n})`,
    )
    .join('; ')
  sql(
    [
      `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
      `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m1-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
      aulas,
      `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
      `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userIdDe(email)}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
    ].join('; '),
  )
}

async function axe(
  page: Page,
  onde: string,
  menuAberto = false,
  desligar: string[] = [],
) {
  const { AxeBuilder } = await import('@axe-core/playwright')
  const construtor = new AxeBuilder({ page })
  const regras = [...desligar, ...(menuAberto ? ['region'] : [])]
  if (regras.length > 0) construtor.disableRules(regras)
  const r = await construtor.analyze()
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    `axe em ${onde}`,
  ).toEqual([])
}

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]
const MODOS = ['claro', 'escuro'] as const

async function prepararPagina(
  page: Page,
  tela: (typeof TELAS)[number],
  modo: (typeof MODOS)[number],
) {
  await page.setViewportSize(tela.viewport)
  await page.addInitScript((m) => {
    localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
  }, modo)
}

const vazio = (page: Page, ilustracao: string) =>
  page.locator(`[data-slot="empty"][data-ilustracao="${ilustracao}"]`)

async function irPara(page: Page, url: string) {
  await page.goto(url)
  await esperarReact(page.getByRole('button', { name: 'Abrir menu da conta' }))
}

// ---------- Telas vazias ----------

for (const tela of TELAS) {
  for (const modo of MODOS) {
    test(`telas vazias: ${tela.nome} ${modo}`, async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const pasta = pastaDosPrints(testInfo)
      await prepararPagina(page, tela, modo)
      const id = unico()
      const email = `vazias-${id}@exemplo.test`
      cadastrarUsuario({ email })
      await entrarPorCodigo(page, email)
      const foto = async (nome: string) => {
        await page.waitForTimeout(400)
        await page.screenshot({
          path: path.join(pasta, `vazio-${nome}-${tela.nome}-${modo}.png`),
        })
      }

      // Meus cursos sem curso: cabide e "Falar com a equipe".
      await irPara(page, '/')
      await expect(vazio(page, 'cabide')).toBeVisible()
      await expect(page.getByText('Seus cursos aparecem aqui')).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Falar com a equipe' }),
      ).toHaveAttribute('href', '/atendimento')
      await foto('meus-cursos')
      await axe(page, `meus cursos ${tela.nome} ${modo}`)

      // Aulas salvas vazias: tecido e "Ver meus cursos".
      await irPara(page, '/favoritos')
      await expect(vazio(page, 'tecido')).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Ver meus cursos' }),
      ).toHaveAttribute('href', '/')
      await foto('favoritos')
      await axe(page, `favoritos ${tela.nome} ${modo}`)

      // Certificados e pontos vazios: fita métrica e "Continuar estudando" (sem aula, vai a Meus cursos).
      await irPara(page, '/certificados')
      await expect(vazio(page, 'fita')).toBeVisible()
      await expect(
        page.getByText('Você ainda não tem certificados'),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Continuar estudando' }),
      ).toHaveAttribute('href', '/')
      await foto('certificados')
      await axe(page, `certificados ${tela.nome} ${modo}`)

      await irPara(page, '/pontos')
      await expect(vazio(page, 'fita')).toBeVisible()
      await foto('pontos')
      await axe(page, `pontos ${tela.nome} ${modo}`)

      // Ranking da Comunidade vazio: o ranking de um curso em que ninguém pontuou (curso semeado só
      // para isso, depois de conferir o vazio de Meus cursos).
      semearCurso(id, email)
      await irPara(page, `/comunidades?aba=ranking&curso=c-${id}`)
      await expect(vazio(page, 'fita')).toContainText('Ninguém pontuou ainda')
      await foto('ranking')
      await axe(page, `ranking ${tela.nome} ${modo}`)

      // Busca sem resultado: cartela e "Limpar a busca".
      await irPara(page, `/busca?q=zzz${id}`)
      await expect(vazio(page, 'cartela')).toBeVisible()
      await expect(page.getByText('Nada encontrado')).toBeVisible()
      await foto('busca')
      await axe(page, `busca ${tela.nome} ${modo}`)
      await page.getByRole('link', { name: 'Limpar a busca' }).click()
      await expect(page).toHaveURL(/\/busca\?q=&filtro=todos/)

      // Mural filtrado sem resultado: linha e agulha e "Limpar filtros".
      await irPara(page, '/comunidades?status=resolvidas&q=zzz')
      await expect(vazio(page, 'agulha')).toBeVisible()
      await expect(
        page.getByText('Nenhuma conversa com esses filtros'),
      ).toBeVisible()
      await expect(
        page.getByText('Tente outra palavra ou limpe os filtros.'),
      ).toBeVisible()
      await foto('comunidade')
      await axe(page, `comunidade ${tela.nome} ${modo}`)
      await page.getByRole('button', { name: 'Limpar filtros' }).click()
      await expect(page).toHaveURL(/\/comunidades\/?$/)

      // Atendimento sem mensagens: carretel e nenhum botão (o campo de mensagem é a ação).
      await irPara(page, '/atendimento')
      await expect(vazio(page, 'carretel')).toBeVisible()
      await expect(vazio(page, 'carretel').getByRole('button')).toHaveCount(0)
      await foto('atendimento')
      await axe(page, `atendimento ${tela.nome} ${modo}`)

      // Sininho sem avisos: carretel.
      await irPara(page, '/')
      const sininho = page.getByRole('button', { name: /^Avisos:/ })
      await esperarReact(sininho)
      await expect(async () => {
        await sininho.click()
        await expect(page.getByText('Nenhum aviso por enquanto')).toBeVisible({
          timeout: 1000,
        })
      }).toPass()
      await expect(vazio(page, 'carretel')).toBeVisible()
      await foto('sininho')
      await axe(page, `sininho ${tela.nome} ${modo}`, true)
      await page.keyboard.press('Escape')

      // Busca rápida sem resultado: cartela e "Limpar a busca" que devolve o foco ao campo.
      await irPara(page, '/')
      await page.keyboard.press('Control+k')
      const campo = page.getByRole('combobox', {
        name: 'Buscar nos seus cursos',
      })
      await expect(campo).toBeVisible()
      await campo.fill(`zzz${id}`)
      await expect(page.getByText('Nada encontrado para')).toBeVisible()
      await expect(vazio(page, 'cartela')).toBeVisible()
      await foto('busca-rapida')
      await axe(page, `busca rápida ${tela.nome} ${modo}`, true)
      await page.getByRole('button', { name: 'Limpar a busca' }).click()
      await expect(campo).toHaveValue('')
      await expect(campo).toBeFocused()
    })
  }
}

test('"Continuar estudando" leva à próxima aula quando há uma', async ({
  page,
}) => {
  const id = unico()
  const email = `continuar-${id}@exemplo.test`
  cadastrarUsuario({ email })
  semearCurso(id, email)
  await entrarPorCodigo(page, email)
  await irPara(page, '/certificados')
  await expect(vazio(page, 'fita')).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Continuar estudando' }),
  ).toHaveAttribute('href', `/aulas/a1-${id}`)
})

test('sem comunidade: o vazio diz que a equipe ainda não liberou', async ({
  page,
}) => {
  const email = `sem-comunidade-${unico()}@exemplo.test`
  cadastrarUsuario({ email })
  await entrarPorCodigo(page, email)
  await irPara(page, '/comunidades')
  const sem = vazio(page, 'agulha').filter({
    hasText: 'Você ainda não participa de nenhuma comunidade',
  })
  // O banco local é reaproveitado: se já houver comunidade visível, não há este caso a conferir.
  test.skip((await sem.count()) === 0, 'o D1 local já tem comunidades')
  await expect(sem).toContainText(
    'Quando a equipe liberar uma comunidade para você',
  )
})

test('mural vazio: "Pergunte ou compartilhe algo" abre o compositor', async ({
  page,
}) => {
  const id = unico()
  const email = `mural-vazio-${id}@exemplo.test`
  cadastrarUsuario({ email })
  semearCurso(id, email)
  sql(
    `INSERT INTO comunidade (id, nome, icone, cor, so_equipe_publica) VALUES ('g-${id}', 'Geral ${id}', 'livro', '#2563eb', 0)`,
  )
  try {
    await entrarPorCodigo(page, email)
    await irPara(page, '/comunidades')
    const sem = vazio(page, 'agulha').filter({
      hasText: 'Ainda não há publicações',
    })
    // O banco local é reaproveitado: se sobrou publicação de outro teste, não há mural vazio a conferir.
    test.skip((await sem.count()) === 0, 'o D1 local já tem publicações')
    await expect(sem).toContainText(
      'Seja a primeira a perguntar ou compartilhar algo.',
    )
    await sem
      .getByRole('button', { name: 'Pergunte ou compartilhe algo' })
      .click()
    await expect(page.locator('#formulario-do-mural')).toBeVisible()
    await expect(page.getByRole('textbox').first()).toBeFocused()
  } finally {
    sql(`DELETE FROM comunidade WHERE id = 'g-${id}'`)
  }
})

// ---------- Esqueletos ----------

const ROTAS_COM_ESQUELETO = (id: string) => [
  { nome: 'meus-cursos', url: '/' },
  { nome: 'favoritos', url: '/favoritos' },
  { nome: 'certificados', url: '/certificados' },
  { nome: 'pontos', url: '/pontos' },
  { nome: 'ranking', url: '/comunidades?aba=ranking' },
  { nome: 'busca', url: '/busca?q=Aula&filtro=todos' },
  { nome: 'atendimento', url: '/atendimento' },
  { nome: 'comunidade', url: '/comunidades' },
  { nome: 'nova-publicacao', url: '/comunidades/nova' },
  { nome: 'publicacao', url: `/comunidades/publicacoes/p-${id}` },
  { nome: 'curso', url: `/cursos/c-${id}` },
  { nome: 'conta', url: '/conta' },
]

async function caixa(locator: Locator) {
  const c = await locator.boundingBox()
  if (!c) throw new Error('sem caixa')
  return c
}

for (const combinacao of [
  { tela: TELAS[0], modo: 'claro' as const },
  { tela: TELAS[1], modo: 'escuro' as const },
]) {
  test(`esqueletos: ${combinacao.tela.nome} ${combinacao.modo}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000)
    const pasta = pastaDosPrints(testInfo)
    await prepararPagina(page, combinacao.tela, combinacao.modo)
    const id = unico()
    const email = `esqueleto-${id}@exemplo.test`
    cadastrarUsuario({ email })
    semearCurso(id, email)
    sql(
      `INSERT INTO comunidade (id, nome, icone, cor, so_equipe_publica) VALUES ('g-${id}', 'Geral ${id}', 'livro', '#2563eb', 0)`,
    )
    sql(
      `INSERT INTO publicacao (id, comunidade_id, autor_id, titulo, texto_html, chave_de_envio, ultima_atividade_em, created_at) VALUES ('p-${id}', 'g-${id}', '${userIdDe(email)}', 'Pergunta ${id}', '<p>Texto</p>', 'k-${id}', ${Date.now()}, ${Date.now()})`,
    )
    try {
      await entrarPorCodigo(page, email)
      for (const rota of ROTAS_COM_ESQUELETO(id)) {
        // Parte de outra tela, para a troca ser feita pelo roteador (no navegador, sem recarregar).
        const origem = rota.url === '/' ? '/favoritos' : '/'
        await irPara(page, origem)
        await page.waitForTimeout(300)
        let liberar: () => void = () => {}
        const portao = new Promise<void>((resolve) => {
          liberar = resolve
        })
        await page.route('**/_serverFn/**', async (r) => {
          await portao
          await r.continue()
        })
        await page.evaluate(
          (href) =>
            // biome-ignore lint/suspicious/noExplicitAny: o roteador se expõe em `self.__TSR_ROUTER__`
            void (self as any).__TSR_ROUTER__.navigate({ href }),
          rota.url,
        )

        // Devagar: o esqueleto aparece, ocupado, no lugar da página.
        const esqueleto = page.locator('main[data-esqueleto]')
        await expect(esqueleto, `esqueleto de ${rota.nome}`).toBeVisible({
          timeout: 5000,
        })
        await expect(esqueleto).toHaveAttribute('aria-busy', 'true')
        await page.waitForTimeout(500)
        await page.screenshot({
          path: path.join(
            pasta,
            `esqueleto-${rota.nome}-${combinacao.tela.nome}-${combinacao.modo}.png`,
          ),
        })
        const h1Antes = (await esqueleto.locator('h1').count())
          ? await caixa(esqueleto.locator('h1').first())
          : null
        const mainAntes = await caixa(esqueleto)

        // Chegou: o título e a coluna não saltam.
        liberar()
        await page.unroute('**/_serverFn/**')
        const pronto = page.locator('main:not([data-esqueleto])')
        await expect(pronto, `página de ${rota.nome}`).toBeVisible({
          timeout: 15_000,
        })
        await expect(page.locator('main[data-esqueleto]')).toHaveCount(0)
        await page.waitForTimeout(500)
        const mainDepois = await caixa(pronto)
        expect(
          Math.abs(mainDepois.x - mainAntes.x),
          `${rota.nome}: margem esquerda`,
        ).toBeLessThanOrEqual(1)
        expect(
          Math.abs(mainDepois.width - mainAntes.width),
          `${rota.nome}: largura`,
        ).toBeLessThanOrEqual(1)
        if (h1Antes) {
          const h1Depois = await caixa(pronto.locator('h1').first())
          expect(
            Math.abs(h1Depois.y - h1Antes.y),
            `${rota.nome}: posição do título`,
          ).toBeLessThanOrEqual(1)
          expect(
            Math.abs(h1Depois.x - h1Antes.x),
            `${rota.nome}: x do título`,
          ).toBeLessThanOrEqual(1)
        }
      }
    } finally {
      sql(
        `DELETE FROM publicacao WHERE comunidade_id = 'g-${id}'; DELETE FROM comunidade WHERE id = 'g-${id}'`,
      )
    }
  })
}

test('carregamento rápido não mostra esqueleto', async ({ page }) => {
  const id = unico()
  const email = `rapido-${id}@exemplo.test`
  cadastrarUsuario({ email })
  await entrarPorCodigo(page, email)
  await irPara(page, '/')
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: marcador de teste no window
    const w = window as any
    w.__viuEsqueleto = false
    new MutationObserver(() => {
      if (document.querySelector('main[data-esqueleto]'))
        w.__viuEsqueleto = true
    }).observe(document.body, { childList: true, subtree: true })
    w.__TSR_ROUTER__.navigate({ href: '/favoritos' })
  })
  await expect(page.getByRole('heading', { name: 'Favoritos' })).toBeVisible()
  await page.waitForTimeout(600)
  expect(
    await page.evaluate(
      () =>
        // biome-ignore lint/suspicious/noExplicitAny: marcador de teste no window
        (window as any).__viuEsqueleto,
    ),
  ).toBe(false)
})
