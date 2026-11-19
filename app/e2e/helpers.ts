import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Locator, type Page } from '@playwright/test'
import { appConfig } from '#/config/app'

const here = path.dirname(fileURLToPath(import.meta.url))
export const logPath = path.resolve(here, '.dev.log')

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Espera uma linha (regex) aparecer em e2e/.dev.log, que é o terminal do `vite dev`. */
export async function esperarNoLog(
  pattern: RegExp,
  timeoutMs = 15_000,
): Promise<RegExpExecArray> {
  if (!fs.existsSync(logPath)) {
    throw new Error(
      'e2e/.dev.log não existe: o Playwright precisa subir o `vite dev` (webServer com reuseExistingServer: false).',
    )
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const match = pattern.exec(fs.readFileSync(logPath, 'utf8'))
    if (match) return match
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`${pattern} não apareceu em e2e/.dev.log em ${timeoutMs} ms.`)
}

// Sem provedor de e-mail, o `vite dev` imprime o código no terminal.
export async function lerCodigoDeLogin(email: string): Promise<string> {
  const padrao = new RegExp(
    `\\[auth\\] código de login para ${escapeRegExp(email)}: (\\d{6})`,
    'g',
  )
  await esperarNoLog(new RegExp(padrao.source))
  // Vale o último código impresso: o mesmo e-mail pode entrar mais de uma vez.
  const todos = [...fs.readFileSync(logPath, 'utf8').matchAll(padrao)]
  return todos[todos.length - 1][1]
}

