CREATE TABLE `aula` (
	`id` text PRIMARY KEY NOT NULL,
	`modulo_id` text NOT NULL,
	`titulo` text NOT NULL,
	`vimeo_id` text,
	`vimeo_hash` text,
	`texto_html` text DEFAULT '' NOT NULL,
	`miniatura` text,
	`ordem` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`excluido_em` integer,
	FOREIGN KEY (`modulo_id`) REFERENCES `modulo`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `aula_modulo_idx` ON `aula` (`modulo_id`);--> statement-breakpoint
CREATE TABLE `categoria` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`ordem` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`excluido_em` integer
);
--> statement-breakpoint
CREATE TABLE `curso` (
	`id` text PRIMARY KEY NOT NULL,
	`categoria_id` text,
	`nome` text NOT NULL,
	`descricao` text DEFAULT '' NOT NULL,
	`carga_horaria` integer,
	`capa_horizontal` text,
	`capa_vertical` text,
	`imagem_destaque` text,
	`mostrar_a_todos` integer DEFAULT false NOT NULL,
	`url_de_vendas` text,
	`ordem` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`excluido_em` integer,
	FOREIGN KEY (`categoria_id`) REFERENCES `categoria`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `curso_categoria_idx` ON `curso` (`categoria_id`);--> statement-breakpoint
CREATE TABLE `material_da_aula` (
	`id` text PRIMARY KEY NOT NULL,
	`aula_id` text NOT NULL,
	`nome` text NOT NULL,
	`chave` text NOT NULL,
	`tipo` text NOT NULL,
	`tamanho` integer NOT NULL,
	`ordem` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`excluido_em` integer,
	FOREIGN KEY (`aula_id`) REFERENCES `aula`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `material_aula_idx` ON `material_da_aula` (`aula_id`);--> statement-breakpoint
CREATE TABLE `modulo` (
	`id` text PRIMARY KEY NOT NULL,
	`curso_id` text NOT NULL,
	`nome` text NOT NULL,
	`capa` text,
	`ordem` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`excluido_em` integer,
	FOREIGN KEY (`curso_id`) REFERENCES `curso`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `modulo_curso_idx` ON `modulo` (`curso_id`);