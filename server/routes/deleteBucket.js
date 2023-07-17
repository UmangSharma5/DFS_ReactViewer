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

// router.get("/:url",async function(req,res){
//     const bucketName = req.params.url;
//     async function emptyBucket(bucketName) {
//       var data = []
//       var stream = await minioClient.listObjects(bucketName,'', true)
//       stream.on('data', function(obj) { 
//         data.push(obj) 
//         data.map((file) => {
//           minioClient.removeObject(bucketName, file.name,function(err) {
//             if (err) {
//               return console.log('Unable to remove object', err)
//             }
//             console.log('Removed the object')
//             res.status(200);
//           })
//         })
  
//       })
//       stream.on("end", function (obj) { console.log(data) })
//       stream.on('error', function(err) { console.log(err) } )

//     }
      
//       // Usage
//       emptyBucket(bucketName).catch((err) => {
//         console.error('Failed to empty bucket:', err);
//         res.status(400);
//       });
    
// })

router.get("/:url", async function(req, res) {
  const bucketName = req.params.url;

  async function emptyBucket(bucketName) {
      try {
          const objects = [];
          const stream = await minioClient.listObjects(bucketName, '', true);

          stream.on('data', function(obj) {
              objects.push(obj);
          });

          stream.on('end', async function() {
              for (const file of objects) {
                  try {
                      await minioClient.removeObject(bucketName, file.name);
                      console.log('Removed the object:', file.name);
                  } catch (err) {
                      console.error('Unable to remove object:', file.name, err);
                  }
              }
              res.sendStatus(200);
          });

          stream.on('error', function(err) {
              console.error('Error listing objects:', err);
              res.sendStatus(500);
          });
      } catch (err) {
          console.error('Failed to empty bucket:', err);
          res.sendStatus(400);
      }
  }

  // Usage
  emptyBucket(bucketName).catch((err) => {
      console.error('Failed to empty bucket:', err);
      res.sendStatus(400);
  });
});





export default router;