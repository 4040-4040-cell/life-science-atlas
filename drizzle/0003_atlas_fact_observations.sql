CREATE TABLE `atlas_fact_observations` (
  `id` varchar(64) NOT NULL,
  `company_id` varchar(191) NOT NULL,
  `ingestion_version` varchar(191) NOT NULL,
  `metric` varchar(191) NOT NULL,
  `section` varchar(191) NOT NULL,
  `evidence` enum('baseline','research') NOT NULL,
  `missing` int NOT NULL,
  `payload` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `atlas_fact_observations_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE INDEX `atlas_fact_observation_company_idx` ON `atlas_fact_observations` (`company_id`,`metric`,`created_at`);
--> statement-breakpoint
CREATE INDEX `atlas_fact_observation_version_idx` ON `atlas_fact_observations` (`ingestion_version`);
