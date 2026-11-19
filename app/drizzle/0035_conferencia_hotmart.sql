CREATE TABLE `conferencia_hotmart` (
	`id` text PRIMARY KEY NOT NULL,
	`origem` text NOT NULL,
	`situacao` text NOT NULL,
	`iniciada_em` integer NOT NULL,
	`concluida_em` integer NOT NULL,
	`janela_inicio` integer NOT NULL,
	`janela_fim` integer NOT NULL,
	`consultadas` integer DEFAULT 0 NOT NULL,
	`recuperadas` integer DEFAULT 0 NOT NULL,
	`ja_processadas` integer DEFAULT 0 NOT NULL,
	`sem_turma` integer DEFAULT 0 NOT NULL,
	`ignoradas` integer DEFAULT 0 NOT NULL,
	`com_erro` integer DEFAULT 0 NOT NULL,
	`erro` text,
	`detalhes` text DEFAULT '[]' NOT NULL
);
