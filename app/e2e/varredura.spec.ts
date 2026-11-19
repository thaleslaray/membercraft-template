import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Locator, type Page, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Varredura de navegação: percorre o site CLICANDO nos links, como uma pessoa. Abrir a página
// pelo endereço (`page.goto`) faz as server functions rodarem dentro do servidor, e o defeito
// que só existe quando elas viram pedidos HTTP (`/_serverFn/...`) passa em branco. Aqui só a
// primeira página de cada perfil abre pelo endereço (o login).
//
// Em cada página o teste anota (sem parar no primeiro): a página de erro do app, `console.error`,
// `pageerror`, resposta 4xx/5xx de `/_serverFn/` ou `/api/` e `main` vazio. No fim do perfil,
// falha com a lista inteira. Não corrige nada: quem corrige é quem lê a lista.
//
// O que existe no banco é descoberto no D1 local (só leitura) para escolher os alvos; a
// navegação até eles é toda por clique. Funciona com o banco pequeno dos outros specs e, com os
// cursos reais importados, passa pelos grandes.

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..')
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

type Linha = Record<string, string | number | null>

function consultar(sql: string): Linha[] {
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
      sql,
    ],
    { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (r.status !== 0) throw new Error(`Falha na consulta: ${r.stderr}`)
  const json = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))
  return json[0].results as Linha[]
}

