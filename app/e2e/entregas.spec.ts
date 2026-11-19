import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// A Equipe vê o que a aluna entregou (texto, imagem e a alternativa marcada) na fila de correção e
// na página Entregas, filtrada pela aluna. A aluna entrega pela tela de verdade, com um PNG.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const PRINTS = process.env.PRINTS_DIR

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64',
)

function prepararQuiz(id: string, email: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const sql = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a-${id}', 'm-${id}', 'Aula ${id}', '<p>Texto</p>', 1)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
    `INSERT INTO quiz (id, aula_id, so_quiz, obrigatorio, minimo_de_acertos, maximo_de_tentativas, pontos, sem_correcao) VALUES ('q-${id}', 'a-${id}', 0, 1, 100, 2, 100, 0)`,
    `INSERT INTO pergunta_do_quiz (id, quiz_id, tipo, enunciado, ordem) VALUES ('p1-${id}', 'q-${id}', 'multipla', 'Quais são cores primárias?', 1)`,
    `INSERT INTO alternativa_da_pergunta (id, pergunta_id, texto, correta, ordem) VALUES ('p1a-${id}', 'p1-${id}', 'Azul', 1, 1)`,
    `INSERT INTO alternativa_da_pergunta (id, pergunta_id, texto, correta, ordem) VALUES ('p1b-${id}', 'p1-${id}', 'Verde', 0, 2)`,
    `INSERT INTO alternativa_da_pergunta (id, pergunta_id, texto, correta, ordem) VALUES ('p1c-${id}', 'p1-${id}', 'Amarelo', 1, 3)`,
    `INSERT INTO pergunta_do_quiz (id, quiz_id, tipo, enunciado, ordem) VALUES ('p2-${id}', 'q-${id}', 'texto_livre', 'Conte o que aprendeu.', 2)`,
    `INSERT INTO pergunta_do_quiz (id, quiz_id, tipo, enunciado, ordem) VALUES ('p3-${id}', 'q-${id}', 'arquivo', 'Envie a foto do resultado.', 3)`,
  ].join('; ')
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao preparar o quiz: ${r.stderr}`)
}

test('a equipe vê texto, imagem e múltipla na fila e acha a entrega na página Entregas', async ({
  browser,
}) => {
  const id = unico()
  const emailAluna = `entregas-aluna-${id}@exemplo.test`
  const emailEquipe = `entregas-equipe-${id}@exemplo.test`
  const nomeAluna = `Aluna Entregas ${id}`
  cadastrarUsuario({ email: emailAluna, nome: nomeAluna })
  cadastrarUsuario({ email: emailEquipe, perfil: 'equipe' })
  prepararQuiz(id, emailAluna)

  const contextoAluna = await browser.newContext()
  const aluna = await contextoAluna.newPage()
  await entrarPorCodigo(aluna, emailAluna)
  await aluna.goto(`/aulas/a-${id}`)
  const quiz = aluna.getByLabel('Exercício da aula')
  await esperarReact(quiz.getByRole('checkbox', { name: 'Azul' }))
  await quiz.getByRole('checkbox', { name: 'Azul' }).check()
  await quiz.getByRole('checkbox', { name: 'Verde' }).check()
  await quiz
    .getByLabel('Resposta da pergunta 2')
    .fill('Primeira linha.\nSegunda linha.')
  await quiz.getByLabel('Arquivos da pergunta 3').setInputFiles({
    name: 'resultado.png',
    mimeType: 'image/png',
    buffer: PNG,
  })
  await expect(quiz.getByText('resultado.png')).toBeVisible()
  await quiz.getByRole('button', { name: 'Enviar respostas' }).click()
  await expect(quiz.getByText('Aguardando correção').first()).toBeVisible()

  const contextoEquipe = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  })
  const equipe = await contextoEquipe.newPage()
  await entrarPorCodigo(equipe, emailEquipe)

  // Fila: as três respostas à vista.
  await equipe.goto('/painel/correcao')
  const entrega = equipe.getByRole('listitem').filter({ hasText: `Aula ${id}` })
  const multipla = entrega.getByRole('region', {
    name: 'Quais são cores primárias?',
  })
  await expect(multipla.getByText('Marcada: Azul')).toBeVisible()
  await expect(multipla.getByText('Marcada: Verde')).toBeVisible()
  await expect(multipla.getByText('Não marcada: Amarelo')).toBeVisible()
  await expect(multipla.getByText('Resposta correta')).toHaveCount(2)
  await expect(multipla.getByRole('button', { name: 'Certa' })).toHaveCount(0)
  const texto = entrega.getByRole('region', { name: 'Conte o que aprendeu.' })
  await expect(
    texto.getByText(/Primeira linha\.\s+Segunda linha\./),
  ).toBeVisible()
  const arquivo = entrega.getByRole('region', {
    name: 'Envie a foto do resultado.',
  })
  const imagem = arquivo.getByRole('img', { name: /resultado\.png/ })
  await expect(imagem).toBeVisible()
  await expect
    .poll(() => imagem.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0)
  const src = (await imagem.getAttribute('src')) ?? ''
  const resposta = await equipe.request.get(src)
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toBe('image/png')
  expect(resposta.headers()['content-disposition']).toMatch(/^inline;/)
  if (PRINTS) {
    await entrega.screenshot({
      path: path.join(PRINTS, 'fila-com-entrega.png'),
    })
  }

  // Página Entregas: filtra pela aluna e abre o detalhe.
  await equipe.goto('/painel/entregas')
  await esperarReact(equipe.getByLabel('Aluna'))
  await equipe.getByLabel('Aluna').fill(emailAluna)
  await equipe.getByRole('button', { name: 'Buscar' }).click()
  await expect(equipe).toHaveURL(/aluno=/)
  await expect(equipe.getByText('1 entrega', { exact: true })).toBeVisible()
  const linhas = equipe.getByRole('row').filter({ hasText: `Aula ${id}` })
  await expect(linhas).toHaveCount(1)
  await expect(linhas.getByText(nomeAluna)).toBeVisible()
  await expect(linhas.getByText('Aguardando correção')).toBeVisible()
  if (PRINTS) {
    await equipe.screenshot({ path: path.join(PRINTS, 'entregas.png') })
  }
  await linhas.getByRole('link', { name: new RegExp(`Aula ${id}`) }).click()
  await expect(equipe).toHaveURL(/\/painel\/entregas\/.+/)
  await expect(equipe.getByText('Primeira linha.')).toBeVisible()
  await expect(equipe.getByText('Marcada: Verde')).toBeVisible()
  await expect(
    equipe.getByRole('img', { name: /resultado\.png/ }),
  ).toBeVisible()

  // Ficha da aluna: seção Exercícios com a mesma entrega.
  await equipe.goto(`/painel/alunos/e2e-${emailAluna.replace(/\W/g, '-')}`)
  const secao = equipe.getByRole('region', { name: /^Exercícios/ })
  await expect(secao.getByText(`Aula ${id}`)).toBeVisible()
})