/** Valor de uma chave do .dev.vars (valores fictícios da POC). */
export function lerDevVar(nome: string): string {
  const arquivo = path.resolve(here, '..', '.dev.vars')
  const linha = fs
    .readFileSync(arquivo, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${nome}=`))
  if (!linha) throw new Error(`${nome} não está no .dev.vars`)
  return linha.slice(nome.length + 1).trim()
}

/**
 * Cadastra um usuário no D1 local (o login só aceita e-mail cadastrado; quem cadastra, no app,
 * é a matrícula). Por padrão já com nome e com a versão vigente dos Termos aceita, ou seja,
 * sem primeiro acesso pendente.
 */
export function cadastrarUsuario(opcoes: {
  email: string
  perfil?: 'aluno' | 'equipe' | 'proprietario'
  nome?: string
  termosAceitos?: boolean
  /** Por padrão o tour de primeiro acesso já foi visto (não cobre a tela dos outros testes). */
  tourVisto?: boolean
}) {
  const { email, perfil = 'aluno', nome = 'Pessoa de Teste' } = opcoes
  const termos =
    opcoes.termosAceitos === false ? 'NULL' : `'${appConfig.termos.versao}'`
  const tour = opcoes.tourVisto === false ? 'NULL' : '1000'
  const id = `e2e-${email.replace(/\W/g, '-')}`
  const sql = `INSERT OR REPLACE INTO user (id, name, email, email_verified, perfil, termos_versao, tour_visto_em) VALUES ('${id}', '${nome}', '${email}', 1, '${perfil}', ${termos}, ${tour})`
  // O D1 local é um arquivo SQLite que o servidor de desenvolvimento também escreve: se estiver
  // ocupado ("database is locked"), tenta de novo em vez de derrubar o teste.
  let result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(here, '..'), encoding: 'utf8' },
  )
  for (let t = 0; t < 4 && result.status !== 0; t++) {
    if (!/SQLITE_BUSY|database is locked/.test(result.stderr)) break
    spawnSync('sleep', ['1'])
    result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
      { cwd: path.resolve(here, '..'), encoding: 'utf8' },
    )
  }
  if (result.status !== 0) {
    throw new Error(`Falha ao cadastrar ${email}: ${result.stderr}`)
  }
}

/** Faz o login completo pela tela: e-mail, código lido do log, sai de /login. */
let proximoIp = 1

/**
 * O template limita 5 chamadas de login por minuto por IP (PUBLIC_RATE_LIMIT). Vários logins em
 * sequência no e2e estourariam o limite, então cada login usa um IP próprio, só nas chamadas de
 * autenticação do próprio app.
 */
async function ipProprioNasChamadasDeAuth(page: Page) {
  const ip = `203.0.113.${proximoIp++ % 250}`
  const comIp = (route: import('@playwright/test').Route) =>
    route.continue({
      headers: { ...route.request().headers(), 'cf-connecting-ip': ip },
    })
  await page.route('**/api/auth/**', comIp)
  // O pedido de código passa por uma server function.
  await page.route('**/_serverFn/**', comIp)
}

export async function entrarPorCodigo(page: Page, email: string) {
  await ipProprioNasChamadasDeAuth(page)
  await page.goto('/login')
  const emailInput = page.getByPlaceholder('voce@exemplo.com')
  const continuar = page.getByRole('button', { name: 'Continuar com e-mail' })

  // O SSR entrega o HTML antes da hidratação: um fill feito cedo demais some quando o
  // React assume o campo. Esperamos o React anexar as props.
  await emailInput.waitFor()
  await emailInput.evaluate(
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
  await emailInput.fill(email)
  await expect(continuar).toBeEnabled()
  await continuar.click()

  const codeInput = page.getByPlaceholder('000000')
  await expect(codeInput).toBeVisible()
  await codeInput.fill(await lerCodigoDeLogin(email))
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

/**
 * O SSR entrega o HTML antes da hidratação: um fill ou click cedo demais some quando o React
 * assume o elemento. Espera o React anexar as props ao elemento.
 */
export async function esperarReact(locator: Locator) {
  await locator.waitFor()
  await locator.evaluate(
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
}

/** Apaga a aparência configurada no D1 local, para o tema padrão voltar. */
export function limparAparencia() {
  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'escola',
      '--local',
      '--command',
      'DELETE FROM aparencia',
    ],
    { cwd: path.resolve(here, '..'), encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`Falha ao limpar a aparência: ${result.stderr}`)
  }
}

/** Roda um SQL no D1 local e devolve a saída JSON do wrangler (para ler e mexer na sessão nos testes). */
function sqlNoD1Local(sql: string) {
  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'escola',
      '--local',
      '--json',
      '--command',
      sql,
    ],
    { cwd: path.resolve(here, '..'), encoding: 'utf8' },
  )
  if (result.status !== 0) throw new Error(`Falha no SQL: ${result.stderr}`)
  return JSON.parse(result.stdout) as { results: Record<string, number>[] }[]
}

/** Tira do D1 local as ligações da Hotmart de um produto, para o teste partir de "produto sem ligação". */
export function limparLigacoesDaHotmart(produtoId: string) {
  sqlNoD1Local(
    `DELETE FROM ligacao_de_venda WHERE gateway = 'hotmart' AND produto_id = '${produtoId}'`,
  )
}

/** Validade (ms) e última gravação (ms) da sessão da pessoa, lidas direto do D1 local. */
export function lerSessaoNoBanco(email: string) {
  const [{ results }] = sqlNoD1Local(
    `SELECT s.expires_at AS expira, s.updated_at AS atualizada FROM session s JOIN user u ON u.id = s.user_id WHERE u.email = '${email}' ORDER BY s.created_at DESC LIMIT 1`,
  )
  return { expira: results[0].expira, atualizada: results[0].atualizada }
}

/** Faz a sessão parecer mais velha: vence e foi gravada `dias` dias antes (a regra de renovação lê isso). */
export function envelhecerSessaoDe(email: string, dias: number) {
  const ms = dias * 86_400_000
  sqlNoD1Local(
    `UPDATE session SET expires_at = expires_at - ${ms}, updated_at = updated_at - ${ms} WHERE user_id = (SELECT id FROM user WHERE email = '${email}')`,
  )
}

/** Faz a matrícula do aluno vencer no D1 local (a expiração só aceita data futura pela tela). */
export function vencerMatriculasDe(email: string) {
  const sql = `UPDATE matricula SET expira_em = 1000 WHERE user_id = (SELECT id FROM user WHERE email = '${email}')`
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(here, '..'), encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`Falha ao vencer a matrícula de ${email}: ${result.stderr}`)
  }
}

/** Apaga os banners do D1 local, para a vitrine do teste mostrar só os dele. */
export function limparBanners() {
  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'escola',
      '--local',
      '--command',
      'DELETE FROM banner_curso; DELETE FROM banner',
    ],
    { cwd: path.resolve(here, '..'), encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`Falha ao limpar os banners: ${result.stderr}`)
  }
}

/** Volta a configuração da área (Termos, privacidade, suporte) ao padrão no D1 local. */
export function limparConfiguracaoDaArea() {
  const result = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'escola',
      '--local',
      '--command',
      'DELETE FROM configuracao_da_area',
    ],
    { cwd: path.resolve(here, '..'), encoding: 'utf8' },
  )
  if (result.status !== 0) {
    throw new Error(`Falha ao limpar a configuração: ${result.stderr}`)
  }
}

/** Abre a aba "Quem compra" do curso, partindo da lista de cursos. */
export async function abrirQuemCompra(page: Page, cursoNome: string) {
  await page.goto('/painel/conteudo')
  await page.getByRole('link', { name: cursoNome }).first().click()
  await expect(page).toHaveURL(/\/painel\/conteudo\/[\w-]+$/)
  await page.getByRole('link', { name: 'Quem compra' }).click()
  await expect(page).toHaveURL(/aba=quem-compra/)
}

/** Cria uma edição (turma) do curso, com prazo opcional em dias, pela aba "Quem compra". */
export async function criarEdicaoDoCurso(
  page: Page,
  cursoNome: string,
  nome: string,
  prazoEmDias?: number,
) {
  await abrirQuemCompra(page, cursoNome)
  const abrir = page.getByRole('button', {
    name: /Criar edição separada|Nova edição/,
  })
  await esperarReact(abrir)
  await abrir.click()
  const form = page.getByRole('form', { name: 'Nova edição' })
  await form.getByLabel('Nome da edição').fill(nome)
  if (prazoEmDias) {
    await form.getByLabel('Acesso (dias)').fill(String(prazoEmDias))
  }
  await form.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Edição criada.')).toBeVisible()
}

/** Em Vendas → Produtos, marca o curso num produto da Hotmart ("Qualquer oferta" ou uma oferta já aberta na tela). */
export async function marcarCursoNoProduto(
  page: Page,
  cursoNome: string,
  produtoId: string,
  ofertaHash?: string,
) {
  await page.goto('/painel/vendas/produtos')
  const produto = page.getByRole('region', {
    name: new RegExp(`· ${produtoId}$`),
  })
  await esperarReact(
    produto.getByRole('list', { name: 'Cursos de qualquer oferta' }),
  )
  const grade = produto.getByRole('list', {
    name: ofertaHash
      ? `Cursos da oferta ${ofertaHash}`
      : 'Cursos de qualquer oferta',
  })
  // Oferta com ligação já vem aberta; as demais só depois de "Ver ofertas".
  const ver = produto.getByRole('button', { name: 'Ver ofertas' })
  if (ofertaHash && !(await grade.isVisible()) && (await ver.isVisible())) {
    await ver.click()
  }
  const caixa = grade.getByRole('checkbox', { name: cursoNome })
  await expect(caixa).toBeVisible()
  await caixa.click()
  await expect(caixa).toBeChecked()
  await expect(caixa).toBeEnabled()
}
