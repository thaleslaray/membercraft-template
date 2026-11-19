import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Bug de produção: a Equipe marcava "Certa"/"Errada" e a tela não mudava até o F5. Aqui o cartão da
// tentativa tem duas respostas abertas; ao marcar, cada uma mostra a etiqueta na hora e, na última,
// o cartão sai da fila e o contador diminui, tudo SEM recarregar a página.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

function semear(id: string, emailAluno: string) {
  const userId = `e2e-${emailAluno.replace(/\W/g, '-')}`
  const perguntas = JSON.stringify(
    ['1', '2'].map((n) => ({
      id: `p${n}-${id}`,
      tipo: 'texto_livre',
      enunciado: `Pergunta ${n} ${id}`,
      imagem: null,
      alternativas: [],
    })),
  ).replace(/'/g, "''")
  const sql = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a-${id}', 'm-${id}', 'Aula ${id}', '<p>Texto</p>', 1)`,
    `INSERT INTO quiz (id, aula_id, so_quiz, obrigatorio, minimo_de_acertos, maximo_de_tentativas, pontos, sem_correcao) VALUES ('q-${id}', 'a-${id}', 0, 1, 100, 2, 100, 0)`,
    `INSERT INTO pergunta_do_quiz (id, quiz_id, tipo, enunciado, ordem) VALUES ('p1-${id}', 'q-${id}', 'texto_livre', 'Pergunta 1 ${id}', 1)`,
    `INSERT INTO pergunta_do_quiz (id, quiz_id, tipo, enunciado, ordem) VALUES ('p2-${id}', 'q-${id}', 'texto_livre', 'Pergunta 2 ${id}', 2)`,
    `INSERT INTO tentativa_do_quiz (id, quiz_id, user_id, numero, estado, perguntas, respostas, acertos, total, percentual, minimo_de_acertos, enviada_em) VALUES ('t-${id}', 'q-${id}', '${userId}', 1, 'aguardando_correcao', '${perguntas}', '{}', 0, 2, 0, 100, ${Date.now() - 60_000})`,
    `INSERT INTO resposta_aberta_do_quiz (id, tentativa_id, pergunta_id, texto, situacao) VALUES ('r1-${id}', 't-${id}', 'p1-${id}', 'Primeira resposta', 'pendente')`,
    `INSERT INTO resposta_aberta_do_quiz (id, tentativa_id, pergunta_id, texto, situacao) VALUES ('r2-${id}', 't-${id}', 'p2-${id}', 'Segunda resposta', 'pendente')`,
  ].join('; ')
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao semear: ${r.stderr}`)
}

test('marcar a resposta atualiza a tela na hora, e a tentativa sai da fila sem F5', async ({
  page,
}) => {
  const id = unico()
  const emailAluno = `correcao-aluno-${id}@exemplo.test`
  const emailEquipe = `correcao-equipe-${id}@exemplo.test`
  cadastrarUsuario({ email: emailAluno, nome: 'Aluno da Fila' })
  cadastrarUsuario({ email: emailEquipe, perfil: 'equipe' })
  semear(id, emailAluno)

  await entrarPorCodigo(page, emailEquipe)

  // Leitura velha: guarda as respostas das leituras (GET das server functions) e, depois do
  // `congelar`, devolve sempre a guardada (a da primeira marcação). Imita o que a produção fazia (a releitura vinha com o
  // estado de antes da marcação): a tela não pode depender de a releitura vir fresca.
  const guardadas = new Map<
    string,
    { body: Buffer; headers: Record<string, string> }
  >()
  let congelar = false
  await page.route('**/_serverFn/**', async (route) => {
    const pedido = route.request()
    if (pedido.method() !== 'GET') return route.fallback()
    const velha = guardadas.get(pedido.url())
    if (congelar && velha) {
      return route.fulfill({
        status: 200,
        headers: velha.headers,
        body: velha.body,
      })
    }
    const resposta = await route.fetch()
    if (!congelar) {
      guardadas.set(pedido.url(), {
        body: await resposta.body(),
        headers: resposta.headers(),
      })
    }
    return route.fulfill({ response: resposta })
  })
  await page.goto('/painel/correcao')
  const aba = page.getByRole('link', { name: /^Aguardando correção \(\d+\)$/ })
  const contar = async () =>
    Number(/\((\d+)\)/.exec((await aba.textContent()) ?? '')?.[1])
  const antes = await contar()

  const cartao = page.getByRole('listitem').filter({ hasText: `Aula ${id}` })
  const primeira = cartao.getByRole('region', { name: `Pergunta 1 ${id}` })
  const segunda = cartao.getByRole('region', { name: `Pergunta 2 ${id}` })
  await esperarReact(primeira.getByRole('button', { name: 'Certa' }))

  // Sem recarregar a página: um marcador na janela some se houver F5.
  await page.evaluate(() => {
    ;(window as unknown as { semRecarga: boolean }).semRecarga = true
  })

  await primeira.getByRole('button', { name: 'Certa' }).click()
  await expect(page.getByText('Marcada como certa.')).toBeVisible()
  await expect(
    primeira.getByText('Certa', { exact: true }).first(),
  ).toBeVisible()
  await expect(cartao).toHaveCount(1)
  // A partir daqui toda releitura volta com o estado de agora: só a primeira resposta marcada.
  await expect.poll(() => guardadas.size).toBeGreaterThanOrEqual(3)
  congelar = true

  await segunda.getByRole('button', { name: 'Errada' }).click()
  await expect(cartao).toHaveCount(0)
  await expect.poll(contar).toBe(antes - 1)
  await expect(page.getByText(/Correção concluída: reprovada/)).toBeVisible()
  expect(
    await page.evaluate(
      () => (window as unknown as { semRecarga?: boolean }).semRecarga,
    ),
  ).toBe(true)
})
