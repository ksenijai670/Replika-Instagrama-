CREATE DATABASE IF NOT EXISTS post_service_db;
USE post_service_db;

CREATE TABLE posts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  caption TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_posts_user_created (user_id, created_at)
);

CREATE TABLE post_media (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT NOT NULL,
  position INT NOT NULL, 
  media_key VARCHAR(500) NOT NULL,       
  media_type ENUM('image','video') NOT NULL,
  media_size_bytes BIGINT NOT NULL, 
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_post_position (post_id, position),
  INDEX idx_media_post (post_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
