// Mede os pedidos que cada tela do painel (Estúdio) faz ao abrir, pela navegação do lado do cliente.
// Serve para achar tela que faz pedido demais ou em fila (cada "rodada" é uma viagem inteira ao servidor).
// Roda DENTRO do navegador, no app, com um usuário da equipe logado.
//
// COMO USAR (passo a passo)
//  1. Entre no app (local: http://localhost:3040, ou o ambiente de teste) como Proprietário ou Equipe e
//     abra `/painel`. Espere a tela carregar.
//  2. Abra o console do navegador (Chrome: Cmd+Option+J no Mac, Ctrl+Shift+J no Windows).
//  3. Cole TODO este arquivo e aperte Enter. (Na primeira vez o Chrome pede para digitar
//     "allow pasting" antes de aceitar a colagem.)
//  4. Espere a mensagem "Pronto". Cada tela leva uns 2 a 4 segundos. No fim o console mostra uma tabela
//     por passada (uma linha por tela) e a lista dos pedidos de cada tela. O resultado inteiro, em JSON,
//     fica em `window.__medidaDoPainel`.
//
// DUAS PASSADAS (opcional): antes de colar, no mesmo console, defina `window.PASSADAS = 2`. Ele visita
// todas as telas duas vezes e mede cada passada separada: a segunda mostra o efeito do cache e da memória
// entre telas.
//
// COMO MEDE: embrulha `window.fetch` (e o restaura no fim) e, para cada link do menu do painel, CLICA
// nele (navegação do lado do cliente, sem recarregar a página; o clique é um `link.click()`, então o
// ponteiro do mouse não passa por cima de nada e não há pré-carregamento por hover). Depois espera a rede
// ficar quieta (nenhum pedido aberto por 1,5 s) e anota os pedidos: nome da server function, método,
// status e ms (até o fim do corpo da resposta). "Rodadas" = profundidade da maior fila de leituras (GET)
// que começaram antes da primeira gravação (POST): um pedido que só começa depois de outro terminar
// conta uma rodada a mais. A tela em que a página já está é visitada por último (clicar no link da
// própria tela não abriria nada novo). Pedidos periódicos (o sininho, os contadores das filas) aparecem
// na lista com `periodico: true`, mas não entram na contagem de pedidos nem de rodadas.
//
// DETALHES: depois de medir /painel/alunos, /painel/atendimento e /painel/conteudo, se a lista tiver um
// link para o detalhe (`/painel/alunos/<id>` etc.), ele clica no primeiro e mede também. Telas com
// parâmetro que não têm link na lista ficam de fora. Para mudar quais listas têm detalhe, defina antes
// `window.DETALHES = ['/painel/alunos']`.
//
// O snippet só LÊ: navega pelo menu e observa os pedidos que o próprio app faz. Não altera nada e não
// envia nada para fora do navegador.
//
// TELAS FORA (conferido nos loaders, GET sem serviço externo): nenhuma saiu. Os GET de todas as telas do
// menu só leem o D1 (o único arquivo com `fetch` externo é `src/lib/email.ts`, usado em gravações).
;(async () => {
  const QUIETO_MS = 1500
  const LIMITE_POR_TELA_MS = 25000
  const PERIODICOS = ['sininhoFn', 'contadoresDasFilasFn']
  // Ferramenta de desenvolvimento (devtools do TanStack): não é do app.
  const ehDeDev = (nome) => nome.startsWith('/__tsd')
  const PASSADAS = Math.max(1, Number(window.PASSADAS) || 1)
  const DETALHES = window.DETALHES || [
    '/painel/alunos',
    '/painel/atendimento',
    '/painel/conteudo',
  ]

  if (!location.pathname.startsWith('/painel')) {
    console.error('Abra /painel (logado na equipe) antes de colar o snippet.')
    return
  }

  const espera = (ms) => new Promise((r) => setTimeout(r, ms))

  // --- registro dos pedidos --------------------------------------------------------------------
  const pedidos = []
  let abertos = 0
  let ultimaAtividade = performance.now()

  // O id da server function é base64url de um JSON com `export`: "<nome>_createServerFn_handler".
  function nomeDoPedido(url) {
    const caminho = new URL(url, location.origin).pathname
    if (!caminho.startsWith('/_serverFn/')) return caminho
    const id = caminho.slice('/_serverFn/'.length)
    try {
      const b64 = id.replace(/-/g, '+').replace(/_/g, '/')
      const texto = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))
      const nome = /"export":"([^"]+)"/.exec(texto)?.[1]
      return nome ? nome.replace(/_createServerFn_handler$/, '') : id
    } catch {
      return id
    }
  }

  const fetchOriginal = window.fetch
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url || String(input)
    const mesmaOrigem = new URL(url, location.origin).origin === location.origin
    if (!mesmaOrigem) return fetchOriginal.call(this, input, init)
    const metodo = (
      init?.method ||
      (typeof input !== 'string' && input.method) ||
      'GET'
    ).toUpperCase()
    const nome = nomeDoPedido(url)
    const p = {
      nome,
      metodo,
      status: null,
      inicio: performance.now(),
      fim: Number.POSITIVE_INFINITY,
      ms: null,
      periodico: PERIODICOS.includes(nome) || ehDeDev(nome),
    }
    pedidos.push(p)
    abertos++
    ultimaAtividade = performance.now()
    const terminar = () => {
      if (p.fim !== Number.POSITIVE_INFINITY) return
      p.fim = performance.now()
      p.ms = Math.round(p.fim - p.inicio)
      abertos--
      ultimaAtividade = p.fim
    }
    try {
      const resposta = await fetchOriginal.call(this, input, init)
      p.status = resposta.status
      // O corpo termina depois dos cabeçalhos: mede até o fim dele numa cópia.
      resposta.clone().arrayBuffer().then(terminar, terminar)
      return resposta
    } catch (erro) {
      p.status = 'erro'
      terminar()
      throw erro
    }
  }

  // --- rodadas (mesmo cálculo de e2e/rodadas.spec.ts) -------------------------------------------
  function rodadasDe(lista) {
    const corte = Math.min(
      Number.POSITIVE_INFINITY,
      ...lista.filter((p) => p.metodo === 'POST').map((p) => p.inicio),
    )
    const leituras = lista
      .filter((p) => !p.periodico && p.metodo === 'GET' && p.inicio < corte)
      .sort((a, b) => a.inicio - b.inicio)
    const nivel = []
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
    return Math.max(0, ...nivel)
  }

  // --- navegação -------------------------------------------------------------------------------
  function linksDoMenu() {
    const vistos = new Set()
    const achados = []
    for (const a of document.querySelectorAll(
      'nav a[href^="/painel"], nav a[href^="/estudio"]',
    )) {
      const href = a.getAttribute('href')
      if (!href || href === '/painel' || href.includes('$') || vistos.has(href))
        continue
      vistos.add(href)
      achados.push(href)
    }
    return achados
  }

  async function esperarRedeQuieta(desde) {
    const limite = performance.now() + LIMITE_POR_TELA_MS
    while (performance.now() < limite) {
      await espera(100)
      if (
        abertos === 0 &&
        performance.now() - Math.max(ultimaAtividade, desde) >= QUIETO_MS
      )
        return true
    }
    return false
  }

  // Clica no link (navegação do cliente), espera chegar na rota e a rede aquietar.
  async function visitar(link, caminho) {
    const desde = performance.now()
    const antes = pedidos.length
    link.click()
    const limite = performance.now() + 10000
    while (
      !location.pathname.startsWith(caminho.split('?')[0]) &&
      performance.now() < limite
    )
      await espera(50)
    const quieta = await esperarRedeQuieta(desde)
    const meus = pedidos.slice(antes)
    const contados = meus.filter((p) => !p.periodico)
    return {
      caminho,
      chegou: location.pathname.startsWith(caminho.split('?')[0]),
      quieta,
      pedidos: meus.map((p) => ({
        nome: p.nome,
        metodo: p.metodo,
        status: p.status,
        ms: p.ms,
        periodico: p.periodico,
      })),
      nPedidos: contados.length,
      rodadas: rodadasDe(meus),
      msAteQuieta: Math.round(performance.now() - desde - QUIETO_MS),
    }
  }

  const errosDaPagina = []
  const aoErrar = (e) => errosDaPagina.push(String(e.message || e.reason || e))
  window.addEventListener('error', aoErrar)
  window.addEventListener('unhandledrejection', aoErrar)
  const resultado = { quando: new Date().toISOString(), passadas: [] }
  try {
    for (let n = 1; n <= PASSADAS; n++) {
      const telas = []
      let hrefs = linksDoMenu()
      // Telas de /estudio têm outra casca (sem o menu do painel): vão por último e, antes da próxima
      // passada, volta-se ao painel por um link `/painel` da própria página.
      if (!document.querySelector('nav a[href^="/painel"]')) {
        const volta = document.querySelector('a[href^="/painel"]')
        if (volta) volta.click()
        else history.back()
        await espera(QUIETO_MS * 2)
        hrefs = linksDoMenu()
      }
      // A tela onde a página já está fica por último.
      const aqui = hrefs.find(
        (h) => location.pathname === h || location.pathname.startsWith(`${h}/`),
      )
      if (aqui) hrefs = [...hrefs.filter((h) => h !== aqui), aqui]
      hrefs = [
        ...hrefs.filter((h) => !h.startsWith('/estudio')),
        ...hrefs.filter((h) => h.startsWith('/estudio')),
      ]
      for (const href of hrefs) {
        const link = document.querySelector(`nav a[href="${href}"]`)
        if (!link) {
          // Sem o menu na página (erro de tela, outra casca): anota o que há na tela e tenta voltar.
          telas.push({
            caminho: href,
            erro: `link do menu não encontrado em ${location.pathname}: ${(document.body.textContent || '').slice(0, 160).replace(/\s+/g, ' ')}`,
            pedidos: [],
            nPedidos: 0,
            rodadas: 0,
            quieta: false,
          })
          history.back()
          await espera(QUIETO_MS * 2)
          continue
        }
        telas.push(await visitar(link, href))
        if (DETALHES.includes(href)) {
          const detalhe = document.querySelector(`main a[href^="${href}/"]`)
          if (detalhe) {
            telas.push(await visitar(detalhe, detalhe.getAttribute('href')))
          }
        }
      }
      resultado.passadas.push({ passada: n, telas })
    }
  } finally {
    window.fetch = fetchOriginal
    window.removeEventListener('error', aoErrar)
    window.removeEventListener('unhandledrejection', aoErrar)
  }

  resultado.erros = errosDaPagina
  window.__medidaDoPainel = resultado
  for (const { passada, telas } of resultado.passadas) {
    console.log(`PASSADA ${passada}`)
    console.table(
      telas.map((t) => ({
        tela: t.caminho,
        pedidos: t.nPedidos,
        rodadas: t.rodadas,
        nomes: t.pedidos
          .map((p) => `${p.nome}${p.periodico ? '*' : ''}`)
          .join(', '),
        msAteQuieta: t.msAteQuieta,
        aviso: t.erro || (t.quieta ? '' : 'NÃO AQUIETOU'),
      })),
    )
  }
  console.log(
    '* = periódico (fora da contagem). JSON em window.__medidaDoPainel',
  )
  console.log('Pronto')
})()
