CREATE TABLE `ajuste_de_aviso` (
	`chave` text PRIMARY KEY NOT NULL,
	`valor` integer NOT NULL,
	`atualizado_em` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `aviso_enviado` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tipo` text NOT NULL,
	`ciclo` text NOT NULL,
	`criado_em` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aviso_enviado_ciclo_idx` ON `aviso_enviado` (`user_id`,`tipo`,`ciclo`);--> statement-breakpoint
CREATE TABLE `estado_de_aviso` (
	`chave` text PRIMARY KEY NOT NULL,
	`numero` integer NOT NULL,
	`atualizado_em` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notificacao` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tipo` text NOT NULL,
	`texto` text NOT NULL,
	`link` text,
	`lida_em` integer,
	`criado_em` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notificacao_pessoa_idx` ON `notificacao` (`user_id`,`lida_em`,`criado_em`);