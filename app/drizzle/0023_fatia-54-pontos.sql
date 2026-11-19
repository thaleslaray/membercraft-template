CREATE TABLE `lancamento_de_pontos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`curso_id` text,
	`origem_tipo` text NOT NULL,
	`origem_id` text,
	`pontos` integer NOT NULL,
	`motivo` text,
	`autor_id` text,
	`estornado_em` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`curso_id`) REFERENCES `curso`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`autor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lancamento_origem_idx` ON `lancamento_de_pontos` (`user_id`,`origem_tipo`,`origem_id`);--> statement-breakpoint
CREATE INDEX `lancamento_aluno_idx` ON `lancamento_de_pontos` (`user_id`,`curso_id`);--> statement-breakpoint
CREATE INDEX `lancamento_curso_idx` ON `lancamento_de_pontos` (`curso_id`);