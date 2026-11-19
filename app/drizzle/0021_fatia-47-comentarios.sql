CREATE TABLE `comentario_da_aula` (
	`id` text PRIMARY KEY NOT NULL,
	`aula_id` text NOT NULL,
	`user_id` text NOT NULL,
	`pai_id` text,
	`texto` text NOT NULL,
	`chave_de_envio` text,
	`fixado_em` integer,
	`editado_em` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`excluido_em` integer,
	FOREIGN KEY (`aula_id`) REFERENCES `aula`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pai_id`) REFERENCES `comentario_da_aula`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comentario_aula_idx` ON `comentario_da_aula` (`aula_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comentario_pai_idx` ON `comentario_da_aula` (`pai_id`);--> statement-breakpoint
CREATE INDEX `comentario_autor_idx` ON `comentario_da_aula` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `comentario_chave_idx` ON `comentario_da_aula` (`user_id`,`chave_de_envio`);--> statement-breakpoint
CREATE TABLE `comentarios_desligados` (
	`alvo_tipo` text NOT NULL,
	`alvo_id` text NOT NULL,
	`autor_id` text,
	`desligado_em` integer NOT NULL,
	PRIMARY KEY(`alvo_tipo`, `alvo_id`),
	FOREIGN KEY (`autor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
