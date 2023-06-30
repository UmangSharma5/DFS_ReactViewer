import express from 'express';
const router = express.Router();
const app = express();
import * as Minio from 'minio';
import cors from 'cors';
import bodyParser from "body-parser";
app.use(cors());
app.use(bodyParser.json());

var minioClient = new Minio.Client({
    endPoint: 'play.min.io',
    port: 9000,
    useSSL: true,
    accessKey: 'Q3AM3UQ867SPQQA43P2F',
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
});

router.get("/:url",function(req,res){
    const bucketName = req.params.url;
    async function emptyBucket(bucketName) {
        const objects = await minioClient.listObjects(bucketName).catch((err) => {
          console.error('Failed to list objects:', err);
          throw err;
        });
      
        const objectNames = objects.map((obj) => obj.name);
      
        for (const objectName of objectNames) {
          await minioClient.removeObject(bucketName, objectName).catch((err) => {
            console.error(`Failed to delete object "${objectName}":`, err);
            throw err;
          });
        }
      
        console.log('Bucket emptied successfully:', bucketName);
      }
      
      // Usage
      emptyBucket(bucketName).catch((err) => {
        console.error('Failed to empty bucket:', err);
      });
    
})

export default router;