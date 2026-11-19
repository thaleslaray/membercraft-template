ALTER TABLE `alternativa_da_pergunta` ADD `imagem` text;--> statement-breakpoint
ALTER TABLE `quiz` ADD `origem_google_forms` text;--> statement-breakpoint
CREATE INDEX `quiz_origem_google_forms_idx` ON `quiz` (`origem_google_forms`);