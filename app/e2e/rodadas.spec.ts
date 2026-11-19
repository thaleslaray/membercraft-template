import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// Curso com duas aulas só de texto e a aluna matriculada.
function prepararCursoMatriculado(id: string, email: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const sql = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a1-${id}', 'm-${id}', 'Primeira ${id}', '<p>Texto um</p>', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a2-${id}', 'm-${id}', 'Segunda ${id}', '<p>Texto dois</p>', 2)`,
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

interface Pedido {
  inicio: number
  fim: number
  metodo: string
}

// Registra os pedidos às server functions. "Rodada" = pedido que só começa depois de outro terminar:
// o número de rodadas é a profundidade da maior fila (cada uma custa a viagem inteira ao servidor).
// Só contam as leituras (GET) que seguram a tela; as gravações de fundo (POST) e o que vem depois
// delas ficam fora.
function registrar(page: Page) {
  const pedidos: Pedido[] = []
  const abertos = new Map<unknown, Pedido>()
  const aoComecar = (r: import('@playwright/test').Request) => {
    if (!r.url().includes('/_serverFn')) return
    // O sininho da casca busca sozinho ao abrir a primeira página e de minuto em minuto: não é da
    // navegação.
    const nome = Buffer.from(
      r
        .url()
        .split('/_serverFn/')[1]
        .split('?')[0]
        .replace(/-/g, '+')
        .replace(/_/g, '/'),
      'base64',
    ).toString()
    if (nome.includes('sininhoFn')) return
    const p = {
      inicio: Date.now(),
      fim: Number.POSITIVE_INFINITY,
      metodo: r.method(),
    }
    abertos.set(r, p)
    pedidos.push(p)
  }
  const aoTerminar = (r: import('@playwright/test').Request) => {
    const p = abertos.get(r)
    if (p) p.fim = Date.now()
  }
  page.on('request', aoComecar)
  page.on('requestfinished', aoTerminar)
  page.on('requestfailed', aoTerminar)
  return {
    parar() {
      page.off('request', aoComecar)
      page.off('requestfinished', aoTerminar)
      page.off('requestfailed', aoTerminar)
    },
    rodadas() {
      // Só as leituras que começaram antes da primeira gravação de fundo (a abertura da aula): o
      // pré-carregamento da PRÓXIMA aula vem depois dela e não segura a tela.
      const corte = Math.min(
        Number.POSITIVE_INFINITY,
        ...pedidos.filter((p) => p.metodo === 'POST').map((p) => p.inicio),
      )
      const leituras = pedidos
        .filter((p) => p.metodo === 'GET' && p.inicio < corte)
        .sort((a, b) => a.inicio - b.inicio)
      const nivel: number[] = []
      for (const [i, p] of leituras.entries()) {
        nivel[i] =
          1 +
          Math.max(
            0,
            ...leituras
              .map((q, j) => (j < i && q.fim <= p.inicio ? nivel[j] : 0))
              .filter(Boolean),
          )
      }
      return { rodadas: Math.max(0, ...nivel), pedidos: leituras.length }
    },
  }
}

const quieto = (page: Page) => page.waitForTimeout(1500)

test.describe('rodadas ao servidor ao abrir as páginas', () => {
  const id = unico()
  const email = `rodadas-${id}@exemplo.test`
  const medidas: string[] = []

  test.beforeAll(() => {
    cadastrarUsuario({ email })
    prepararCursoMatriculado(id, email)
  })

  test.afterAll(() => {
    console.log(
      `\nRODADAS (pedidos GET às server functions)\n${medidas.join('\n')}`,
    )
  })

  test('aula, curso e Início', async ({ page }) => {
    await entrarPorCodigo(page, email)
    const resultados: { cenario: string; rodadas: number; pedidos: number }[] =
      []
    const anotar = (
      cenario: string,
      r: { rodadas: number; pedidos: number },
    ) => {
      resultados.push({ cenario, ...r })
      medidas.push(`${cenario}: ${r.rodadas} rodada(s), ${r.pedidos} pedido(s)`)
    }

    const irParaCurso = async () => {
      await page.goto('/')
      await esperarReact(page.getByRole('heading', { name: 'Meus cursos' }))
    }
    const linkDoCurso = () => page.locator(`a[href="/cursos/c-${id}"]`).first()
    const linkDaAula = () => page.locator(`a[href="/aulas/a1-${id}"]`).first()
    const linkDoInicio = () =>
      page.getByRole('link', { name: 'Meus cursos', exact: true }).first()
    const iniciar = async (
      cenario: string,
      comHover: boolean,
      link: () => ReturnType<Page['locator']>,
      pronto: () => Promise<unknown>,
    ) => {
      if (comHover) {
        await link().hover()
        await quieto(page)
      }
      const r = registrar(page)
      await link().click()
      // O ponteiro fica no lugar do clique; sem tirá-lo, o link que cair debaixo dele na página nova
      // pré-carrega outra rota e entra na conta.
      await page.mouse.move(2, 2)
      await pronto()
      await quieto(page)
      r.parar()
      anotar(cenario, r.rodadas())
    }

    // Curso (a partir do Início).
    await irParaCurso()
    await iniciar('curso, clique', false, linkDoCurso, () =>
      expect(page.getByRole('link', { name: 'Começar' })).toBeVisible(),
    )
    await irParaCurso()
    await iniciar('curso, depois do hover', true, linkDoCurso, () =>
      expect(page.getByRole('link', { name: 'Começar' })).toBeVisible(),
    )

    // Aula (a partir do curso).
    const abrirAula = () =>
      expect(page.getByRole('button', { name: 'Concluir aula' })).toBeVisible()
    await page.goto(`/cursos/c-${id}`)
    await esperarReact(linkDaAula())
    await iniciar('aula, clique', false, linkDaAula, abrirAula)
    await page.goto(`/cursos/c-${id}`)
    await esperarReact(linkDaAula())
    await iniciar('aula, depois do hover', true, linkDaAula, abrirAula)

    // Início (a partir do curso).
    await page.goto(`/cursos/c-${id}`)
    await esperarReact(linkDaAula())
    await iniciar('início, clique', false, linkDoInicio, () =>
      expect(page.getByRole('heading', { name: 'Meus cursos' })).toBeVisible(),
    )
    await page.goto(`/cursos/c-${id}`)
    await esperarReact(linkDaAula())
    await iniciar('início, depois do hover', true, linkDoInicio, () =>
      expect(page.getByRole('heading', { name: 'Meus cursos' })).toBeVisible(),
    )

    const de = (c: string) => resultados.find((r) => r.cenario === c)?.rodadas
    // A aula abre com UMA rodada e, depois do pré-carregamento, com nenhuma.
    expect.soft(de('aula, clique')).toBeLessThanOrEqual(1)
    expect.soft(de('aula, depois do hover')).toBe(0)
    expect.soft(de('curso, clique')).toBeLessThanOrEqual(1)
    expect.soft(de('curso, depois do hover')).toBe(0)
    expect.soft(de('início, clique')).toBeLessThanOrEqual(1)
    expect.soft(de('início, depois do hover')).toBe(0)
  })
})
