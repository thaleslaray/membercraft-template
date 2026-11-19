CREATE TABLE `alternativa_da_pergunta` (
	`id` text PRIMARY KEY NOT NULL,
	`pergunta_id` text NOT NULL,
	`texto` text NOT NULL,
	`correta` integer DEFAULT false NOT NULL,
	`comentario` text,
	`ordem` integer NOT NULL,
	FOREIGN KEY (`pergunta_id`) REFERENCES `pergunta_do_quiz`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alternativa_pergunta_idx` ON `alternativa_da_pergunta` (`pergunta_id`);--> statement-breakpoint
CREATE TABLE `pergunta_do_quiz` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`tipo` text DEFAULT 'unica' NOT NULL,
	`enunciado` text NOT NULL,
	`imagem` text,
	`ordem` integer NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quiz`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pergunta_quiz_idx` ON `pergunta_do_quiz` (`quiz_id`);--> statement-breakpoint
CREATE TABLE `quiz` (
	`id` text PRIMARY KEY NOT NULL,
	`aula_id` text NOT NULL,
	`so_quiz` integer DEFAULT false NOT NULL,
	`obrigatorio` integer DEFAULT false NOT NULL,
	`obrigatorio_para_certificado` integer DEFAULT false NOT NULL,
	`minimo_de_acertos` integer DEFAULT 70 NOT NULL,
	`maximo_de_tentativas` integer,
	`pontos` integer DEFAULT 100 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`aula_id`) REFERENCES `aula`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_aula_idx` ON `quiz` (`aula_id`);--> statement-breakpoint
CREATE TABLE `tentativa_do_quiz` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`user_id` text NOT NULL,
	`numero` integer NOT NULL,
	`estado` text NOT NULL,
	`perguntas` text NOT NULL,
	`respostas` text NOT NULL,
	`acertos` integer NOT NULL,
	`total` integer NOT NULL,
	`percentual` integer NOT NULL,
	`minimo_de_acertos` integer NOT NULL,
	`enviada_em` integer NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quiz`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tentativa_quiz_aluno_numero_idx` ON `tentativa_do_quiz` (`quiz_id`,`user_id`,`numero`);--> statement-breakpoint
CREATE INDEX `tentativa_user_idx` ON `tentativa_do_quiz` (`user_id`);