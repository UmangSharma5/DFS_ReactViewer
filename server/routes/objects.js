import express from "express";
const router = express.Router();
const app = express();
import formidable from "formidable";
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
    const bucketName = req.params.url; // get this from database (sql)
    minioClient.bucketExists(bucketName, function(err, exists) {
        if(err){
            console.log("here");
        }
        if(exists){
            //
        }
        else{
          minioClient.makeBucket(bucketName,(err) =>{
            if(err){
                console.error('Error creating bucket:', err);
                res.status(500).json({ error: 'Failed to create bucket' });
            } else{
                console.log('Bucket created successfully.');
            }
          })
        }
        const objects = [];
        const stream = minioClient.listObjects(bucketName, '', true);
    
        stream.on('data', (obj) => {
          objects.push(obj.name);
        });
    
        stream.on('error', (err) => {
          console.error('Error listing objects:', err);
          res.status(500).json({ error: 'Failed to list objects' });
        });
    
        stream.on('end', () => {
          console.log('Listing objects completed.');
          res.json({ objects });
        });
    })
    
    
});

router.post("/:url",function(req,res){
    const form = formidable({ multiples: false });

    form.parse(req, (err, fields, files) => {
        if (err) {
            res.status(400).json({ error: "Failed to parse form data" });
            return;
        }

        const path  = files.file[0].filepath;
        const bucketName = req.params.url;
        let fileName = files.file[0].originalFilename;

        minioClient.fPutObject(bucketName, fileName, path, function(err, objInfo) {
            if(err) {
                res.status(400).json({error:"Failed to upload"})
            }
            console.log("Success", objInfo.etag, objInfo.versionId)
            res.status(200).json({data:objInfo})
        })
    })
});

export default router;