import { VazioDoPainel } from '#/components/painel/estados'
import { Numero } from '#/components/painel/relatorios/comuns'
import { TabelaDoPainel } from '#/components/painel/tabela'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import type { Panorama } from '#/regras/relatorios'

export function PanoramaView({ panorama }: { panorama: Panorama }) {
  const g = panorama.geral
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Numero rotulo="Alunos ativos no período" valor={g.alunosAtivos} />
        <Numero rotulo="Alunos novos" valor={g.novos} />
        <Numero rotulo="Nunca acessaram" valor={g.nuncaAcessaram} />
        <Numero rotulo="Aulas concluídas" valor={g.aulasConcluidas} />
        <Numero rotulo="Comentários" valor={g.comentarios} />
        <Numero rotulo="Avaliações" valor={g.avaliacoes} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por curso</CardTitle>
        </CardHeader>
        <CardContent>
          <TabelaDoPainel
            rotulo="Panorama por curso"
            linhas={panorama.porCurso}
            chave={(c) => c.cursoId}
            vazio={
              <VazioDoPainel mensagem="Nenhum curso cadastrado. Crie um curso para ver os números dele aqui." />
            }
            colunas={[
              {
                rotulo: 'Curso',
                essencial: true,
                className: 'min-w-40 font-medium',
                celula: (c) => c.cursoNome,
              },
              {
                rotulo: 'Ativos',
                numero: true,
                essencial: true,
                celula: (c) => c.alunosAtivos,
              },
              {
                rotulo: 'Novos',
                numero: true,
                essencial: true,
                celula: (c) => c.novos,
              },
              {
                rotulo: 'Nunca acessaram',
                numero: true,
                essencial: true,
                celula: (c) => c.nuncaAcessaram,
              },
              {
                rotulo: 'Concluídas',
                numero: true,
                essencial: true,
                celula: (c) => c.aulasConcluidas,
              },
              {
                rotulo: 'Comentários',
                numero: true,
                essencial: true,
                celula: (c) => c.comentarios,
              },
              {
                rotulo: 'Avaliações',
                numero: true,
                essencial: true,
                celula: (c) => c.avaliacoes,
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
