# Entregas de quiz (#52): envio de arquivos

Pergunta do tipo "Envio de arquivo": o aluno manda de 1 a 3 arquivos de qualquer tipo, até 500 MB cada.
Os arquivos ficam no R2 em `quiz/entregas/<id do aluno>/<uuid>/<nome>` e são baixados só por
`/api/entregas/<id do arquivo>` (o aluno dono ou quem tem a permissão `corrigir-quiz`).

## Dois caminhos de envio

`prepararEnvioDeArquivoFn` (src/lib/quiz-fns.ts) confere o tamanho e decide:

| Ambiente | Quando | Caminho | Limite |
|---|---|---|---|
| Remoto (teste e produção) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` preenchidos | URL assinada (S3 do R2, `src/lib/r2-presign.ts`): o navegador faz `PUT` direto ao R2 | 500 MB |
| Local (`npm run dev`, e2e) | sem as credenciais S3 | `POST /api/quiz/entregas`: o arquivo passa pelo Worker | 90 MB |

O R2 local do `wrangler dev` não expõe endpoint S3, por isso o caminho local existe. Os 90 MB vêm do teto
de 100 MB do corpo de uma requisição ao Worker. Ao enviar a tentativa, o servidor confere no R2 (`head`)
se cada arquivo chegou e usa o tamanho que o R2 guardou.

## O que precisa estar pronto no bucket remoto (não verificável daqui)

1. Credenciais S3 do R2 (token com Object Read & Write no bucket) nos segredos `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`.
2. CORS no bucket liberando `PUT` da origem do site (o navegador envia direto ao domínio
   `<conta>.r2.cloudflarestorage.com`):

```json
[
  {
    "AllowedOrigins": ["https://<domínio da área de membros>"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

3. A URL assinada vale 1 hora e não limita o tamanho do `PUT`: o limite de 500 MB é conferido no envio da
   tentativa. Um arquivo enviado e nunca anexado a uma tentativa fica órfão no R2 (limpeza fica para
   a rotina de arquivos excluídos).
