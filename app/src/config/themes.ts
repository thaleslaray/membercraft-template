/**
 * Os temas da área (#63). O Estúdio é o padrão.
 *
 * Um tema aqui NÃO é só uma troca de cor: é um visual inteiro — paleta, raio
 * dos cantos, peso da borda, fonte. Tudo isso é variável CSS, então um tema é
 * um bloco de tokens em `src/styles.css` e nada mais. Nenhum componente lê
 * `data-theme`; se um visual novo precisa que um componente mude de forma,
 * crie um token para a forma (ex.: `--radius-btn`) e deixe o tema definir.
 *
 * Cada tema tem a face clara E a escura. O MODO (claro/escuro/sistema) é do
 * `next-themes`, na classe `dark` do <html>, e é escolha de cada aluno; o TEMA
 * vai em `data-theme`, vem da configuração de aparência (tabela `aparencia`)
 * e é escolha do Proprietário. Os dois eixos são independentes:
 * 7 temas x 2 modos = 14 blocos de tokens.
 */
export type ThemeId =
  | 'estudio'
  | 'neutro'
  | 'editorial'
  | 'brutal'
  | 'creme'
  | 'janela'
  | 'atelie'

export type ThemeDef = {
  id: ThemeId
  /** Nome mostrado no seletor. */
  label: string
  /** Uma linha abaixo do nome: para que serve o visual. */
  hint: string
  /**
   * Três cores da amostra no seletor (face clara), na ordem: fundo da página,
   * cor da marca, tinta do texto. São literais de propósito: o seletor mostra
   * um tema que NÃO está aplicado, então não dá para ler os tokens do documento.
   */
  swatch: [string, string, string]
  /**
   * Cores de referência em hex para o cálculo de contraste da cor da marca
   * (src/regras/aparencia.ts): o fundo da página e a tinta do texto em cada
   * modo. Precisam bater com os blocos de tokens em styles.css.
   */
  referencia: {
    claro: { fundo: string; tinta: string }
    escuro: { fundo: string; tinta: string }
  }
  /** A cor da marca do próprio tema (hex), usada quando o Proprietário não escolheu outra. */
  marca: string
  /**
   * A forma do destaque do Início da casca Lume: 'cartao' (cartão com capa ao lado) ou 'amplo' (faixa larga
   * sobre a foto, com véu e tinta nos tokens `--destaque-*`). Os componentes leem o registro do tema
   * (`formaDoDestaque`) em vez de comparar o nome do tema.
   */
  destaque: 'cartao' | 'amplo'
}

export const themes: ThemeDef[] = [
  {
    id: 'estudio',
    label: 'Estúdio',
    hint: 'Branco, cinza e Inter, como a área antiga. O visual padrão da Escola.',
    swatch: ['#f8fafc', '#1f4d3a', '#0f172a'],
    referencia: {
      claro: { fundo: '#ffffff', tinta: '#0f172a' },
      escuro: { fundo: '#111318', tinta: '#f3f4f6' },
    },
    marca: '#1f4d3a',
    destaque: 'cartao',
  },
  {
    id: 'neutro',
    label: 'Neutro',
    hint: 'Preto, branco e um azul. Sóbrio para apps.',
    swatch: ['#ffffff', '#106dce', '#121212'],
    referencia: {
      claro: { fundo: '#ffffff', tinta: '#121212' },
      escuro: { fundo: '#0b0b0b', tinta: '#f5f5f5' },
    },
    marca: '#106dce',
    destaque: 'cartao',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    hint: 'Papel, serifa e terracota. Para conteúdo.',
    swatch: ['#f9f6f0', '#9d2e1c', '#1a1511'],
    referencia: {
      claro: { fundo: '#f9f6f0', tinta: '#1a1511' },
      escuro: { fundo: '#130e0b', tinta: '#f2eee6' },
    },
    marca: '#9d2e1c',
    destaque: 'cartao',
  },
  {
    id: 'brutal',
    label: 'Brutal',
    hint: 'Bordas grossas, amarelo e canto reto.',
    swatch: ['#ffffff', '#f4ce23', '#111111'],
    referencia: {
      claro: { fundo: '#ffffff', tinta: '#111111' },
      escuro: { fundo: '#111111', tinta: '#ffffff' },
    },
    marca: '#f4ce23',
    destaque: 'cartao',
  },
  {
    id: 'creme',
    label: 'Creme',
    hint: 'Creme, café e vinho, como as capas dos cursos. Cor contida.',
    swatch: ['#fbf7f1', '#8e2436', '#2b2320'],
    referencia: {
      claro: { fundo: '#fbf7f1', tinta: '#2b2320' },
      escuro: { fundo: '#1e1916', tinta: '#efe6da' },
    },
    marca: '#8e2436',
    destaque: 'cartao',
  },
  {
    id: 'janela',
    label: 'Luz de janela',
    hint: 'Areia com luz natural e sombra macia; no escuro, estúdio à noite.',
    swatch: ['#f6f0e8', '#8e2436', '#2b2320'],
    referencia: {
      claro: { fundo: '#f6f0e8', tinta: '#2b2320' },
      escuro: { fundo: '#1e1916', tinta: '#efe6da' },
    },
    marca: '#8e2436',
    destaque: 'amplo',
  },
  {
    id: 'atelie',
    label: 'Ateliê',
    hint: 'As cores das capas: fundo no papel da ilustração, vinho, sálvia e damasco.',
    swatch: ['#faf6ef', '#ab4d4e', '#aba17a'],
    referencia: {
      claro: { fundo: '#faf6ef', tinta: '#2b2320' },
      escuro: { fundo: '#1e1916', tinta: '#efe6da' },
    },
    marca: '#ab4d4e',
    destaque: 'amplo',
  },
]

export const themeIds = themes.map((t) => t.id)

/** O tema de quem nunca configurou a aparência. */
export const defaultTheme: ThemeId = 'estudio'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (themeIds as string[]).includes(value)
}

export function themeById(id: ThemeId): ThemeDef {
  // biome-ignore lint/style/noNonNullAssertion: todo ThemeId está no registro
  return themes.find((t) => t.id === id)!
}

/** A forma do destaque do Início da casca Lume para o tema (registro, não o nome do tema). */
export function formaDoDestaque(id: ThemeId): ThemeDef['destaque'] {
  return themeById(id).destaque
}
