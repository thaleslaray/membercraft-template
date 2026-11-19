import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('a equipe cadastra um curso e assiste; o material só baixa com sessão e acesso', async ({
  page,
  browser,
  request,
}) => {
  const id = unico()
  const equipe = `equipe-${id}@exemplo.test`
  cadastrarUsuario({ email: equipe, perfil: 'equipe' })
  await entrarPorCodigo(page, equipe)

  // Categoria e curso.
  await page.goto('/painel/conteudo')
  await esperarReact(page.getByLabel('Nome da nova categoria'))
  await page.getByLabel('Nome da nova categoria').fill(`Categoria ${id}`)
  await page.getByRole('button', { name: 'Criar categoria' }).click()
  await expect(
    page.getByLabel(`Nome da categoria Categoria ${id}`),
  ).toBeVisible()

  await page.getByLabel('Nome do novo curso').fill(`Curso ${id}`)
  await page.getByRole('button', { name: 'Criar curso' }).click()
  await expect(page).toHaveURL(/\/painel\/conteudo\/[\w-]+$/)
  const urlDoCurso = page.url()

  await page.getByLabel('Categoria', { exact: true }).selectOption({
    label: `Categoria ${id}`,
  })
  await page.getByLabel('Carga horária (horas)').fill('12')
  await page.getByLabel('Descrição').fill('Um curso de teste.')
  await page.getByRole('button', { name: 'Salvar curso' }).click()
  await expect(page.getByText('Curso salvo.')).toBeVisible()

  // "Mostrar a todos" sem URL de vendas é recusado.
  await page.getByLabel('Mostrar a todos na vitrine').click()
  await page.getByRole('button', { name: 'Salvar curso' }).click()
  await expect(page.getByText(/URL da página de vendas/).last()).toBeVisible()
  await page
    .getByLabel('URL da página de vendas')
    .fill('https://loja.exemplo.test/curso')
  await page.getByRole('button', { name: 'Salvar curso' }).click()
  await expect(page.getByText('Curso salvo.').last()).toBeVisible()

  // Módulos e aulas, com ordem.
  await page.getByLabel('Nome do novo módulo').fill('Módulo A')
  await page.getByRole('button', { name: 'Criar módulo' }).click()
  await expect(page.getByText('Módulo criado.')).toBeVisible()
  await expect(page.getByLabel('Nome do novo módulo')).toHaveValue('')
  await page.getByLabel('Nome do novo módulo').fill('Módulo B')
  await page.getByRole('button', { name: 'Criar módulo' }).click()
  await page.getByRole('button', { name: 'Subir módulo Módulo B' }).click()
  await expect(page.locator('[data-slot="card-title"]').nth(1)).toHaveText(
    'Módulo B',
  )

  await page
    .locator('button[aria-expanded]')
    .filter({ hasText: 'Módulo A' })
    .click()
  await page.getByLabel('Título da nova aula em Módulo A').fill('Boas-vindas')
  await page
    .locator('form')
    .filter({ has: page.getByLabel('Título da nova aula em Módulo A') })
    .getByRole('button', { name: 'Criar aula' })
    .click()
  await expect(page).toHaveURL(/\/painel\/aulas\//)

  await page
    .getByLabel('Vídeo do Vimeo')
    .fill('https://vimeo.com/76979871/a1b2c3d4e5')
  await page.getByRole('button', { name: 'HTML', exact: true }).click()
  await page
    .getByLabel('Texto da aula (HTML)')
    .fill(
      '<p>Texto da aula</p><script>window.xss=1</script><a data-botao href="https://exemplo.com/grupo" onclick="window.xss=1">ENTRAR</a>',
    )
  await page.getByRole('button', { name: 'Salvar aula' }).click()
  await expect(page.getByText('Aula salva.')).toBeVisible()

  await page.getByLabel('Escolher material').setInputFiles({
    name: 'Guia de Estilo.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 conteúdo de teste'),
  })
  await expect(page.getByText('Material anexado.')).toBeVisible()
  const hrefDoMaterial = await page
    .getByRole('link', { name: 'Baixar Guia de Estilo.pdf' })
    .getAttribute('href')
  expect(hrefDoMaterial).toMatch(/^\/api\/materiais\/[\w-]+$/)

  // O aluno-equipe assiste: vitrine -> curso -> aula.
  await page.goto('/')
  await page.getByRole('link', { name: new RegExp(`Curso ${id}`) }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: `Curso ${id}` }),
  ).toBeVisible()
  await expect(page.getByText('12h', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Começar' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Boas-vindas' }),
  ).toBeVisible()
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    'https://player.vimeo.com/video/76979871?h=a1b2c3d4e5',
  )
  // O iframe do Vimeo não pode sumir depois da hidratação (o StrictMode monta o efeito duas vezes).
  await page.waitForTimeout(5000)
  await expect(page.locator('iframe')).toBeVisible()
  await expect(page.getByText('Texto da aula')).toBeVisible()
  const botao = page.getByRole('link', { name: 'ENTRAR' })
  await expect(botao).toHaveClass(/botao/)
  await expect(botao).toHaveAttribute('href', 'https://exemplo.com/grupo')
  expect(
    await page.evaluate(() => (window as { xss?: number }).xss),
  ).toBeUndefined()

  // Download com sessão de quem tem acesso.
  const baixado = await page.request.get(hrefDoMaterial as string)
  expect(baixado.status()).toBe(200)
  expect(baixado.headers()['content-disposition']).toContain('attachment')
  expect(await baixado.text()).toContain('conteúdo de teste')

  // Sem sessão: 401. Aluno sem matrícula: não acha.
  expect((await request.get(hrefDoMaterial as string)).status()).toBe(401)
  const aluno = `aluno-${id}@exemplo.test`
  cadastrarUsuario({ email: aluno })
  const contexto = await browser.newContext()
  const paginaDoAluno = await contexto.newPage()
  await entrarPorCodigo(paginaDoAluno, aluno)
  expect(
    (await paginaDoAluno.request.get(hrefDoMaterial as string)).status(),
  ).toBe(404)
  await paginaDoAluno.goto('/painel/conteudo')
  await expect(paginaDoAluno).toHaveURL(/\/$/)
  await paginaDoAluno.goto(urlDoCurso.replace('/painel/conteudo/', '/cursos/'))
  await expect(
    paginaDoAluno.getByRole('heading', { name: `Curso ${id}` }),
  ).toHaveCount(0)
  await contexto.close()
})
