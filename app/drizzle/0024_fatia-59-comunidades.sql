CREATE TABLE `anexo_da_publicacao` (
	`id` text PRIMARY KEY NOT NULL,
	`publicacao_id` text NOT NULL,
	`chave` text NOT NULL,
	`nome` text NOT NULL,
	`tipo` text NOT NULL,
	`tamanho` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`publicacao_id`) REFERENCES `publicacao`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `anexo_publicacao_idx` ON `anexo_da_publicacao` (`publicacao_id`);--> statement-breakpoint
CREATE TABLE `comentario_da_publicacao` (
	`id` text PRIMARY KEY NOT NULL,
	`publicacao_id` text NOT NULL,
	`autor_id` text NOT NULL,
	`pai_id` text,
	`texto` text NOT NULL,
	`chave_de_envio` text NOT NULL,
	`editado_em` integer,
	`excluido_em` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`publicacao_id`) REFERENCES `publicacao`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`autor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comentario_publicacao_envio_idx` ON `comentario_da_publicacao` (`autor_id`,`chave_de_envio`);--> statement-breakpoint
CREATE INDEX `comentario_publicacao_idx` ON `comentario_da_publicacao` (`publicacao_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `comunidade` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`descricao` text,
	`icone` text NOT NULL,
	`cor` text NOT NULL,
	`so_equipe_publica` integer DEFAULT false NOT NULL,
	`excluido_em` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comunidade_turma` (
	`comunidade_id` text NOT NULL,
	`turma_id` text NOT NULL,
	PRIMARY KEY(`comunidade_id`, `turma_id`),
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turma_id`) REFERENCES `turma`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `leitura_da_publicacao` (
	`publicacao_id` text NOT NULL,
	`user_id` text NOT NULL,
	`lida_em` integer NOT NULL,
	PRIMARY KEY(`publicacao_id`, `user_id`),
	FOREIGN KEY (`publicacao_id`) REFERENCES `publicacao`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `publicacao` (
	`id` text PRIMARY KEY NOT NULL,
	`comunidade_id` text NOT NULL,
	`autor_id` text NOT NULL,
	`titulo` text NOT NULL,
	`texto_html` text NOT NULL,
	`fixada` integer DEFAULT false NOT NULL,
	`comentarios_bloqueados` integer DEFAULT false NOT NULL,
	`melhor_resposta_id` text,
	`chave_de_envio` text NOT NULL,
	`editada_em` integer,
	`ultima_atividade_em` integer NOT NULL,
	`excluido_em` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`comunidade_id`) REFERENCES `comunidade`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`autor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publicacao_envio_idx` ON `publicacao` (`autor_id`,`chave_de_envio`);--> statement-breakpoint
CREATE INDEX `publicacao_comunidade_idx` ON `publicacao` (`comunidade_id`,`ultima_atividade_em`);--> statement-breakpoint
CREATE TABLE `seguidor_da_publicacao` (
	`publicacao_id` text NOT NULL,
	`user_id` text NOT NULL,
	`situacao` text NOT NULL,
	PRIMARY KEY(`publicacao_id`, `user_id`),
	FOREIGN KEY (`publicacao_id`) REFERENCES `publicacao`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
