import { expect, test } from '@playwright/test'
import {
  cadastrarUsuario,
  entrarPorCodigo,
  esperarReact,
  limparAparencia,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// A aparência vale para todos: cada teste deixa o padrão (Comunidade ligada) para os outros specs.
test.afterEach(() => limparAparencia())

test('com a Comunidade desligada no painel, o aluno vê Falar com a equipe no lugar e /comunidades vai ao Início', async ({
  browser,
}) => {
  const dona = `dona-${unico()}@exemplo.test`
  const aluno = `aluno-${unico()}@exemplo.test`
  cadastrarUsuario({ email: dona, perfil: 'proprietario' })
  cadastrarUsuario({ email: aluno })

  // Painel: desliga e salva.
  const contextoDona = await browser.newContext()
  const paginaDona = await contextoDona.newPage()
  await entrarPorCodigo(paginaDona, dona)
  await paginaDona.goto('/estudio/aparencia')
  const interruptor = paginaDona.getByRole('checkbox', {
    name: 'Mostrar Comunidade no menu do aluno',
  })
  await esperarReact(interruptor)
  await expect(interruptor).toBeChecked()
  await interruptor.click()
  await paginaDona.getByRole('button', { name: 'Salvar aparência' }).click()
  await expect(paginaDona.getByText('Aparência salva')).toBeVisible()

  // Aluno: o menu troca e a rota antiga volta ao Início.
  const contextoAluno = await browser.newContext()
  const page = await contextoAluno.newPage()
  await entrarPorCodigo(page, aluno)
  await page.goto('/')
  const destinos = page.getByRole('navigation', { name: 'Destinos' })
  await expect(
    destinos.getByRole('link', { name: 'Meus cursos' }),
  ).toBeVisible()
  await expect(destinos.getByRole('link', { name: 'Comunidade' })).toHaveCount(
    0,
  )
  const equipe = destinos.getByRole('link', { name: 'Falar com a equipe' })
  await expect(equipe).toHaveAttribute('href', '/atendimento')
  await equipe.click()
  await expect(page).toHaveURL(/\/atendimento$/)

  for (const rota of ['/comunidades', '/comunidades/nova']) {
    await page.goto(rota)
    await expect(page).toHaveURL(/\/$/)
  }

  // Religa pelo painel: a Comunidade volta.
  await paginaDona.reload()
  const religar = paginaDona.getByRole('checkbox', {
    name: 'Mostrar Comunidade no menu do aluno',
  })
  await esperarReact(religar)
  await expect(religar).not.toBeChecked()
  await religar.click()
  await paginaDona.getByRole('button', { name: 'Salvar aparência' }).click()
  await expect(paginaDona.getByText('Aparência salva')).toBeVisible()
  await page.goto('/comunidades')
  await expect(page).toHaveURL(/\/comunidades$/)

  await contextoDona.close()
  await contextoAluno.close()
})
