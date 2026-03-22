
CREATE DATABASE IF NOT EXISTS follow_service
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE follow_service;


CREATE TABLE IF NOT EXISTS follows (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  follower_id BIGINT NOT NULL,
  following_id BIGINT NOT NULL,
  status ENUM('PENDING', 'ACCEPTED') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY unique_follow (follower_id, following_id),

  INDEX idx_follower (follower_id),
  INDEX idx_following (following_id),
  INDEX idx_status (status),

  CONSTRAINT chk_no_self_follow CHECK (follower_id <> following_id)
);


CREATE TABLE IF NOT EXISTS blocks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  blocker_id BIGINT NOT NULL,
  blocked_id BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY unique_block (blocker_id, blocked_id),
  INDEX idx_blocker (blocker_id),
  INDEX idx_blocked (blocked_id),

  CONSTRAINT chk_no_self_block CHECK (blocker_id <> blocked_id)
);