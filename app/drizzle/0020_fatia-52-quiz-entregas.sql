CREATE TABLE `arquivo_da_resposta` (
	`id` text PRIMARY KEY NOT NULL,
	`tentativa_id` text NOT NULL,
	`pergunta_id` text NOT NULL,
	`chave` text NOT NULL,
	`nome` text NOT NULL,
	`tipo` text NOT NULL,
	`tamanho` integer NOT NULL,
	`enviado_em` integer NOT NULL,
	FOREIGN KEY (`tentativa_id`) REFERENCES `tentativa_do_quiz`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `arquivo_resposta_tentativa_idx` ON `arquivo_da_resposta` (`tentativa_id`);--> statement-breakpoint
CREATE TABLE `liberacao_de_tentativa` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`user_id` text NOT NULL,
	`liberada_por_id` text NOT NULL,
	`liberada_em` integer NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quiz`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`liberada_por_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `liberacao_quiz_aluno_idx` ON `liberacao_de_tentativa` (`quiz_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `resposta_aberta_do_quiz` (
	`id` text PRIMARY KEY NOT NULL,
	`tentativa_id` text NOT NULL,
	`pergunta_id` text NOT NULL,
	`texto` text,
	`situacao` text DEFAULT 'pendente' NOT NULL,
	`comentario` text,
	`corrigida_por_id` text,
	`corrigida_em` integer,
	FOREIGN KEY (`tentativa_id`) REFERENCES `tentativa_do_quiz`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`corrigida_por_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resposta_aberta_tentativa_pergunta_idx` ON `resposta_aberta_do_quiz` (`tentativa_id`,`pergunta_id`);--> statement-breakpoint
CREATE INDEX `resposta_aberta_situacao_idx` ON `resposta_aberta_do_quiz` (`situacao`);--> statement-breakpoint
ALTER TABLE `quiz` ADD `sem_correcao` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tentativa_do_quiz` ADD `corrigida_em` integer;