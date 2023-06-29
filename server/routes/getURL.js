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
    // console.log(req.query);
      const {imageName} = req.query;
      const imageUrl = await minioClient.presignedGetObject(bucketName, imageName, 60*60);
      const imageURL = {image : imageUrl};
      res.json(imageURL);
})

export default router;