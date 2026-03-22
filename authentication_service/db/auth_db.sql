CREATE DATABASE IF NOT EXISTS auth_db;
USE auth_db;

CREATE TABLE IF NOT EXISTS `users` (
  `id`                bigint UNSIGNED     NOT NULL AUTO_INCREMENT,
  `first_name`        varchar(100)        NOT NULL,
  `last_name`         varchar(100)        NOT NULL,
  `username`          varchar(50)         NOT NULL,
  `email`             varchar(150)        NOT NULL,
  `password_hash`     varchar(255)        NOT NULL,
  `bio`               text                         DEFAULT NULL,
  `profile_image_url` varchar(500)                 DEFAULT NULL,
  `is_private`        tinyint(1)          NOT NULL DEFAULT 1,
  `last_login_at`     timestamp                    DEFAULT NULL,
  `deleted_at`        timestamp                    DEFAULT NULL,
  `created_at`        timestamp                    DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        timestamp                    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_username` (`username`),
  UNIQUE KEY `uq_email`    (`email`),
  KEY `idx_users_username` (`username`),
  KEY `idx_users_email`    (`email`),
  KEY `idx_users_deleted`  (`deleted_at`)
);

CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id`         bigint UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`    bigint UNSIGNED  NOT NULL,
  `token`      varchar(500)     NOT NULL,
  `expires_at` timestamp        NOT NULL,
  `revoked`    tinyint(1)       NOT NULL DEFAULT 0,
  `created_at` timestamp                 DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_refresh_user`    (`user_id`),
  KEY `idx_refresh_token`   (`token`),
  KEY `idx_refresh_expires` (`expires_at`),
  CONSTRAINT `fk_refresh_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
);
