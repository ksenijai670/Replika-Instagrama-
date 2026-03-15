const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");
const minioClient = require("./config/minio");
//const fs = require("fs");
//const path = require("path");

dotenv.config();

const PostController = require("./controllers/PostController");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3006;
//const uploadDir = process.env.UPLOAD_DIR || "uploads";
const maxFileSize = Number(process.env.MAX_FILE_SIZE || 50 * 1024 * 1024);
const maxFiles = Number(process.env.MAX_FILES || 20);

async function ensureBucket() {
  const bucket = process.env.MINIO_BUCKET;

  if (!bucket) {
    throw new Error("MINIO_BUCKET nije podešen");
  }

  const exists = await minioClient.bucketExists(bucket);

  if (!exists) {
    await minioClient.makeBucket(bucket, "us-east-1");
    console.log(`Bucket ${bucket} uspešno kreiran`);
  } else {
    console.log(`Bucket ${bucket} već postoji`);
  }

  //dodat je pristup 
  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`]
      }
    ]
  };
  
  try {
    await minioClient.setBucketPolicy(bucket, JSON.stringify(policy));
    console.log(`Bucket ${bucket} je uspešno postavljen kao javan`);
  } catch (err) {
    console.error("Greška pri postavljanju public policy-ja za MinIO:", err);
  }
}

//fs.mkdirSync(uploadDir, { recursive: true });

/*const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: maxFileSize,
    files: maxFiles,
  },
});*/

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSize,
    files: maxFiles,
  },
});

//kraj

app.get("/", (req, res) => {
  res.json({ message: "Post service is running" });
});
//logovanje
app.use((req, res, next) => {
  console.log("REQUEST HIT:", req.method, req.url);
  next();
});

app.post("/posts", upload.array("files", maxFiles), PostController.createPost);

app.get("/posts/:id/meta", PostController.getPostMeta);
app.get("/posts/:id", PostController.getPostById);
app.get("/users/:userId/posts", PostController.getPostsByUserId);

app.put("/posts/:id/caption", PostController.updateCaption);

app.delete("/posts/:id", PostController.deletePost);
app.delete("/posts/:id/media/:mediaId", PostController.deletePostMedia);

//app.use(`/${uploadDir}`, express.static(path.resolve(uploadDir)));

app.use((err, req, res, next) => {
  //logovanje privemeno
  console.error("GLOBAL ERROR: ", err);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "Jedan ili više fajlova prelaze 50 MB" });
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      return res
        .status(400)
        .json({ error: `Max ${maxFiles} fajlova dozvoljeno` });
    }

    return res.status(400).json({ error: err.message });
  }

  return res
    .status(500)
    .json({ error: "Serverska greška", details: err.message });
});
/*
app.listen(PORT, () => {
  console.log(`Post service running on port ${PORT}`);
}); */

async function start() {
  try {
    await ensureBucket();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Post service running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Greška pri pokretanju servisa:", err);
    process.exit(1);
  }
}

start();
