import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { expect, type Page, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Página do curso (#97): botão principal pelo estado da aluna, módulos concluídos recolhidos,
// certificado no topo com a prévia e a conclusão do curso. Prints e axe em celular e desktop.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const app = path.resolve(aqui, '..')
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const userIdDe = (email: string) => `e2e-${email.replace(/\W/g, '-')}`

test.use({ bypassCSP: true })

const CAMPOS = JSON.stringify(
  [
    ['nome', 0.5, 0.45, 40],
    ['curso', 0.5, 0.58, 24],
    ['data', 0.5, 0.68, 16],
  ].map(([campo, x, y, tamanho]) => ({
    campo,
    lado: 'frente',
    x,
    y,
    tamanho,
    fonte: 'helvetica',
    negrito: false,
    cor: '#1a1a1a',
    alinhamento: 'centro',
  })),
)

function sql(comandos: string[], pasta: string) {
  mkdirSync(pasta, { recursive: true })
  const arquivo = path.join(pasta, `semente-${unico()}.sql`)
  writeFileSync(arquivo, `${comandos.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: app, encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao semear: ${r.stderr}`)
}

// PNG de faixas coloridas, gerado aqui (sem biblioteca): serve de capa e de arte do certificado.
function crc32(buf: Buffer) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}
function bloco(tipo: string, dados: Buffer) {
  const t = Buffer.concat([Buffer.from(tipo), dados])
  const len = Buffer.alloc(4)
  len.writeUInt32BE(dados.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(t))
  return Buffer.concat([len, t, crc])
}
function png(
  largura: number,
  altura: number,
  faixas: [number, number, number][],
) {
  const linhas: Buffer[] = []
  for (let y = 0; y < altura; y++) {
    const [r, g, b] = faixas[Math.floor((y / altura) * faixas.length)]
    const linha = Buffer.alloc(1 + largura * 3)
    for (let x = 0; x < largura; x++) linha.set([r, g, b], 1 + x * 3)
    linhas.push(linha)
  }
  const cab = Buffer.alloc(13)
  cab.writeUInt32BE(largura, 0)
  cab.writeUInt32BE(altura, 4)
  cab.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloco('IHDR', cab),
    bloco('IDAT', deflateSync(Buffer.concat(linhas))),
    bloco('IEND', Buffer.alloc(0)),
  ])
}
function subirImagem(chave: string, conteudo: Buffer, pasta: string) {
  mkdirSync(pasta, { recursive: true })
  const arquivo = path.join(pasta, `${unico()}.png`)
  writeFileSync(arquivo, conteudo)
  const r = spawnSync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `escola-arquivos/${chave}`,
      '--file',
      arquivo,
      '--local',
      '--content-type',
      'image/png',
    ],
    { cwd: app, encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao subir a imagem: ${r.stderr}`)
}

type Aula = { id: string; modulo: string }
/** Curso com `modulos` módulos e `aulasPorModulo` aulas cada, a aluna matriculada. */
function semearCurso(
  id: string,
  email: string,
  opcoes: {
    modulos: number
    aulasPorModulo: number
    nome?: string
    capa?: string
    pasta: string
  },
) {
  const aulas: Aula[] = []
  const linhas = [
    `INSERT INTO curso (id, nome, ordem${opcoes.capa ? ', capa_horizontal' : ''}) VALUES ('c-${id}', '${opcoes.nome ?? `Curso ${id}`}', 9000${opcoes.capa ? `, '${opcoes.capa}'` : ''})`,
  ]
  for (let m = 1; m <= opcoes.modulos; m++) {
    linhas.push(
      `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m${m}-${id}', 'c-${id}', 'Módulo ${m} ${id}', ${m})`,
    )
    for (let n = 1; n <= opcoes.aulasPorModulo; n++) {
      const aula = `a${m}x${n}-${id}`
      aulas.push({ id: aula, modulo: `m${m}-${id}` })
      linhas.push(
        `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('${aula}', 'm${m}-${id}', 'Aula ${m}.${n} ${id}', '<p>Texto</p>', ${n})`,
      )
    }
  }
  linhas.push(
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userIdDe(email)}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
  )
  sql(linhas, opcoes.pasta)
  return aulas
}

