const Minio = require('minio');

const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || 'minio_user',
    secretKey: process.env.MINIO_SECRET_KEY || 'minio_password',
});

const bucketName = process.env.MINIO_BUCKET || 'profile-media';

const initMinio = async () => {
    try {
        const exists = await minioClient.bucketExists(bucketName);
        if (!exists) {
            await minioClient.makeBucket(bucketName, 'us-east-1');
            const policy = {
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: "*",
                    Action: ["s3:GetObject"],
                    Resource: [`arn:aws:s3:::${bucketName}/*`]
                }]
            };
            await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
            console.log(`Bucket ${bucketName} kreiran.`);
        }
    } catch (err) {
        console.error("MinIO Init Error:", err);
    }
};
initMinio();

module.exports = { minioClient, bucketName };