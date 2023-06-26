const express = require('express');
const app = express();
var Minio = require('minio');
var cors = require('cors');
var bodyParser = require('body-parser');
const multer = require('multer');
app.use(cors());
app.use(bodyParser.json());
const upload = multer({ dest: 'uploads/' });

var minioClient = new Minio.Client({
    endPoint: 'play.min.io',
    port: 9000,
    useSSL: true,
    accessKey: 'Q3AM3UQ867SPQQA43P2F',
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
});


// app.get("/delete",function(req,res){
//   minioClient.removeBucket('umangsstudentsiiitacin', function(err) {
//     if (err) return console.log('unable to remove bucket.')
//     console.log('Bucket removed successfully.')
//   })
//   res.send("done");
// })


app.get("/buckets",function(req,res){    
    minioClient.listBuckets(function(err, buckets) {
        if (err) return console.log(err)
        res.json(buckets);
      })
});

app.get("/objects/:url",function(req,res){
    const bucketName = req.params.url;
    console.log(bucketName);
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

app.get("/getURL/:url",async function(req,res){
  const bucketName = req.params.url;
    const {imageName} = req.query;
    const imageUrl = await minioClient.presignedGetObject(bucketName, imageName, 60*60);
    const imageURL = {image : imageUrl};
    res.json(imageURL);
})


app.post("/objects/:url",upload.single('file'),function(req,res){
  const { originalname, mimetype, size, path } = req.file;
  const bucketName = req.params.url;
  let fileName = originalname;
  let file = path;
  minioClient.fPutObject(bucketName, fileName, file, function(err, objInfo) {
    if(err) {
        return console.log(err)
    }
    console.log("Success", objInfo.etag, objInfo.versionId)
  })
});

app.listen(5000,function(){
    console.log("Server started on port 5000");
});