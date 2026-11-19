// Configuração da marca do app.
//
// Atenção: `url` serve apenas para montar links em e-mails e SEO. A URL pública real
// do app, usada pelo Better Auth, vem de `env.BETTER_AUTH_URL` (wrangler.jsonc).
export const appConfig = {
  name: 'Minha Escola',
  /** Marca no topo do menu lateral do aluno. */
  marca: {
    sigla: 'ME',
    nome: 'Helena Duarte',
    /** Como a escola se refere à professora nos textos ("Boas-vindas da Helena"). */
    nomeCurto: 'Helena',
    subtitulo: 'Escola online',
  },
  description: 'Área de membros da Minha Escola',
  url: 'http://localhost:3040',
  supportEmail: 'suporte@minhaescola.example',
  /** Remetente dos e-mails da área: "Helena Duarte" de @minhaescola.example, com respostas para o suporte. */
  email: {
    remetente: 'Helena Duarte <escola@minhaescola.example>',
    respostasPara: 'suporte@minhaescola.example',
  },
  /** Versão inicial dos Termos e contato de suporte padrão. Depois que o Proprietário edita em Configurações (#64), valem os do banco (`configuracao_da_area`). */
  /** Texto fixo do Atendimento (não é cálculo): quanto a equipe costuma levar para responder. */
  atendimento: {
    tempoDeResposta: 'A equipe costuma responder em até 1 dia útil.',
  },
  termos: { versao: '2026-11-07' },
} as const
