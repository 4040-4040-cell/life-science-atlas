CREATE TABLE `atlas_company_overlays` (
	`id` varchar(64) NOT NULL,
	`company_id` varchar(191) NOT NULL,
	`ingestion_version` varchar(191) NOT NULL,
	`base_priority` varchar(191),
	`base_score` double,
	`base_coverage` double,
	`priority` varchar(191),
	`score` double,
	`coverage` double,
	`payload` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `atlas_company_overlays_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `atlas_overlay_company_idx` ON `atlas_company_overlays` (`company_id`,`created_at`);