function concluir(aulas: string[], email: string, pasta: string) {
  const agora = Date.now()
  sql(
    aulas.map(
      (a, i) =>
        `INSERT INTO progresso_da_aula (id, user_id, aula_id, concluida_em, aberta_em) VALUES ('p-${a}', '${userIdDe(email)}', '${a}', ${agora - 1000 * (aulas.length - i)}, ${agora - 1000 * (aulas.length - i)})`,
    ),
    pasta,
  )
}

function darCertificado(
  id: string,
  email: string,
  nome: string,
  pasta: string,
) {
  const agora = Date.now()
  sql(
    [
      `INSERT INTO modelo_de_certificado (id, curso_id, ativo, frente, campos) VALUES ('mc-${id}', 'c-${id}', 1, 'conteudo/imagens/modelo/${id}.png', '${CAMPOS}')`,
      `INSERT INTO certificado (id, user_id, curso_id, codigo, nome, curso_nome, concluido_em, emitido_em, pdf_estado, pdf_chave) VALUES ('ct-${id}', '${userIdDe(email)}', 'c-${id}', 'ZC${id.replace(/\D/g, '').slice(-6)}', '${nome}', 'Curso ${id}', ${agora}, ${agora}, 'pronto', 'certificados/${id}.pdf')`,
    ],
    pasta,
  )
  subirImagem(
    `conteudo/imagens/modelo/${id}.png`,
    png(842, 595, [
      [250, 247, 240],
      [244, 239, 228],
    ]),
    pasta,
  )
}

test('o botão principal diz Começar, Continuar ou Rever, e os módulos concluídos ficam recolhidos', async ({
  page,
}, testInfo) => {
  const pasta = testInfo.outputPath('sementes')
  const id = unico()
  const email = `curso-botao-${id}@exemplo.test`
  cadastrarUsuario({ email })
  const aulas = semearCurso(id, email, {
    modulos: 3,
    aulasPorModulo: 2,
    pasta,
  })
  await entrarPorCodigo(page, email)

  // Nunca abriu: "Começar: <primeira aula>".
  await page.goto(`/cursos/c-${id}`)
  const botao = page.getByRole('main').getByRole('link', {
    name: `Começar: Aula 1.1 ${id}`,
  })
  await expect(botao).toHaveAttribute('href', `/aulas/a1x1-${id}`)
  // Curso sem modelo: nada sobre certificado.
  await expect(page.getByRole('region', { name: 'Certificado' })).toHaveCount(0)
  await expect(page.getByText('para o seu certificado')).toHaveCount(0)

  // Módulo 1 concluído: o botão continua no módulo 2, que fica aberto; o 1 fica recolhido.
  concluir(
    aulas.filter((a) => a.modulo === `m1-${id}`).map((a) => a.id),
    email,
    pasta,
  )
  await page.goto(`/cursos/c-${id}`)
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: `Continuar: Aula 2.1 ${id}` }),
  ).toHaveAttribute('href', `/aulas/a2x1-${id}`)
  await expect(
    page.getByRole('link', { name: new RegExp(`^Aula 2.2 ${id}`) }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: new RegExp(`^Aula 1.1 ${id}`) }),
  ).toBeHidden()
  // O que está recolhido abre com um toque no módulo.
  const modulo1 = page.getByRole('button', {
    name: new RegExp(`Módulo 1 ${id}`),
  })
  await esperarReact(modulo1)
  await modulo1.click()
  await expect(
    page.getByRole('link', { name: new RegExp(`^Aula 1.1 ${id}`) }),
  ).toBeVisible()

  // Terminou tudo, sem certificado: "Rever o curso", e tudo recolhido.
  concluir(
    aulas.filter((a) => a.modulo !== `m1-${id}`).map((a) => a.id),
    email,
    pasta,
  )
  await page.goto(`/cursos/c-${id}`)
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Rever o curso' }),
  ).toHaveAttribute('href', `/aulas/a1x1-${id}`)
  await expect(
    page.getByRole('link', { name: new RegExp(`^Aula 2.1 ${id}`) }),
  ).toBeHidden()
})