function executar(sql: string) {
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: raiz, encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao executar SQL: ${r.stderr}`)
}

/** Matricula a aluna em uma turma de cada curso (turma fixa por curso, então roda de novo sem duplicar). */
function matricularEmTodosOsCursos(email: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const agora = Date.now() - 86_400_000
  executar(
    [
      `INSERT OR IGNORE INTO turma (id, curso_id, nome) SELECT 'tv-' || id, id, 'Turma da varredura' FROM curso WHERE excluido_em IS NULL`,
      `INSERT OR IGNORE INTO matricula (id, user_id, turma_id, situacao, inicia_em) SELECT 'mv-' || '${userId}' || '-' || id, '${userId}', 'tv-' || id, 'ativa', ${agora} FROM curso WHERE excluido_em IS NULL`,
    ].join('; '),
  )
}

type Alvo = {
  cursoId: string
  nome: string
  aulas: AulaAlvo[]
  modulos: number
  /** Total de aulas do curso (não só as escolhidas): limita quantas vezes dá para ir à próxima. */
  totalDeAulas: number
}
type AulaAlvo = {
  id: string
  titulo: string
  moduloId: string
  temQuiz: boolean
}

/** Os maiores cursos (com aulas) e, de cada um, as aulas que a varredura vai abrir. */
function escolherAlvos(quantosCursos: number, aulasPorCurso: number): Alvo[] {
  const cursos = consultar(
    `SELECT c.id, c.nome, COUNT(a.id) n FROM curso c
     JOIN modulo m ON m.curso_id = c.id AND m.excluido_em IS NULL
     JOIN aula a ON a.modulo_id = m.id AND a.excluido_em IS NULL
     WHERE c.excluido_em IS NULL GROUP BY c.id ORDER BY n DESC, c.nome LIMIT ${quantosCursos}`,
  )
  return cursos.map((c) => {
    const linhas = consultar(
      `SELECT a.id, a.titulo, m.id mid,
        EXISTS (SELECT 1 FROM quiz q WHERE q.aula_id = a.id AND q.excluido_em IS NULL) q
       FROM aula a JOIN modulo m ON m.id = a.modulo_id AND m.excluido_em IS NULL
       WHERE m.curso_id = '${c.id}' AND a.excluido_em IS NULL
       ORDER BY m.ordem, a.ordem`,
    )
    const todas: AulaAlvo[] = linhas.map((l) => ({
      id: String(l.id),
      titulo: String(l.titulo),
      moduloId: String(l.mid),
      temQuiz: l.q === 1,
    }))
    const escolhidas = new Map<string, AulaAlvo>()
    const vistos = new Set<string>()
    // A primeira aula de cada módulo, a última do curso e as que têm quiz, até o limite.
    for (const a of todas) {
      if (!vistos.has(a.moduloId)) {
        vistos.add(a.moduloId)
        escolhidas.set(a.id, a)
      }
    }
    const ultima = todas[todas.length - 1]
    escolhidas.set(ultima.id, ultima)
    for (const a of todas.filter((x) => x.temQuiz).slice(0, 6)) {
      escolhidas.set(a.id, a)
    }
    const lista = [...escolhidas.values()]
    // Na ordem do curso, e sem estourar o limite: a última e os quizzes têm prioridade.
    const prioritarias = lista.filter((a) => a.temQuiz || a.id === ultima.id)
    const resto = lista.filter((a) => !prioritarias.includes(a))
    const aulas = [
      ...prioritarias,
      ...resto.slice(0, Math.max(0, aulasPorCurso - prioritarias.length)),
    ].slice(0, aulasPorCurso)
    return {
      cursoId: String(c.id),
      nome: String(c.nome),
      aulas: todas.filter((a) => aulas.some((x) => x.id === a.id)),
      modulos: vistos.size,
      totalDeAulas: todas.length,
    }
  })
}

// ---------------------------------------------------------------------------------------------

type Achado = { onde: string; tipo: string; mensagem: string; trilha: string }

function origem(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** A mensagem veio de um frame de outra origem (pelo endereço dela ou pelo "from origin" do CORS). */
function deOutraOrigem(
  paginaUrl: string,
  mensagemUrl: string,
  texto: string,
): boolean {
  const app = origem(paginaUrl)
  const daMensagem =
    origem(mensagemUrl) ?? /from origin '([^']+)'/.exec(texto)?.[1] ?? null
  return Boolean(app && daMensagem && daMensagem !== app)
}

class Varredura {
  achados: Achado[] = []
  paginas = new Set<string>()
  private trilha: string[] = []
  private vistos = new Set<string>()

  constructor(
    readonly page: Page,
    readonly perfil: string,
  ) {
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const loc = msg.location()
      // Erro de dentro de um embed de outra origem (ex.: a analytics do Typebot no iframe da
      // aula) é do serviço de fora, não do app.
      if (deOutraOrigem(page.url(), loc.url, msg.text())) return
      this.anotar(
        'erro no console',
        `${msg.text()}${loc.url ? ` (${loc.url})` : ''}`,
      )
    })
    page.on('pageerror', (erro) => this.anotar('pageerror', erro.message))
    page.on('response', (res) => {
      const url = new URL(res.url())
      if (res.status() < 400) return
      if (
        !url.pathname.startsWith('/_serverFn/') &&
        !url.pathname.startsWith('/api/')
      )
        return
      this.anotar(
        'resposta 4xx/5xx de /_serverFn ou /api',
        `${res.request().method()} ${url.pathname}${url.search} -> ${res.status()}`,
      )
    })
  }

  private anotar(tipo: string, mensagem: string) {
    const onde = this.urlAtual()
    const chave = `${onde}|${tipo}|${mensagem}`
    if (this.vistos.has(chave)) return
    this.vistos.add(chave)
    this.achados.push({
      onde,
      tipo,
      mensagem,
      trilha: this.trilha.slice(-6).join(' > '),
    })
  }

  private urlAtual() {
    try {
      const u = new URL(this.page.url())
      return u.pathname + u.search
    } catch {
      return this.page.url()
    }
  }

  /** Registra o passo, espera a página assentar e confere o que ela mostra. */
  async conferir(rotulo: string) {
    this.trilha.push(rotulo)
    const page = this.page
    await page.waitForLoadState('load').catch(() => {})
    await page
      .waitForLoadState('networkidle', { timeout: 8000 })
      .catch(() => {})
    await page.waitForTimeout(250)
    this.paginas.add(new URL(page.url()).pathname)

    const erro = page.getByText('Não conseguimos abrir esta página')
    if ((await erro.count()) > 0) {
      const pre = await page
        .locator('pre')
        .first()
        .textContent()
        .catch(() => null)
      this.anotar(
        'página de erro do app',
        (pre ?? '(sem texto)').trim().slice(0, 400),
      )
    }
    if (
      (await page.getByText('ALGO DEU ERRADO', { exact: false }).count()) > 0
    ) {
      this.anotar('página de erro do app', 'ALGO DEU ERRADO')
    }
    // Páginas sem `main` (Minha conta, Aparência) valem pelo corpo inteiro.
    const temMain = (await page.locator('main').count()) > 0
    const vazio = await page
      .locator(temMain ? 'main' : 'body')
      .first()
      .evaluate(
        (m) =>
          (m.textContent ?? '').trim() === '' &&
          m.querySelector('img,video,iframe,canvas,svg') === null,
      )
      .catch(() => true)
    if (vazio) this.anotar('nada carregado', '`main` vazio')
  }

  async clicar(alvo: Locator, rotulo: string) {
    try {
      await alvo.click({ timeout: 10_000 })
    } catch (e) {
      this.trilha.push(`${rotulo} (clique falhou)`)
      this.anotar(
        'não achei o link para clicar',
        `${rotulo}: ${(e as Error).message.split('\n')[0]}`,
      )
      return false
    }
    await this.conferir(rotulo)
    return true
  }

  /** Roda o roteiro; se ele quebrar no meio, anota onde parou (e a página de erro, se for ela). */
  async executar(roteiro: () => Promise<void>) {
    try {
      await roteiro()
    } catch (e) {
      await this.conferir('onde o roteiro parou').catch(() => {})
      this.anotar('o roteiro parou', (e as Error).message.split('\n')[0])
    }
  }

  relatorio() {
    return this.achados
      .map(
        (a) =>
          `- ${a.onde} — ${a.tipo} — ${a.mensagem}\n    cliques: ${a.trilha}`,
      )
      .join('\n')
  }
}

const celular = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768

const DESTINOS_DO_TOPO: Record<string, string> = {
  Início: 'Meus cursos',
  Comunidades: 'Comunidade',
}
// Rotas que não têm mais item de menu (#93) mas continuam vivas: abertas pelo endereço.
const ROTAS_SEM_MENU: Record<string, string> = {
  Favoritos: '/favoritos',
  Certificados: '/certificados',
  Ranking: '/ranking',
  Atendimento: '/atendimento',
}

/** Os dois destinos ficam na barra do topo (desktop) ou nas abas do pé (celular); o resto, pela rota. */
async function irPeloMenu(v: Varredura, link: string, rotulo: string) {
  const page = v.page
  const rota = ROTAS_SEM_MENU[link]
  if (rota) {
    await page.goto(rota)
    await v.conferir(rotulo)
    return true
  }
  return v.clicar(
    page
      .getByRole('navigation', { name: celular(page) ? 'Abas' : 'Destinos' })
      .getByRole('link', { name: DESTINOS_DO_TOPO[link], exact: true }),
    rotulo,
  )
}

async function fecharGaveta(page: Page) {
  if (!celular(page)) return
  const gaveta = page.getByRole('dialog')
  if ((await gaveta.count()) === 0) return
  await page.keyboard.press('Escape')
  await gaveta
    .first()
    .waitFor({ state: 'detached', timeout: 5000 })
    .catch(() => {})
}

/** O atalho do Estúdio mora no menu do avatar. */
async function irPeloLinkDoEstudio(v: Varredura) {
  const page = v.page
  await page.getByRole('button', { name: 'Abrir menu da conta' }).click()
  await v.clicar(
    page.getByRole('menuitem', { name: 'Estúdio da equipe' }),
    'Estúdio da equipe',
  )
}

// --- roteiro da aluna ------------------------------------------------------------------------

/**
 * Na página do curso os módulos são um accordion: o fechado mantém as aulas no DOM, mas invisíveis (a
 * altura recolhe por grid-rows, #89). Espera o módulo da aula existir na tela (a troca de tela anima e o
 * DOM novo pode demorar), abre pelo gatilho só se ele estiver fechado e confere o estado: o clique que
 * não pegou (tela ainda trocando) é refeito, e um módulo já aberto nunca é fechado por engano.
 */
async function abrirModuloDaAula(page: Page, aulaId: string) {
  const item = page
    .locator('section[aria-label="Módulos"] [data-slot="accordion-item"]')
    .filter({ has: page.locator(`a[href^="/aulas/${aulaId}"]`) })
    .first()
  const gatilho = item.locator('[data-slot="accordion-trigger"]')
  const link = item.locator(`a[href^="/aulas/${aulaId}"]`)
  if (
    !(await gatilho.waitFor({ timeout: 10_000 }).then(
      () => true,
      () => false,
    ))
  )
    return
  await esperarReact(gatilho)
  await expect(async () => {
    if ((await gatilho.getAttribute('aria-expanded')) !== 'true') {
      await gatilho.click({ timeout: 3000 })
    }
    await expect(link.first()).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 15_000 })
}

async function roteiroDaAluna(
  v: Varredura,
  limites: { cursos: number; aulasPorCurso: number; completo: boolean },
) {
  const page = v.page
  const alvos = escolherAlvos(limites.cursos, limites.aulasPorCurso)

  // Vitrine -> cada curso -> aulas escolhidas, sempre pelos links.
  for (const [i, curso] of alvos.entries()) {
    await irPeloMenu(v, 'Início', 'Início')
    const cartao = page
      .locator(`main a[href^="/cursos/${curso.cursoId}"]`)
      .first()
    if (!(await v.clicar(cartao, `curso ${curso.nome}`))) continue

    for (const aula of curso.aulas) {
      await abrirModuloDaAula(page, aula.id)
      const link = page
        .locator(`section[aria-label="Módulos"] a[href^="/aulas/${aula.id}"]`)
        .first()
      const abriu = await v.clicar(
        link,
        `aula ${aula.titulo}${aula.temQuiz ? ' [quiz]' : ''}`,
      )
      if (!abriu) continue
      // Volta ao curso pelo nome dele no topo da aula.
      await v.clicar(
        // O link visível: no celular o caminho do topo mostra só a aula, e o curso fica no
        // nome acima do título.
        page
          .locator(`main a[href^="/cursos/${curso.cursoId}"]`)
          .filter({ visible: true })
          .first(),
        `voltar ao curso ${curso.nome}`,
      )
    }

    // No curso maior: Próxima/Anterior até duas vezes e o índice lateral para outro módulo. Num curso
    // de 2 aulas (o banco limpo do CI) só dá um passo: na última aula a "Próxima" vira botão desligado.
    if (i === 0 && curso.aulas.length > 0) {
      const primeira = curso.aulas[0]
      await abrirModuloDaAula(page, primeira.id)
      await v.clicar(
        page
          .locator(
            `section[aria-label="Módulos"] a[href^="/aulas/${primeira.id}"]`,
          )
          .first(),
        `aula ${primeira.titulo}`,
      )
      const passos = Math.min(2, curso.totalDeAulas - 1)
      for (const nome of [
        ...Array<string>(passos).fill('Próxima'),
        ...Array<string>(passos).fill('Anterior'),
      ]) {
        await v.clicar(
          page.getByRole('link', { name: nome, exact: true }).first(),
          nome,
        )
      }
      if (curso.modulos > 1) {
        // A lista do curso é um painel (desktop) ou uma gaveta (celular), aberto pelo botão "Aulas".
        await page.getByRole('button', { name: 'Aulas', exact: true }).click()
        const indice = page.getByRole('navigation', { name: 'Aulas do curso' })
        await expect(indice).toBeVisible()
        const fechados = indice.locator('button[aria-expanded="false"]')
        if ((await fechados.count()) > 0) {
          await fechados.first().click()
          // Só os módulos abertos têm aulas visíveis: o último link é do último módulo aberto.
          const dentro = indice
            .locator('a[href^="/aulas/"]:not([aria-current="page"])')
            .filter({ visible: true })
          // Procura a aula que não está no módulo atual: a do último módulo aberto.
          await v.clicar(dentro.last(), 'índice lateral: aula de outro módulo')
        }
      }
      // Favorita uma aula, para a tela de Favoritos ter o que listar.
      const fav = page.getByRole('button', { name: /^Favoritar/ }).first()
      if (await fav.isVisible().catch(() => false)) {
        await fav.click()
        await page.waitForTimeout(500)
      }
    }
  }

  // Busca com um termo que existe (palavra de um título de aula).
  if (!celular(page) && alvos[0]?.aulas[0]) {
    const palavra =
      alvos[0].aulas[0].titulo.split(/\s+/).find((p) => p.length >= 4) ?? 'aula'
    const gatilho = page.getByRole('button', {
      name: 'Pesquisar aulas e vídeos',
    })
    await esperarReact(gatilho)
    await expect(async () => {
      await gatilho.click()
      await expect(
        page.getByRole('dialog', { name: 'Busca rápida' }),
      ).toBeVisible({
        timeout: 1500,
      })
    }).toPass()
    await page
      .getByRole('combobox', { name: 'Buscar nos seus cursos' })
      .fill(palavra)
    await page.getByRole('button', { name: 'Ver todos os resultados' }).click()
    await v.conferir(`busca "${palavra}"`)
    await v.clicar(
      page.locator('main a[href^="/aulas/"]').first(),
      'primeiro resultado da busca',
    )
  }

  // Destinos do topo e rotas antigas.
  for (const nome of [
    'Início',
    'Favoritos',
    'Certificados',
    'Comunidades',
    'Ranking',
    'Atendimento',
  ]) {
    if (
      !limites.completo &&
      !['Favoritos', 'Certificados', 'Comunidades'].includes(nome) &&
      nome !== 'Início'
    )
      continue
    await irPeloMenu(v, nome, nome)
  }

  // Tela de pontos, pelo link do Ranking.
  if (limites.completo) {
    await irPeloMenu(v, 'Ranking', 'Ranking')
    await v.clicar(
      page.getByRole('link', { name: 'Ver meus pontos' }),
      'Ver meus pontos',
    )
  }

  // Menu da conta.
  await page.getByRole('button', { name: 'Abrir menu da conta' }).click()
  await v.clicar(page.getByRole('menuitem', { name: 'Sua conta' }), 'Sua conta')
}

// --- roteiro do Proprietário -----------------------------------------------------------------

async function roteiroDoProprietario(v: Varredura) {
  const page = v.page
  await irPeloLinkDoEstudio(v)

  const painel = 'Painel da equipe'
  const abrirMenu = async () => {
    const nav = page.getByRole('navigation', { name: painel })
    if (celular(page)) {
      await fecharGaveta(page)
      await page.getByRole('button', { name: 'Abrir ou fechar o menu' }).click()
      await nav.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    }
    return nav
  }

  const nav = await abrirMenu()
  const itens = await nav.locator('a').evaluateAll((as) =>
    as.map((a) => ({
      href: a.getAttribute('href') ?? '',
      nome: (a.textContent ?? '').trim(),
    })),
  )
  await fecharGaveta(page)
  expect(itens.length, 'o menu do Estúdio não listou itens').toBeGreaterThan(5)

  for (const item of itens) {
    const n = await abrirMenu()
    const ok = await v.clicar(
      n.locator(`a[href="${item.href}"]`).first(),
      `Estúdio: ${item.nome}`,
    )
    await fecharGaveta(page)
    if (!ok) continue

    // A Aparência fica fora do `/painel`: volta pela seta do cabeçalho.
    if (item.href === '/estudio/aparencia') {
      await v.clicar(
        page.getByRole('link', { name: 'Voltar para Estúdio' }),
        'Aparência: Voltar para Estúdio',
      )
      continue
    }

    // Primeira linha da lista que leva a um detalhe.
    const detalhe = page.locator(`main a[href^="${item.href}/"]`).first()
    if (item.href !== '/estudio/aparencia' && (await detalhe.count()) > 0) {
      const href = await detalhe.getAttribute('href')
      const abriu = await v.clicar(detalhe, `${item.nome}: primeira linha`)
      if (abriu && item.href === '/painel/conteudo') {
        const aula = page.locator('main a[href^="/painel/aulas/"]').first()
        if ((await aula.count()) > 0) {
          await v.clicar(aula, 'curso: uma aula')
          // Volta ao curso pelo menu e abre o certificado.
          const m = await abrirMenu()
          await v.clicar(
            m.locator('a[href="/painel/conteudo"]').first(),
            'Estúdio: Cursos',
          )
          await fecharGaveta(page)
          await v.clicar(
            page.locator(`main a[href="${href}"]`).first(),
            'Cursos: o mesmo curso',
          )
        }
        const cert = page
          .locator('main a[href^="/painel/certificado/"]')
          .first()
        if ((await cert.count()) > 0) await v.clicar(cert, 'curso: certificado')
      }
    }
  }

  // Volta para a área do aluno.
  if (celular(page)) {
    await fecharGaveta(page)
    await page.getByRole('button', { name: 'Abrir ou fechar o menu' }).click()
  }
  await v.clicar(
    page.getByRole('link', { name: 'Ver a área do aluno' }).first(),
    'Ver a área do aluno',
  )
  await fecharGaveta(page)
}

// ---------------------------------------------------------------------------------------------

async function terminar(
  v: Varredura,
  testInfo: import('@playwright/test').TestInfo,
) {
  const resumo = `${v.perfil}: ${v.paginas.size} páginas, ${v.achados.length} achados`
  console.log(`VARREDURA ${resumo}`)
  const relatorio = v.relatorio()
  if (relatorio) console.log(`ACHADOS ${v.perfil}\n${relatorio}`)
  await testInfo.attach(`varredura-${v.perfil}`, {
    body: `${resumo}\n${relatorio}`,
    contentType: 'text/plain',
  })
  expect(v.achados.length, `${resumo}\n${relatorio}`).toBe(0)
}

test.describe('varredura pelos links', () => {
  test.describe('computador', () => {
    test.use({ viewport: { width: 1440, height: 900 } })

    test('aluna, computador', async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const email = `varredura-aluna-${unico()}@exemplo.test`
      cadastrarUsuario({ email, nome: 'Aluna da Varredura' })
      matricularEmTodosOsCursos(email)
      await entrarPorCodigo(page, email)
      const v = new Varredura(page, 'aluna desktop')
      await v.conferir('Início (entrada)')
      await v.executar(() =>
        roteiroDaAluna(v, { cursos: 6, aulasPorCurso: 8, completo: true }),
      )
      await terminar(v, testInfo)
    })

    test('Proprietário, computador', async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const email = `varredura-dono-${unico()}@exemplo.test`
      cadastrarUsuario({
        email,
        perfil: 'proprietario',
        nome: 'Dono da Varredura',
      })
      await entrarPorCodigo(page, email)
      const v = new Varredura(page, 'Proprietário desktop')
      await v.conferir('Início (entrada)')
      await v.executar(() => roteiroDoProprietario(v))
      await terminar(v, testInfo)
    })
  })

  test.describe('celular', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('aluna, celular', async ({ page }, testInfo) => {
      test.setTimeout(100_000)
      const email = `varredura-aluna-cel-${unico()}@exemplo.test`
      cadastrarUsuario({ email, nome: 'Aluna da Varredura' })
      matricularEmTodosOsCursos(email)
      await entrarPorCodigo(page, email)
      const v = new Varredura(page, 'aluna celular')
      await v.conferir('Início (entrada)')
      await v.executar(() =>
        roteiroDaAluna(v, { cursos: 3, aulasPorCurso: 4, completo: false }),
      )
      await terminar(v, testInfo)
    })

    test('Proprietário, celular', async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const email = `varredura-dono-cel-${unico()}@exemplo.test`
      cadastrarUsuario({
        email,
        perfil: 'proprietario',
        nome: 'Dono da Varredura',
      })
      await entrarPorCodigo(page, email)
      const v = new Varredura(page, 'Proprietário celular')
      await v.conferir('Início (entrada)')
      await v.executar(() => roteiroDoProprietario(v))
      await terminar(v, testInfo)
    })
  })
})
