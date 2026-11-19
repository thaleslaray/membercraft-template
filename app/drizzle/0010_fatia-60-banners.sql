CREATE TABLE `banner` (
	`id` text PRIMARY KEY NOT NULL,
	`titulo` text NOT NULL,
	`imagem_computador` text NOT NULL,
	`imagem_celular` text,
	`link` text,
	`publico` text DEFAULT 'todos' NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`inicio` integer,
	`fim` integer,
	`ordem` integer NOT NULL,
	`exibicoes` integer DEFAULT 0 NOT NULL,
	`cliques` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`excluido_em` integer
);
--> statement-breakpoint
CREATE TABLE `banner_curso` (
	`banner_id` text NOT NULL,
	`curso_id` text NOT NULL,
	FOREIGN KEY (`banner_id`) REFERENCES `banner`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`curso_id`) REFERENCES `curso`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `banner_curso_idx` ON `banner_curso` (`banner_id`,`curso_id`);--> statement-breakpoint
CREATE INDEX `banner_curso_curso_idx` ON `banner_curso` (`curso_id`);