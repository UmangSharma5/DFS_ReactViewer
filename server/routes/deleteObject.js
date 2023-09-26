import express from 'express';
const router = express.Router();
const app = express();
import * as Minio from 'minio';
import cors from 'cors';
import bodyParser from "body-parser";
app.use(cors());
app.use(bodyParser.json());
import { minioClient } from '../minioConfig.js';
import { map_user_to_bucket, get_user_bucket, remove_user_bucket, map_file_type, file_stats,file_uploaded } from '../Database_queries/queries.js'

router.post("/:url",async function(req,res){
    let user = await get_user_bucket(req.user.user_email);
    let fileName = req.body.fileName;
    let miniopath = "/hv/"+user+"/thumbnail/";
    let bucketName = "datadrive-dev"
    console.log(fileName);
    let format = fileName.split('.')[1];
    let name = fileName.split('.')[0];
    let fileName_thumbnail = fileName.split('.')[0]+".png";

    minioClient.removeObject(bucketName,miniopath+fileName_thumbnail,function(err){
        if(err){
            res.status(400).json({error:"Failed to Delete"})
        }
        console.log('Removed the object');
        res.status(200).json("Deleted");
    })

    if(format != 'png' || format != 'jpeg'){
        let objects = []
        console.log(user+'/'+name);
        let stream = minioClient.listObjects(bucketName,"hv/"+user+'/'+name,true)
        stream.on('data', async(obj)=>{
            objects.push(obj.name)
        })
        stream.on('error', (err) => {
            console.error('Error listing objects:', err);
            res.status(500).json({ error: 'Failed to list objects' });
        });
        stream.on('end',async() =>{
            console.log(objects);
            minioClient.removeObjects(bucketName,objects,function(e){
                if(e){
                    return console.log('Unable to remove objects',e)
                }
                console.log("removed the objects successfully")
            })
        })
    }
})


export default router;