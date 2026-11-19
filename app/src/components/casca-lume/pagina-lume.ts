// Ajustes das telas de apoio (Comunidade, Atendimento, Conta) quando aparecem dentro da casca Lume.
// Todas as classes passam pela variante `in-data-[casca=lume]`: na casca clássica não mudam nada.

/**
 * Régua única: a página encosta na margem `--pad` da casca, alinhada à esquerda como as fileiras do
 * Início. A largura máxima da página continua valendo, agora só para o conteúdo (`box-content`).
 */
export const PAGINA_NA_REGUA =
  'in-data-[casca=lume]:mx-0 in-data-[casca=lume]:w-auto in-data-[casca=lume]:box-content in-data-[casca=lume]:px-(--pad) in-data-[casca=lume]:md:px-(--pad)'

/** Título da página na fonte de títulos do tema (Archivo 800, espaçamento negativo). */
export const TITULO_DA_PAGINA =
  'text-balance in-data-[casca=lume]:font-display in-data-[casca=lume]:text-[clamp(1.75rem,3.2vw,2.5rem)] in-data-[casca=lume]:leading-[1.08] in-data-[casca=lume]:tracking-[-0.03em]'

/** Título escrito por gente (publicação da comunidade): a mesma fonte, num tamanho de leitura. */
export const TITULO_DE_CONTEUDO =
  'text-balance in-data-[casca=lume]:font-display in-data-[casca=lume]:text-[clamp(1.5rem,2.6vw,2rem)] in-data-[casca=lume]:leading-tight in-data-[casca=lume]:tracking-[-0.02em]'

// ---- Página de revista (tokens `--leitura-*`, `--botao-forte*`, `--apoio-*` em `src/styles.css`) ----
// Os padrões dos tokens repetem o desenho de hoje; só o tema que muda o valor muda a tela.

/**
 * Item ou cartão de leitura: fundo, contorno e fio de baixo pelos tokens. No padrão, o cartão de
 * hoje; no papel, só o fio de baixo separa um item do outro. Canto, sombra e recuo vão à parte,
 * porque cada cartão tem os seus (`calc(<canto de hoje> * var(--leitura-quina))`).
 */
export const LEITURA_NO_PAPEL =
  'in-data-[casca=lume]:bg-(color:--leitura-fundo) in-data-[casca=lume]:border-(color:--leitura-contorno) in-data-[casca=lume]:border-b-(color:--leitura-fio)'

/** O `Card` como item de leitura: os tokens acima, a sombra dele e o canto `--radius`. */
export const CARD_DE_LEITURA = `${LEITURA_NO_PAPEL} in-data-[casca=lume]:shadow-(--leitura-sombra) in-data-[casca=lume]:rounded-[calc(var(--radius)*var(--leitura-quina))]`

/** Vão entre itens de uma lista de leitura com `gap-3`: no papel, os itens encostam no fio. */
export const VAO_DA_LEITURA =
  'in-data-[casca=lume]:gap-[calc(0.75rem*var(--leitura-vao))]'

/** Ação principal da tela (e filtro ativo): o botão escuro de hoje; vinho onde o tema pede. */
export const BOTAO_FORTE =
  'in-data-[casca=lume]:bg-(color:--botao-forte) in-data-[casca=lume]:text-(color:--botao-forte-tinta) in-data-[casca=lume]:hover:bg-(color:--botao-forte-hover)'

/**
 * Telas de apoio que hoje ficam centralizadas (Certificados, Favoritos, Pontos, Busca): onde o tema
 * pede, encostam na régua `--pad` da casca. O padrão mantém o `mx-auto` e o `md:px-8` de hoje.
 */
export const APOIO_NA_REGUA =
  'in-data-[casca=lume]:mx-(--apoio-margem) in-data-[casca=lume]:md:px-[calc(2rem*(1-var(--apoio-na-regua))+var(--pad)*var(--apoio-na-regua))]'

/** Título dessas telas: o `text-2xl font-semibold` de hoje, ou a fonte de títulos do tema. */
export const TITULO_DE_APOIO =
  'in-data-[casca=lume]:text-balance in-data-[casca=lume]:font-(family-name:--titulo-apoio-fonte) in-data-[casca=lume]:font-(--titulo-apoio-peso) in-data-[casca=lume]:text-(length:--titulo-apoio-tamanho) in-data-[casca=lume]:leading-(--titulo-apoio-altura) in-data-[casca=lume]:tracking-(--titulo-apoio-tracking)'

/**
 * Faixa presa ao pé (o campo do Atendimento). No celular vai de borda a borda e para logo acima das
 * abas do Lume, que têm 4rem (as da clássica têm 3,5rem); no computador fica na coluna da régua, com
 * uma folga curta e os cantos de cima arredondados, em vez de uma faixa solta no meio da tela.
 */
export const FAIXA_NA_REGUA =
  'in-data-[casca=lume]:bottom-[calc(4rem+env(safe-area-inset-bottom))] in-data-[casca=lume]:lume-tela:bottom-0 in-data-[casca=lume]:-mx-(--pad) in-data-[casca=lume]:px-(--pad) in-data-[casca=lume]:lume-tela:-mx-4 in-data-[casca=lume]:lume-tela:px-4 in-data-[casca=lume]:lume-tela:rounded-t-xl'
