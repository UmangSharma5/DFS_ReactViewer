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

router.get("/:url",async function(req,res){
    const bucketName = req.params.url;
    async function emptyBucket(bucketName) {
      var data = []
      var stream = await minioClient.listObjects(bucketName,'', true)
      stream.on('data', function(obj) { 
        data.push(obj) 
        data.map((file) => {
          minioClient.removeObject(bucketName, file.name,function(err) {
            if (err) {
              return console.log('Unable to remove object', err)
            }
            console.log('Removed the object')
            res.status(200);
          })
          console.log("done");
        })
  
      })
      stream.on("end", function (obj) { console.log(data) })
      stream.on('error', function(err) { console.log(err) } )

    }
      
      // Usage
      emptyBucket(bucketName).catch((err) => {
        console.error('Failed to empty bucket:', err);
        res.status(400);
      });
    
})

export default router;