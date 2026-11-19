import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// "N colegas assistiram esta semana" (#105): número agregado na linha do módulo, só com 3 ou mais colegas
// que abriram a aula nos últimos 7 dias, sem contar a Equipe, quem olha nem aberturas antigas.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const DIA = 86_400_000

test.use({ bypassCSP: true })

// a1: 4 colegas na semana (+ 1 da equipe e 1 antigo, que não contam) -> "4 colegas".
// a2: 2 colegas -> nada. a3: 12 colegas -> "12 colegas".
function preparar(id: string, email: string, pasta: string) {
  const agora = Date.now()
  const l = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso dos colegas ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo com um nome razoavelmente comprido ${id}', 1)`,
    ...[1, 2, 3].map(
      (n) =>
        `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a${n}-${id}', 'm-${id}', 'Aula ${n} ${id}', '<p>Texto</p>', ${n})`,
    ),
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', 'e2e-${email.replace(/\W/g, '-')}', 't-${id}', 'ativa', ${agora - DIA})`,
  ]
  const colega = (
    n: string,
    aula: string,
    quando: number,
    perfil = 'aluno',
  ) => {
    l.push(
      `INSERT OR IGNORE INTO user (id, name, email, email_verified, perfil) VALUES ('col-${n}-${id}', 'Colega ${n}', 'col-${n}-${id}@exemplo.test', 1, '${perfil}')`,
      `INSERT INTO progresso_da_aula (id, user_id, aula_id, aberta_em) VALUES ('p-${n}-${aula}-${id}', 'col-${n}-${id}', '${aula}-${id}', ${quando})`,
    )
  }
  for (const n of ['a', 'b', 'c', 'd']) colega(n, 'a1', agora - 2 * DIA)
  colega('eq', 'a1', agora - DIA, 'equipe')
  colega('velho', 'a1', agora - 9 * DIA)
  for (const n of ['a', 'b']) colega(n, 'a2', agora - DIA)
  for (let i = 1; i <= 12; i++) colega(`x${i}`, 'a3', agora - DIA)
  const arquivo = path.join(pasta, `semente-colegas-${id}.sql`)
  writeFileSync(arquivo, `${l.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao preparar: ${r.stderr}`)
}

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]

for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`colegas da semana: ${tela.nome} ${modo}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000)
      await page.setViewportSize(tela.viewport)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      const pasta = process.env.PRINTS_DIR ?? testInfo.outputPath('.')
      const id = unico()
      const email = `colegas-${id}@exemplo.test`
      cadastrarUsuario({ email })
      preparar(id, email, testInfo.outputPath('.'))
      await entrarPorCodigo(page, email)
      const foto = (nome: string) =>
        page.screenshot({
          path: path.join(pasta, `${nome}-${tela.nome}-${modo}.png`),
        })
      const colegas = page.getByTestId('colegas-da-semana')
      const botao = page.getByRole('button', { name: 'Aulas', exact: true })

      // 4 colegas (a equipe e a abertura de 9 dias atrás ficam de fora): aparece, sem nomes.
      await page.goto(`/aulas/a1-${id}`)
      await esperarReact(botao)
      await expect(colegas).toHaveText('· 4 colegas assistiram esta semana')
      await expect(page.getByText('Colega a')).toHaveCount(0)
      await page.waitForTimeout(400)
      await foto('colegas-quatro')
      const { AxeBuilder } = await import('@axe-core/playwright')
      const r = await new AxeBuilder({ page }).analyze()
      expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual(
        [],
      )

      // 2 colegas: abaixo do mínimo, a linha segue como era.
      await page.goto(`/aulas/a2-${id}`)
      await esperarReact(botao)
      await expect(colegas).toHaveCount(0)
      await expect(page.getByText('colegas assistiram')).toHaveCount(0)
      await foto('colegas-dois-some')

      // 12 colegas.
      await page.goto(`/aulas/a3-${id}`)
      await esperarReact(botao)
      await expect(colegas).toHaveText('· 12 colegas assistiram esta semana')
      await foto('colegas-doze')
    })
  }
}
