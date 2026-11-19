ALTER TABLE `pergunta_do_quiz` ADD `obrigatoria` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `pergunta_do_quiz` ADD `grupo_um_de` text;--> statement-breakpoint
ALTER TABLE `pergunta_do_quiz` ADD `outro` integer DEFAULT false NOT NULL;