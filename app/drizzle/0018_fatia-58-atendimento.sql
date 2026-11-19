CREATE TABLE `conversa_de_atendimento` (
	`id` text PRIMARY KEY NOT NULL,
	`codigo` text NOT NULL,
	`user_id` text,
	`visitante_email` text,
	`visitante_nome` text,
	`curso_id` text,
	`assunto` text NOT NULL,
	`estado` text DEFAULT 'aberta' NOT NULL,
	`canal` text DEFAULT 'area' NOT NULL,
	`ultima_mensagem_em` integer NOT NULL,
	`resolvida_em` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`excluido_em` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`curso_id`) REFERENCES `curso`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversa_codigo_idx` ON `conversa_de_atendimento` (`codigo`);--> statement-breakpoint
CREATE INDEX `conversa_user_idx` ON `conversa_de_atendimento` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `conversa_visitante_idx` ON `conversa_de_atendimento` (`visitante_email`);--> statement-breakpoint
CREATE INDEX `conversa_estado_idx` ON `conversa_de_atendimento` (`estado`,`ultima_mensagem_em`);--> statement-breakpoint
CREATE TABLE `mensagem_de_atendimento` (
	`id` text PRIMARY KEY NOT NULL,
	`conversa_id` text NOT NULL,
	`autor` text NOT NULL,
	`autor_id` text,
	`texto` text NOT NULL,
	`anexos` text DEFAULT '[]' NOT NULL,
	`origem` text DEFAULT 'area' NOT NULL,
	`criado_em` integer NOT NULL,
	FOREIGN KEY (`conversa_id`) REFERENCES `conversa_de_atendimento`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`autor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `mensagem_conversa_idx` ON `mensagem_de_atendimento` (`conversa_id`,`criado_em`);