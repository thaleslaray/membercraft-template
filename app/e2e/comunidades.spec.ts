import { expect, test } from '@playwright/test'
import {
  cadastrarUsuario,
  criarEdicaoDoCurso,
  entrarPorCodigo,
  esperarReact,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('a equipe cria a comunidade, a aluna publica, a equipe responde e a aluna marca a melhor resposta', async ({
  page,
  browser,
}) => {
  const id = unico()
  const equipe = `equipe-${id}@exemplo.test`
  const ana = `ana-${id}@exemplo.test`
  cadastrarUsuario({ email: equipe, perfil: 'equipe' })
  await entrarPorCodigo(page, equipe)

  // Curso, turma e matrícula da aluna.
  await page.goto('/painel/conteudo')
  await esperarReact(page.getByLabel('Nome do novo curso'))
  await page.getByLabel('Nome do novo curso').fill(`Curso ${id}`)
  await page.getByRole('button', { name: 'Criar curso' }).click()
  await expect(page).toHaveURL(/\/painel\/conteudo\/[\w-]+$/)
  await criarEdicaoDoCurso(page, `Curso ${id}`, `Turma ${id}`)
  await page.goto('/painel/matricular')
  await esperarReact(page.getByLabel('E-mails dos alunos'))
  await page
    .getByLabel('Turma', { exact: true })
    .selectOption({ label: `Curso ${id} · Turma ${id}` })
  await page.getByLabel('E-mails dos alunos').fill(`${ana}, Ana Souza`)
  await page.getByRole('button', { name: 'Matricular' }).click()
  await expect(
    page.getByLabel('Resumo da matrícula manual').getByText('Matriculados: 1'),
  ).toBeVisible()

  // Comunidade restrita à turma.
  await page.goto('/painel/comunidades')
  await esperarReact(page.getByLabel('Nome', { exact: true }))
  await page.getByLabel('Nome', { exact: true }).fill(`Dúvidas ${id}`)
  await page.getByLabel(/Restrita/).check()
  await page.getByLabel(`Curso ${id} · Turma ${id}`).click()
  await page.getByRole('button', { name: 'Criar comunidade' }).click()
  await expect(page.getByText('Comunidade criada.')).toBeVisible()
  await expect(page.getByText(`Dúvidas ${id}`)).toBeVisible()

  // A aluna entra, aceita os termos e publica.
  const contexto = await browser.newContext()
  const aluna = await contexto.newPage()
  await entrarPorCodigo(aluna, ana)
  await expect(async () => {
    const caixa = aluna.getByRole('checkbox')
    if ((await caixa.getAttribute('data-state')) !== 'checked') {
      await caixa.click()
    }
    await expect(aluna.getByRole('button', { name: 'Continuar' })).toBeEnabled({
      timeout: 1000,
    })
  }).toPass()
  await aluna.getByRole('button', { name: 'Continuar' }).click()
  await expect(aluna).toHaveURL(/\/$/)
  await aluna.goto('/comunidades')
  // Mural direto, sem escolher comunidade antes; "Pergunte ou compartilhe algo" abre o formulário.
  // Num mural vazio a tela vazia repete o convite (#107): o campo é o do compositor.
  const campo = aluna
    .getByRole('region', { name: 'Publicar no mural' })
    .getByRole('button', { name: 'Pergunte ou compartilhe algo' })
  await esperarReact(campo)
  await campo.click()
  await expect(aluna.getByLabel('Título')).toBeFocused()
  const escolha = aluna.getByLabel('Comunidade', { exact: true }).first()
  if (await escolha.isVisible()) {
    await escolha.selectOption({ label: `Dúvidas ${id}` })
  }
  // Cancelar guarda o rascunho; ao reabrir, o texto continua lá.
  await aluna.getByLabel('Título').fill(`Rascunho ${id}`)
  await aluna.getByRole('button', { name: 'Cancelar' }).click()
  await aluna.reload()
  const continuar = aluna.getByRole('button', {
    name: `Continuar: Rascunho ${id}`,
  })
  await esperarReact(continuar)
  await continuar.click()
  await expect(aluna.getByLabel('Título')).toHaveValue(`Rascunho ${id}`)
  const escolha2 = aluna.getByLabel('Comunidade', { exact: true }).first()
  if (await escolha2.isVisible()) {
    await escolha2.selectOption({ label: `Dúvidas ${id}` })
  }
  await aluna.getByLabel('Título').fill(`Como diluir ${id}?`)
  await aluna.getByRole('textbox', { name: 'Texto da publicação' }).click()
  await aluna.keyboard.type('Preciso de ajuda com a proporção.')
  await aluna.getByLabel('Escolher anexo').setInputFiles({
    name: 'receita.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('uma parte de oxidante'),
  })
  await expect(aluna.getByText('receita.txt')).toBeVisible()
  await aluna.getByRole('button', { name: 'Publicar' }).dblclick()
  // A publicação aparece no topo do mural na hora, sem sair dele.
  await expect(aluna).toHaveURL(/\/comunidades$/)
  const nova = aluna.getByRole('listitem').filter({
    has: aluna.getByRole('heading', { name: `Como diluir ${id}?` }),
  })
  await expect(nova).toBeVisible()
  await expect(nova.getByText('Publicada')).toBeVisible()
  await nova.getByRole('link').click()
  await expect(aluna).toHaveURL(/\/comunidades\/publicacoes\//)
  await expect(
    aluna.getByRole('heading', { name: `Como diluir ${id}?` }),
  ).toBeVisible()
  await expect(aluna.getByText('Em aberto')).toBeVisible()
  const anexo = aluna.getByRole('link', { name: /receita\.txt/ })
  const resposta = await aluna.request.get(
    (await anexo.getAttribute('href')) ?? '',
  )
  expect(await resposta.text()).toBe('uma parte de oxidante')

  // Clique duplo não duplica: só uma publicação na lista.
  await aluna.goto('/comunidades')
  await expect(
    aluna.getByRole('heading', { name: `Como diluir ${id}?` }),
  ).toHaveCount(1)

  // A equipe vê a publicação na fila e responde.
  await page.goto('/painel/aguardando-resposta')
  await page.getByRole('link', { name: `Como diluir ${id}?` }).click()
  await esperarReact(page.getByLabel('Escreva um comentário'))
  await page.getByLabel('Escreva um comentário').fill('Use 1 para 1.')
  await page.getByRole('button', { name: 'Comentar' }).click()
  await expect(page.getByText('Use 1 para 1.')).toBeVisible()

  // A aluna é avisada no sininho e marca a melhor resposta.
  await aluna.goto('/comunidades')
  await aluna
    .getByRole('link', { name: new RegExp(`Como diluir ${id}`) })
    .click()
  await expect(aluna.getByText('Use 1 para 1.')).toBeVisible()
  const melhor = aluna.getByRole('button', {
    name: 'Melhor resposta',
    exact: true,
  })
  await esperarReact(melhor)
  await melhor.click()
  await expect(aluna.getByText('Resolvida').first()).toBeVisible()
  await aluna.goto('/comunidades')
  const resolvidas = aluna.getByRole('button', { name: 'Resolvidas' })
  await esperarReact(resolvidas)
  await resolvidas.click()
  await expect(aluna).toHaveURL(/status=resolvidas/)
  await expect(
    aluna.getByRole('heading', { name: `Como diluir ${id}?` }),
  ).toBeVisible()
  // "Sem resposta" tira a publicação que já foi resolvida.
  await aluna.getByRole('button', { name: 'Sem resposta' }).click()
  await expect(aluna).toHaveURL(/status=sem-resposta/)
  await expect(
    aluna.getByRole('heading', { name: `Como diluir ${id}?` }),
  ).toHaveCount(0)
})
