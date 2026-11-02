CREATE TABLE `atlas_aerials` (
	`id` varchar(191) NOT NULL,
	`region_id` varchar(191) NOT NULL,
	`payload` json NOT NULL,
	CONSTRAINT `atlas_aerials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_companies` (
	`id` varchar(191) NOT NULL,
	`name` varchar(512) NOT NULL,
	`evidence` enum('baseline','research') NOT NULL,
	`category` varchar(191) NOT NULL,
	`priority` varchar(191),
	`parent_id` varchar(191),
	`score` double,
	`cash_value` double,
	`employee_value` double,
	`summary` json NOT NULL,
	`ingestion_version` varchar(191) NOT NULL,
	CONSTRAINT `atlas_companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_company_regions` (
	`company_id` varchar(191) NOT NULL,
	`region_id` varchar(191) NOT NULL,
	`evidence` enum('baseline','research') NOT NULL,
	CONSTRAINT `atlas_company_regions_company_id_region_id_pk` PRIMARY KEY(`company_id`,`region_id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_events` (
	`id` varchar(64) NOT NULL,
	`event_id` varchar(191) NOT NULL,
	`company_id` varchar(191) NOT NULL,
	`date` varchar(64),
	`type` varchar(191) NOT NULL,
	`payload` json NOT NULL,
	CONSTRAINT `atlas_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_ingestions` (
	`version` varchar(191) NOT NULL,
	`content_hash` varchar(64) NOT NULL,
	`as_of` varchar(64) NOT NULL,
	`source_hashes` json NOT NULL,
	`status` enum('writing','complete') NOT NULL,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `atlas_ingestions_version` PRIMARY KEY(`version`)
);
--> statement-breakpoint
CREATE TABLE `atlas_observations` (
	`id` varchar(64) NOT NULL,
	`company_id` varchar(191) NOT NULL,
	`observation_id` varchar(191),
	`site_id` varchar(191),
	`metric` varchar(191) NOT NULL,
	`section` varchar(191) NOT NULL,
	`evidence` enum('baseline','research') NOT NULL,
	`missing` int NOT NULL,
	`payload` json NOT NULL,
	CONSTRAINT `atlas_observations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_parents` (
	`id` varchar(191) NOT NULL,
	`name` varchar(512) NOT NULL,
	CONSTRAINT `atlas_parents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_profiles` (
	`company_id` varchar(191) NOT NULL,
	`payload` json NOT NULL,
	CONSTRAINT `atlas_profiles_company_id` PRIMARY KEY(`company_id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_regions` (
	`id` varchar(191) NOT NULL,
	`name` varchar(320) NOT NULL,
	`payload` json NOT NULL,
	`ingestion_version` varchar(191) NOT NULL,
	CONSTRAINT `atlas_regions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_sites` (
	`id` varchar(191) NOT NULL,
	`company_id` varchar(191) NOT NULL,
	`region_id` varchar(191) NOT NULL,
	`city` varchar(320) NOT NULL,
	`zone` varchar(320),
	`precision` varchar(191) NOT NULL,
	`evidence` enum('baseline','research') NOT NULL,
	`payload` json NOT NULL,
	CONSTRAINT `atlas_sites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atlas_sources` (
	`source_key` varchar(64) NOT NULL,
	`source_id` varchar(191) NOT NULL,
	`company_id` varchar(191),
	`evidence` enum('baseline','research') NOT NULL,
	`payload` json NOT NULL,
	CONSTRAINT `atlas_sources_source_key` PRIMARY KEY(`source_key`)
);
--> statement-breakpoint
CREATE TABLE `atlas_zones` (
	`id` varchar(191) NOT NULL,
	`region_id` varchar(191) NOT NULL,
	`payload` json NOT NULL,
	CONSTRAINT `atlas_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `atlas_aerial_region_idx` ON `atlas_aerials` (`region_id`);--> statement-breakpoint
CREATE INDEX `atlas_company_name_idx` ON `atlas_companies` (`name`);--> statement-breakpoint
CREATE INDEX `atlas_company_filter_idx` ON `atlas_companies` (`evidence`,`category`,`priority`);--> statement-breakpoint
CREATE INDEX `atlas_company_score_idx` ON `atlas_companies` (`score`);--> statement-breakpoint
CREATE INDEX `atlas_company_cash_idx` ON `atlas_companies` (`cash_value`);--> statement-breakpoint
CREATE INDEX `atlas_company_employee_idx` ON `atlas_companies` (`employee_value`);--> statement-breakpoint
CREATE INDEX `atlas_company_parent_idx` ON `atlas_companies` (`parent_id`);--> statement-breakpoint
CREATE INDEX `atlas_region_company_idx` ON `atlas_company_regions` (`region_id`,`company_id`);--> statement-breakpoint
CREATE INDEX `atlas_event_company_idx` ON `atlas_events` (`company_id`);--> statement-breakpoint
CREATE INDEX `atlas_event_date_idx` ON `atlas_events` (`date`);--> statement-breakpoint
CREATE INDEX `atlas_observation_company_idx` ON `atlas_observations` (`company_id`);--> statement-breakpoint
CREATE INDEX `atlas_observation_metric_idx` ON `atlas_observations` (`metric`,`missing`);--> statement-breakpoint
CREATE INDEX `atlas_observation_site_idx` ON `atlas_observations` (`site_id`);--> statement-breakpoint
CREATE INDEX `atlas_site_region_idx` ON `atlas_sites` (`region_id`);--> statement-breakpoint
CREATE INDEX `atlas_site_company_idx` ON `atlas_sites` (`company_id`);--> statement-breakpoint
CREATE INDEX `atlas_site_city_idx` ON `atlas_sites` (`city`);--> statement-breakpoint
CREATE INDEX `atlas_site_zone_idx` ON `atlas_sites` (`zone`);--> statement-breakpoint
CREATE INDEX `atlas_source_company_idx` ON `atlas_sources` (`company_id`);--> statement-breakpoint
CREATE INDEX `atlas_source_id_idx` ON `atlas_sources` (`source_id`);--> statement-breakpoint
CREATE INDEX `atlas_zone_region_idx` ON `atlas_zones` (`region_id`);