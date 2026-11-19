import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  cadastrarUsuario,
  entrarPorCodigo,
  esperarReact,
  limparConfiguracaoDaArea,
} from '#e2e/helpers'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('aluno novo não vê tour, e o marcador de tour visto continua na conta', async ({
  page,
}) => {
  const email = `tour-${unico()}@exemplo.test`
  cadastrarUsuario({ email, tourVisto: false })
  await entrarPorCodigo(page, email)

  // A casca não abre mais o tour (#93).
  await esperarReact(
    page.getByRole('button', { name: 'Pesquisar aulas e vídeos' }),
  )
  await expect(page.getByTestId('tour')).toHaveCount(0)

  // O marcador continua existindo no banco (guardado para o vídeo de boas-vindas).
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
      `SELECT tour_visto_em FROM user WHERE email = '${email}'`,
    ],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  expect(r.status).toBe(0)
  expect(r.stdout).toContain('tour_visto_em')
})

test.use({ bypassCSP: true })

test('o nome salva sozinho ao sair do campo, com "Salvo" ao lado, e persiste ao recarregar', async ({
  page,
}) => {
  const email = `conta-nome-${unico()}@exemplo.test`
  cadastrarUsuario({ email })
  await entrarPorCodigo(page, email)
  await page.goto('/conta')
  await esperarReact(page.getByLabel('Nome', { exact: true }))
  // Sem botão de salvar.
  await expect(page.getByRole('button', { name: /Salvar/ })).toHaveCount(0)

  await page.getByLabel('Nome', { exact: true }).fill('Ana Souza Lima')
  await page.getByLabel('Sobre você').focus()
  await expect(page.getByTestId('estado-conta-nome')).toHaveText('Salvo')

  await page.reload()
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(
    'Ana Souza Lima',
  )
})

test('erro de validação aparece ao lado do campo e não trava a digitação', async ({
  page,
}) => {
  const email = `conta-erro-${unico()}@exemplo.test`
  cadastrarUsuario({ email })
  await entrarPorCodigo(page, email)
  await page.goto('/conta')
  const nome = page.getByLabel('Nome', { exact: true })
  await esperarReact(nome)

  await nome.fill('')
  await page.getByLabel('Sobre você').focus()
  await expect(page.getByTestId('erro-conta-nome')).toHaveText(
    'Informe o seu nome.',
  )
  // Digitar de novo tira o erro e segue normal.
  await nome.fill('Bia')
  await expect(page.getByTestId('erro-conta-nome')).toHaveCount(0)
  await page.getByLabel('Sobre você').focus()
  await expect(page.getByTestId('estado-conta-nome')).toHaveText('Salvo')
})

test('Minha conta guarda "Sobre você", telefone, fuso e a próxima aula sozinha, e sair vale só para este aparelho', async ({
  page,
  browser,
}) => {
  const email = `conta-${unico()}@exemplo.test`
  cadastrarUsuario({ email })
  await entrarPorCodigo(page, email)
  // Segundo aparelho, já conectado.
  const outroContexto = await browser.newContext()
  const outro = await outroContexto.newPage()
  await entrarPorCodigo(outro, email)

  await page.goto('/conta')
  await esperarReact(page.getByLabel('Sobre você'))
  await expect(
    page.getByText('Aparece para colegas no ranking e na comunidade.'),
  ).toBeVisible()
  await page.getByLabel('Sobre você').fill('Estudo estilo há dois anos.')
  await page.getByLabel('Nome', { exact: true }).focus()
  await expect(page.getByTestId('estado-conta-bio')).toHaveText('Salvo')

  // "Mais" começa recolhido; abre pelo botão.
  const mais = page.getByRole('button', { name: /^Mais/ })
  await expect(mais).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByLabel('Telefone')).toBeHidden()
  await mais.click()
  await expect(mais).toHaveAttribute('aria-expanded', 'true')
  await page.getByLabel('Telefone').fill('(11) 91234-5678')
  await page.getByLabel('Fuso horário').selectOption('Europe/Lisbon')
  await expect(page.getByTestId('estado-conta-fuso')).toHaveText('Salvo')
  await page.getByLabel('Sobre você').focus()
  await expect(page.getByTestId('estado-conta-telefone')).toHaveText('Salvo')
  // A próxima aula começa sozinha por padrão; ela desliga.
  const proxima = page.getByRole('checkbox', {
    name: /Começar a próxima aula sozinha/,
  })
  await expect(proxima).toBeChecked()
  await proxima.click()
  await expect(page.getByTestId('estado-conta-proxima-aula')).toHaveText(
    'Salvo',
  )

  await page.reload()
  await expect(page.getByLabel('Sobre você')).toHaveValue(
    'Estudo estilo há dois anos.',
  )
  const maisDepois = page.getByRole('button', { name: /^Mais/ })
  await esperarReact(maisDepois)
  await maisDepois.click()
  await expect(page.getByLabel('Telefone')).toHaveValue('11912345678')
  await expect(page.getByLabel('Fuso horário')).toHaveValue('Europe/Lisbon')
  await expect(
    page.getByRole('checkbox', { name: /Começar a próxima aula sozinha/ }),
  ).not.toBeChecked()

  // Foto: um PNG mínimo, que aparece na hora.
  await esperarReact(page.getByTestId('campo-foto'))
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.getByTestId('campo-foto').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(page.getByRole('button', { name: 'Remover' })).toBeVisible()
  await expect(page.getByTestId('anel-da-foto')).toHaveCount(0)
  await expect(page.getByTestId('erro-foto')).toHaveCount(0)

  await page.getByRole('button', { name: 'Sair deste aparelho' }).click()
  await expect(page).toHaveURL(/\/login|\/$/)
  // O outro aparelho continua conectado.
  await outro.goto('/conta')
  await expect(outro.getByRole('heading', { name: 'Sua conta' })).toBeVisible()
  await outroContexto.close()
})