test('curso terminado com certificado: a prévia no topo e "Ver certificado" abre o certificado', async ({
  page,
}, testInfo) => {
  const pasta = testInfo.outputPath('sementes')
  const id = unico()
  const email = `curso-cert-${id}@exemplo.test`
  cadastrarUsuario({ email, nome: 'Aluna da Prévia' })
  const aulas = semearCurso(id, email, {
    modulos: 2,
    aulasPorModulo: 2,
    pasta,
  })
  concluir(
    aulas.map((a) => a.id),
    email,
    pasta,
  )
  darCertificado(id, email, 'Aluna da Prévia', pasta)
  await entrarPorCodigo(page, email)
  await page.goto(`/cursos/c-${id}`)

  const topo = page.getByRole('region', { name: 'Certificado' })
  await expect(topo.getByTestId('previa-do-certificado')).toContainText(
    'Aluna da Prévia',
  )
  await expect(topo.getByRole('link', { name: 'Baixar PDF' })).toHaveAttribute(
    'href',
    `/api/certificados/ct-${id}`,
  )
  const ver = page.getByRole('main').getByRole('button', {
    name: 'Ver certificado',
  })
  await esperarReact(ver)
  await expect(async () => {
    await ver.click()
    await expect(
      page.getByRole('dialog', { name: 'Seu certificado' }),
    ).toBeVisible({ timeout: 2000 })
  }).toPass()
  const janela = page.getByRole('dialog', { name: 'Seu certificado' })
  await expect(janela.getByTestId('previa-do-certificado')).toContainText(
    'Aluna da Prévia',
  )
  await expect(janela.getByRole('link', { name: 'Baixar PDF' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(janela).toBeHidden()
})

test('no celular, "Baixar certificado" fica em cima na conclusão do curso', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const pasta = testInfo.outputPath('sementes')
  const id = unico()
  const email = `curso-fim-${id}@exemplo.test`
  cadastrarUsuario({ email, nome: 'Aluna do Fim' })
  semearCurso(id, email, { modulos: 1, aulasPorModulo: 1, pasta })
  const agora = Date.now()
  sql(
    [
      `INSERT INTO modelo_de_certificado (id, curso_id, ativo, frente, campos) VALUES ('mc-${id}', 'c-${id}', 1, 'conteudo/imagens/modelo/${id}.png', '${CAMPOS}')`,
      `UPDATE user SET nome_confirmado_em = ${agora}, nome_no_certificado = 'Aluna do Fim' WHERE id = '${userIdDe(email)}'`,
    ],
    pasta,
  )
  subirImagem(
    `conteudo/imagens/modelo/${id}.png`,
    png(842, 595, [[250, 247, 240]]),
    pasta,
  )
  await entrarPorCodigo(page, email)
  await page.goto(`/aulas/a1x1-${id}`)
  const concluirAula = page.getByRole('button', { name: 'Concluir aula' })
  await esperarReact(concluirAula)
  await expect(async () => {
    await concluirAula.click()
    await expect(
      page.getByRole('dialog', { name: 'Curso concluído' }),
    ).toBeVisible({ timeout: 2000 })
  }).toPass()
  const conclusao = page.getByRole('dialog', { name: 'Curso concluído' })
  const baixar = conclusao.getByRole('link', { name: 'Baixar certificado' })
  await expect(baixar).toBeVisible({ timeout: 40_000 })
  const outros = [
    conclusao.getByRole('link', { name: 'Ver certificados' }),
    conclusao.getByRole('button', { name: 'Ficar nesta aula' }),
  ]
  const topoDoBaixar = (await baixar.boundingBox())?.y ?? 0
  for (const outro of outros) {
    expect((await outro.boundingBox())?.y ?? 0).toBeGreaterThan(topoDoBaixar)
  }
})

// ---------- Prints e axe ----------

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]

async function axe(page: Page, onde: string, portal = false) {
  const { AxeBuilder } = await import('@axe-core/playwright')
  const construtor = new AxeBuilder({ page })
  // O conteúdo de uma janela mora num portal fora das regiões da página (regra `region`, de boa prática).
  if (portal) construtor.disableRules(['region'])
  const r = await construtor.analyze()
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    `axe em ${onde}`,
  ).toEqual([])
}

