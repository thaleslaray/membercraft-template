import { expect, test } from '@playwright/test'
import {
  cadastrarUsuario,
  entrarPorCodigo,
  envelhecerSessaoDe,
  esperarNoLog,
  lerSessaoNoBanco,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('aluno cadastrado entra com o código e chega ao Início', async ({
  page,
}) => {
  const email = `aluno-${unico()}@exemplo.test`
  cadastrarUsuario({ email })
  await entrarPorCodigo(page, email)
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('heading', { name: 'Meus cursos', level: 1 }),
  ).toBeVisible()
})

test('e-mail desconhecido vê o contato do suporte e não recebe código', async ({
  page,
}) => {
  const email = `ninguem-${unico()}@exemplo.test`
  await page.goto('/login')
  const campo = page.getByPlaceholder('voce@exemplo.com')
  await campo.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const check = () =>
          Object.keys(el).some((key) => key.startsWith('__reactProps'))
            ? resolve()
            : setTimeout(check, 100)
        check()
      }),
    undefined,
    { timeout: 45_000 },
  )
  await campo.fill(email)
  await page.getByRole('button', { name: 'Continuar com e-mail' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Não encontramos um acesso com esse e-mail',
  )
  await expect(page.getByRole('alert')).toContainText('@')
  await expect(page.getByPlaceholder('000000')).toHaveCount(0)
  await expect(
    esperarNoLog(
      new RegExp(`código de login para ${email.replace('.', '\\.')}`),
      1500,
    ),
  ).rejects.toThrow()
})

test('primeiro acesso: o aluno informa o nome e aceita os Termos', async ({
  page,
}) => {
  const email = `novo-${unico()}@exemplo.test`
  cadastrarUsuario({ email, nome: '', termosAceitos: false })
  await entrarPorCodigo(page, email)
  await expect(page).toHaveURL(/\/primeiro-acesso/)

  const continuar = page.getByRole('button', { name: 'Continuar' })
  await expect(continuar).toBeDisabled()
  // O preenchimento só vale depois da hidratação; repete até o React assumir os campos.
  await expect(async () => {
    await page.getByLabel('Seu nome').fill('Maria Souza')
    const caixa = page.getByRole('checkbox')
    if ((await caixa.getAttribute('data-state')) !== 'checked') {
      await caixa.click()
    }
    await expect(continuar).toBeEnabled({ timeout: 1000 })
  }).toPass()
  await continuar.click()

  await expect(page).toHaveURL(/\/$/)
  const r = await page.request.get('/api/auth/get-session')
  const { user } = await r.json()
  expect(user.name).toBe('Maria Souza')
  expect(user.termosVersao).toBeTruthy()
})

test('não existe login com senha', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('Prefere entrar com senha?')).toHaveCount(0)
  const response = await page.request.post('/api/auth/sign-in/email', {
    data: { email: 'a@exemplo.test', password: 'senha-qualquer-123' },
    headers: { origin: new URL(page.url()).origin },
  })
  expect(response.ok()).toBe(false)
})

async function diasDaSessao(page: import('@playwright/test').Page) {
  const r = await page.request.get('/api/auth/get-session')
  const { session } = await r.json()
  return Math.round(
    (Date.parse(session.expiresAt) - Date.parse(session.createdAt)) /
      86_400_000,
  )
}

test('a sessão do aluno dura 30 dias e a da Equipe 7', async ({
  page,
  browser,
}) => {
  const aluno = `sessao-${unico()}@exemplo.test`
  cadastrarUsuario({ email: aluno })
  await entrarPorCodigo(page, aluno)
  expect(await diasDaSessao(page)).toBe(30)

  const equipe = `equipe-${unico()}@exemplo.test`
  cadastrarUsuario({ email: equipe, perfil: 'equipe' })
  const outro = await browser.newPage()
  await entrarPorCodigo(outro, equipe)
  expect(await diasDaSessao(outro)).toBe(7)
  await outro.close()
})

test('a sessão da Equipe só é regravada depois de 1 dia de uso, e volta a 7 dias', async ({
  page,
}) => {
  const equipe = `renova-${unico()}@exemplo.test`
  cadastrarUsuario({ email: equipe, perfil: 'equipe' })
  await entrarPorCodigo(page, equipe)
  const nova = lerSessaoNoBanco(equipe)

  // Sessão recém-criada: ler o painel (permissão no banco) não regrava a sessão.
  await page.goto('/painel/equipe')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(lerSessaoNoBanco(equipe)).toEqual(nova)

  // Com 2 dias de uso, a leitura renova: a validade volta a ~7 dias a partir de agora (nunca 30).
  envelhecerSessaoDe(equipe, 2)
  const velha = lerSessaoNoBanco(equipe)
  await page.goto('/painel/equipe')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const renovada = lerSessaoNoBanco(equipe)
  expect(renovada.atualizada).toBeGreaterThan(velha.atualizada)
  const dias = (renovada.expira - Date.now()) / 86_400_000
  expect(dias).toBeGreaterThan(6.9)
  expect(dias).toBeLessThanOrEqual(7)
})

test('o aluno fica logado em dois aparelhos e sair encerra só o atual', async ({
  browser,
}) => {
  const email = `aparelhos-${unico()}@exemplo.test`
  cadastrarUsuario({ email })
  const celular = await browser.newContext()
  const computador = await browser.newContext()
  const a = await celular.newPage()
  const b = await computador.newPage()
  await entrarPorCodigo(a, email)
  await entrarPorCodigo(b, email)

  const sair = await a.request.post('/api/auth/sign-out', {
    data: {},
    headers: { origin: new URL(a.url()).origin },
  })
  expect(sair.ok()).toBe(true)

  expect((await a.request.get('/api/auth/get-session')).status()).toBe(200)
  expect(await (await a.request.get('/api/auth/get-session')).json()).toBeNull()
  const restante = await (await b.request.get('/api/auth/get-session')).json()
  expect(restante?.user.email).toBe(email)
  await celular.close()
  await computador.close()
})
