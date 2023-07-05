import express from "express";
const router = express.Router();
const app = express();
import formidable from "formidable";
import cors from 'cors';
import fs from 'fs';
import bodyParser from "body-parser";
app.use(cors());
app.use(bodyParser.json());
import { minioClient } from '../minioConfig.js';
import ConvertTiff from 'tiff-to-png'
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let convert_tiff_options = {
  logLevel: 1
};


router.get("/:url",function(req,res){
    try{
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
            console.log("stream collected");
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
    } catch(err){
        console.log(err.message);
        res.send({err})
    }
    
});

router.post("/:url",async function(req,res){
    try{
        const form = formidable({ multiples: false });

        form.parse(req, async (err, fields, files) => {
            if (err) {
                res.status(400).json({ error: "Failed to parse form data" });
                return;
            }

            let path  = files.file[0].filepath;
            let temp_dir_path = null
            // console.log(files.file[0])
            // if file type is tiff
            if(files.file[0].mimetype ==='image/tiff'){
                let converter = new ConvertTiff(convert_tiff_options);
                let destination_path = __dirname+'/../tmp';
                const res1 = await converter.convertOne(path, destination_path);
                // console.log(res1,res1.filename)
                path = res1.converted.filename
                path = path.split('/')
                path.pop();
                temp_dir_path = path.join('/')
                path =  temp_dir_path+ '/0.png'


                setTimeout(()=>{
                    fs.rmdir(temp_dir_path,
                        { recursive: true, force: true }
                        ,(err)=>{
                        if(err){
                            console.log("Directory delete from tmp failed: ",err.message);
                            return;
                        }
                        console.log("Directory delete successful",temp_dir_path)
                    })
                },1000*10)
    
            }

           
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
    } catch(err){
        console.log(err.message);
        res.send({err})
    }
});

export default router;