test('foto fora do formato mostra o motivo ao lado da foto', async ({
  page,
}) => {
  const email = `conta-foto-${unico()}@exemplo.test`
  cadastrarUsuario({ email })
  await entrarPorCodigo(page, email)
  await page.goto('/conta')
  await esperarReact(page.getByTestId('campo-foto'))
  await page.getByTestId('campo-foto').setInputFiles({
    name: 'foto.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('oi'),
  })
  await expect(page.getByTestId('erro-foto')).toHaveText(
    'Envie a foto em PNG, JPEG, WebP ou GIF.',
  )
})

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]
for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`prints e axe da conta: ${tela.nome} ${modo}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(tela.viewport)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      const email = `conta-prints-${unico()}@exemplo.test`
      // Dados extremos: nome muito longo e "Sobre você" cheio.
      cadastrarUsuario({
        email,
        nome: 'Maria Aparecida de Nazaré Albuquerque Vasconcelos Fernandes Teixeira',
      })
      await entrarPorCodigo(page, email)
      await page.goto('/conta')
      await esperarReact(page.getByLabel('Sobre você'))
      await page.getByLabel('Sobre você').fill('x'.repeat(480))
      await page.getByLabel('Nome', { exact: true }).focus()
      await expect(page.getByTestId('estado-conta-bio')).toHaveText('Salvo')
      // O "Salvo" aparece com um esmaecimento; o axe só mede o contraste depois dele.
      await expect(page.getByTestId('estado-conta-bio')).toHaveCSS(
        'opacity',
        '1',
      )
      const pasta = process.env.PRINTS_DIR ?? testInfo.outputDir
      mkdirSync(pasta, { recursive: true })
      const { AxeBuilder } = await import('@axe-core/playwright')
      const checar = async (onde: string) => {
        const r = await new AxeBuilder({ page }).analyze()
        expect(
          r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
          `axe em ${onde}`,
        ).toEqual([])
      }
      await checar('topo')
      await page.screenshot({
        path: path.join(pasta, `conta-${tela.nome}-${modo}-fechada.png`),
        fullPage: true,
      })
      const maisBotao = page.getByRole('button', { name: /^Mais/ })
      await esperarReact(maisBotao)
      await maisBotao.click()
      await expect(page.getByLabel('Telefone')).toBeVisible()
      await page.waitForTimeout(500)
      await checar('mais aberto')
      await page.screenshot({
        path: path.join(pasta, `conta-${tela.nome}-${modo}-aberta.png`),
        fullPage: true,
      })
    })
  }
}

test('o Proprietário edita os Termos e o novo aceite é pedido ao aluno', async ({
  page,
  browser,
}) => {
  limparConfiguracaoDaArea()
  const id = unico()
  const dono = `dono-${id}@exemplo.test`
  const aluno = `aluno-${id}@exemplo.test`
  cadastrarUsuario({ email: dono, perfil: 'proprietario' })
  cadastrarUsuario({ email: aluno })
  const contexto = await browser.newContext()
  const alunoPage = await contexto.newPage()
  await entrarPorCodigo(alunoPage, aluno)
  await alunoPage.goto('/')
  await expect(alunoPage).toHaveURL(/\/$/)

  await entrarPorCodigo(page, dono)
  await page.goto('/painel/configuracoes')
  await esperarReact(page.getByLabel('E-mail de suporte'))
  await page.getByLabel('Texto', { exact: true }).first().fill(`Termos ${id}`)
  await page.getByLabel('E-mail de suporte').fill('ajuda@escola.test')
  await page.getByLabel('Pedir novo aceite de todos os alunos').check()
  await page.getByRole('button', { name: 'Salvar configurações' }).click()
  await expect(page.getByText(/aceitar os Termos de novo/)).toBeVisible()

  // Página pública lê do banco.
  const publica = await browser.newPage()
  await publica.goto('/termos')
  await expect(publica.getByText(`Termos ${id}`)).toBeVisible()
  await expect(publica.getByText('ajuda@escola.test')).toBeVisible()
  await publica.close()

  // O aluno, que já tinha aceitado, é levado a aceitar de novo.
  await alunoPage.goto('/')
  await expect(alunoPage).toHaveURL(/\/primeiro-acesso/)
  await esperarReact(alunoPage.getByLabel(/Li e aceito/))
  await alunoPage.getByLabel(/Li e aceito/).check()
  await alunoPage.getByRole('button', { name: 'Continuar' }).click()
  await expect(alunoPage).toHaveURL(/\/$/)
  await contexto.close()
  limparConfiguracaoDaArea()
})
