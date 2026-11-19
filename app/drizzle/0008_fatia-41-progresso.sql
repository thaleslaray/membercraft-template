CREATE TABLE `progresso_da_aula` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`aula_id` text NOT NULL,
	`ultima_posicao` integer DEFAULT 0 NOT NULL,
	`maior_ponto` integer DEFAULT 0 NOT NULL,
	`duracao` integer DEFAULT 0 NOT NULL,
	`tempo_tocando` integer DEFAULT 0 NOT NULL,
	`concluida_em` integer,
	`aberta_em` integer NOT NULL,
	`gravada_em` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`aula_id`) REFERENCES `aula`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `progresso_aluno_aula_idx` ON `progresso_da_aula` (`user_id`,`aula_id`);--> statement-breakpoint
CREATE INDEX `progresso_aula_idx` ON `progresso_da_aula` (`aula_id`);