for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`prints e axe do curso: ${tela.nome} ${modo}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(180_000)
      const pastaPrints =
        process.env.PRINTS_DIR ?? testInfo.outputPath('prints')
      mkdirSync(pastaPrints, { recursive: true })
      const pasta = testInfo.outputPath('sementes')
      await page.setViewportSize(tela.viewport)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      const foto = (nome: string) =>
        page.screenshot({
          path: path.join(pastaPrints, `${nome}-${tela.nome}-${modo}.png`),
        })

      const id = unico()
      const email = `curso-prints-${id}@exemplo.test`
      cadastrarUsuario({ email, nome: 'Aluna dos Prints' })

      // Extremo: título comprido, sem capa, 210 aulas, sem certificado.
      const extremo = `e${id}`
      semearCurso(extremo, email, {
        modulos: 7,
        aulasPorModulo: 30,
        nome: `Curso com um título bem comprido para testar a quebra de linha e o corte ${extremo}`,
        pasta,
      })
      // Com capa e certificado: dois módulos concluídos (recolhidos) e um em andamento.
      const cheio = `k${id}`
      subirImagem(
        `conteudo/imagens/capa/${cheio}.png`,
        png(640, 360, [
          [37, 99, 235],
          [234, 88, 12],
          [22, 163, 74],
        ]),
        pasta,
      )
      const aulas = semearCurso(cheio, email, {
        modulos: 3,
        aulasPorModulo: 3,
        capa: `conteudo/imagens/capa/${cheio}.png`,
        pasta,
      })
      concluir(
        aulas
          .filter((a) => !a.modulo.startsWith('m3'))
          .map((a) => a.id)
          .concat(aulas.filter((a) => a.modulo.startsWith('m3'))[0].id),
        email,
        pasta,
      )
      darCertificado(cheio, email, 'Aluna dos Prints', pasta)
      await entrarPorCodigo(page, email)

      await page.goto(`/cursos/c-${extremo}`)
      await expect(
        page.getByRole('main').getByRole('link', { name: /^Começar: / }),
      ).toBeVisible()
      await foto('curso-extremo')
      await axe(page, `curso extremo ${tela.nome} ${modo}`)

      await page.goto(`/cursos/c-${cheio}`)
      const continuar = page
        .getByRole('main')
        .getByRole('link', { name: /^Continuar: / })
      await expect(continuar).toBeVisible()
      await expect(
        page.getByRole('region', { name: 'Certificado' }),
      ).toBeVisible()
      await page.waitForTimeout(600)
      await foto('curso-com-certificado')
      await axe(page, `curso com certificado ${tela.nome} ${modo}`)

      await page
        .getByRole('region', { name: 'Certificado' })
        .getByRole('button', { name: /^Prévia do certificado/ })
        .click()
      const folha = page.getByRole('dialog', { name: 'Seu certificado' })
      await expect(folha).toBeVisible()
      await page.waitForTimeout(600)
      await foto('curso-certificado-aberto')
      await axe(page, `certificado aberto ${tela.nome} ${modo}`, true)
    })
  }
}
