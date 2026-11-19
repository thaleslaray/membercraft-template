CREATE TABLE `matricula` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`turma_id` text NOT NULL,
	`situacao` text DEFAULT 'ativa' NOT NULL,
	`inicia_em` integer NOT NULL,
	`expira_em` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`turma_id`) REFERENCES `turma`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matricula_aluno_turma_idx` ON `matricula` (`user_id`,`turma_id`);--> statement-breakpoint
CREATE INDEX `matricula_turma_idx` ON `matricula` (`turma_id`);--> statement-breakpoint
CREATE TABLE `origem_da_matricula` (
	`id` text PRIMARY KEY NOT NULL,
	`matricula_id` text NOT NULL,
	`tipo` text NOT NULL,
	`venda_id` text,
	`autor_id` text,
	`observacao` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`matricula_id`) REFERENCES `matricula`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`autor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `origem_matricula_idx` ON `origem_da_matricula` (`matricula_id`);--> statement-breakpoint
CREATE TABLE `registro_de_acoes` (
	`id` text PRIMARY KEY NOT NULL,
	`autor_id` text,
	`acao` text NOT NULL,
	`detalhe` text DEFAULT '{}' NOT NULL,
	`criado_em` integer NOT NULL,
	FOREIGN KEY (`autor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `registro_acoes_criado_idx` ON `registro_de_acoes` (`criado_em`);--> statement-breakpoint
CREATE TABLE `turma` (
	`id` text PRIMARY KEY NOT NULL,
	`curso_id` text NOT NULL,
	`nome` text NOT NULL,
	`prazo_em_dias` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`curso_id`) REFERENCES `curso`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `turma_curso_idx` ON `turma` (`curso_id`);