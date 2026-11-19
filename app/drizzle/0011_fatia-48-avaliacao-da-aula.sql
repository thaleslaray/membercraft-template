CREATE TABLE `avaliacao_da_aula` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`aula_id` text NOT NULL,
	`nota` integer NOT NULL,
	`o_que_faltou` text,
	`lida_em` integer,
	`lida_por_id` text,
	`atualizada_em` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`aula_id`) REFERENCES `aula`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lida_por_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `avaliacao_aluno_aula_idx` ON `avaliacao_da_aula` (`user_id`,`aula_id`);--> statement-breakpoint
CREATE INDEX `avaliacao_aula_idx` ON `avaliacao_da_aula` (`aula_id`);