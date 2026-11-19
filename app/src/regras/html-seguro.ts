// Limpa o HTML do texto da aula antes de gravar: só entram as marcações da lista abaixo, com os
// atributos permitidos. Tudo o mais (script, estilo, eventos, javascript:) é descartado. Quem
// escreve é a equipe, mas o texto é mostrado a todos os alunos, então não confiamos no que veio.

const TAGS = new Set([
  'p',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'a',
  'img',
])
const VAZIAS = new Set(['br', 'hr', 'img'])
// Conteúdo que some junto com a marcação, e não só a marcação.
const DESCARTAR_COM_CONTEUDO =
  /<(script|style|object|embed)\b[\s\S]*?<\/\1\s*>/gi
// Iframe: só entram YouTube, Typebot e TED (ver `iframeSeguro`); o resto some com o conteúdo.
const IFRAME = /<iframe\b([^>]*)>[\s\S]*?<\/iframe\s*>/gi
const HOSTS_DO_YOUTUBE = new Set([
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
])
const HOST_DO_TYPEBOT = 'bot.typebot.io'
const HOST_DO_TED = 'embed.ted.com'

const escapar = (t: string) =>
  t.replace(/&(?!#?\w+;)/g, '&amp;').replace(/"/g, '&quot;')

function atributo(atributos: string, nome: string): string | null {
  const m = new RegExp(
    `(?:^|\\s)${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    'i',
  ).exec(atributos)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null
}

function urlSegura(valor: string | null, protocolos: string[]): string | null {
  if (!valor) return null
  const limpo = valor.trim()
  // Remove caracteres de controle que enganam o navegador ("java\tscript:").
  // biome-ignore lint/suspicious/noControlCharactersInRegex: é exatamente o que se quer remover
  const sem = limpo.replace(/[\u0000-\u001f\u007f\s]/g, '')
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(sem)
  if (!m) return limpo.startsWith('//') ? null : limpo
  return protocolos.includes(m[1].toLowerCase()) ? limpo : null
}

/** O link vira botão com `data-botao` (qualquer valor) ou `class` com a palavra `botao`. */
function ehBotao(atributos: string): boolean {
  if (/(?:^|\s)data-botao(?=[\s=/]|$)/i.test(atributos)) return true
  return /(?:^|\s)botao(?:\s|$)/i.test(atributo(atributos, 'class') ?? '')
}

/** Endereço https já normalizado, ou null quando o host ou o caminho não são os liberados. */
function urlDoEmbed(
  valor: string | null,
): { src: string; tipo: 'youtube' | 'typebot' | 'ted' } | null {
  const limpo = urlSegura(valor, ['https'])
  if (!limpo || limpo.startsWith('/') || !limpo.includes(':')) return null
  let url: URL
  try {
    url = new URL(limpo.replace(/\s/g, ''))
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  if (url.port) return null
  if (HOSTS_DO_YOUTUBE.has(url.hostname)) {
    const id = /^\/embed\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1]
    return id
      ? { src: `https://www.youtube-nocookie.com/embed/${id}`, tipo: 'youtube' }
      : null
  }
  if (url.hostname === HOST_DO_TYPEBOT) {
    const bot = /^\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1]
    return bot
      ? { src: `https://${HOST_DO_TYPEBOT}/${bot}`, tipo: 'typebot' }
      : null
  }
  if (url.hostname === HOST_DO_TED) {
    // `/talks/<slug>` ou, com idioma, `/talks/lang/<idioma>/<slug>` (o idioma é mantido).
    const m =
      /^\/talks\/(?:lang\/([A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?)\/)?([A-Za-z0-9_-]+)\/?$/.exec(
        url.pathname,
      )
    if (!m) return null
    const idioma = m[1] ? `lang/${m[1].toLowerCase()}/` : ''
    return {
      src: `https://${HOST_DO_TED}/talks/${idioma}${m[2]}`,
      tipo: 'ted',
    }
  }
  return null
}

/** O iframe reescrito com atributos fixos (nada do que veio, além do endereço, é aproveitado). */
function iframeSeguro(atributos: string): string {
  const embed = urlDoEmbed(atributo(atributos, 'src'))
  if (!embed) return ''
  if (embed.tipo === 'youtube' || embed.tipo === 'ted') {
    const [titulo, classe] =
      embed.tipo === 'ted'
        ? ['Vídeo do TED', 'embed-ted']
        : ['Vídeo do YouTube', 'embed-youtube']
    return `<iframe src="${embed.src}" title="${titulo}" class="${classe}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
  }
  return `<iframe src="${embed.src}" title="Formulário interativo" class="embed-typebot" loading="lazy" allow="clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
}

/** Iframe de YouTube que vem do campo de vídeo da aula (e não do texto), já no formato seguro. */
export function iframeDoYoutube(videoId: string): string {
  return iframeSeguro(`src="https://www.youtube.com/embed/${videoId}"`)
}

/**
 * `embeds`: aceita os iframes de YouTube, Typebot e TED. Só para o texto da aula, que a equipe
 * escreve; o texto da comunidade, escrito pelos alunos, nunca leva iframe (um Typebot qualquer
 * dentro da escola serviria de formulário falso).
 */
export function limparHtml(
  entrada: string,
  { embeds = false }: { embeds?: boolean } = {},
): string {
  // Os iframes aceitos viram marcadores enquanto o resto é limpo, e voltam no fim.
  const semNul = entrada.replace(/[\uE000\uE001]/g, '')
  const iframes: string[] = []
  const semPerigosos = semNul
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(DESCARTAR_COM_CONTEUDO, '')
    .replace(IFRAME, (_todo, atributos: string) => {
      if (!embeds) return ''
      const seguro = iframeSeguro(atributos)
      if (!seguro) return ''
      iframes.push(seguro)
      return `\uE000${iframes.length - 1}\uE000`
    })
  // As tags permitidas viram marcadores; todo `<` e `>` que sobrar é texto e é escapado.
  // Assim, apagar uma tag não cola um `<` anterior ao texto seguinte formando tag nova.
  const tags: string[] = []
  const guardarTag = (tag: string): string => {
    tags.push(tag)
    return `\uE001${tags.length - 1}\uE001`
  }
  const comMarcadores = semPerigosos.replace(
    /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    (_todo, barra: string, nomeBruto: string, atributos: string) => {
      const nome = nomeBruto.toLowerCase()
      if (!TAGS.has(nome)) return ''
      if (barra) return VAZIAS.has(nome) ? '' : guardarTag(`</${nome}>`)
      if (nome === 'a') {
        const href = urlSegura(atributo(atributos, 'href'), [
          'http',
          'https',
          'mailto',
        ])
        if (
          embeds &&
          href &&
          ehBotao(atributos) &&
          /^https:/i.test(href.trim())
        ) {
          return guardarTag(
            `<a href="${escapar(href)}" target="_blank" rel="noopener noreferrer" class="botao">`,
          )
        }
        return guardarTag(
          href
            ? `<a href="${escapar(href)}" target="_blank" rel="noopener noreferrer">`
            : '<a>',
        )
      }
      if (nome === 'img') {
        const src = urlSegura(atributo(atributos, 'src'), ['https'])
        if (!src) return ''
        const alt = atributo(atributos, 'alt') ?? ''
        return guardarTag(
          `<img src="${escapar(src)}" alt="${escapar(alt)}" loading="lazy">`,
        )
      }
      return guardarTag(`<${nome}>`)
    },
  )
  const limpo = comMarcadores.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return limpo
    .replace(/\uE001(\d+)\uE001/g, (_t, i: string) => tags[Number(i)])
    .replace(/\uE000(\d+)\uE000/g, (_t, i: string) => iframes[Number(i)])
}

/** Texto que, mostrado, fica em branco: só marcações vazias (ex. `<p><p></p></p>`) e espaços. */
export function textoSemConteudo(html: string): boolean {
  if (/<(img|iframe)\b/i.test(html)) return false
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;|&#160;/gi, '')
      .trim() === ''
  )
}
