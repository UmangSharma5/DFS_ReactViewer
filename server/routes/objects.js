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
import sharp from "sharp";
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let convert_tiff_options = {
  logLevel: 1
};

import walk from 'walk';
const minioPath = 'test/'

router.get("/:url",function(req,res){
    try{
        const bucketName = req.params.url; 
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
            let filePath  = files.file[0].filepath;
            const bucketName = req.params.url;
            let fileName = files.file[0].originalFilename;
            const parts = fileName.split('.');
            let tempName = parts[0];
            let pngFileName = tempName+'.png';
            if (files.file[0].mimetype === 'image/tiff') {
                let tiffFilePath = filePath;
                let pngFilePath = __dirname+'/../tmp/'+files.file[0].newFilename+'0.png';
                let tempDirPath = path.resolve(__dirname, '../tmp');
        
                try {

                    if (!fs.existsSync(tempDirPath)) {
                        fs.mkdirSync(tempDirPath, { recursive: true });
                    }

                    await sharp(tiffFilePath).toFile(pngFilePath);
                    console.log('Conversion completed successfully!');
                    console.log('Output file:', pngFilePath);
            
                    await minioClient.fPutObject(bucketName, pngFileName, pngFilePath, function(err, objInfo) {
                        if (err) {
                            res.status(400).json({ error: "Failed to upload" });
                        }
                        console.log("Success");
                        console.log(objInfo);
                        res.status(200).json({ data: objInfo, filename:pngFileName });
                    });

                    setTimeout(()=>{
                        fs.rmdir(tempDirPath,
                            { recursive: true, force: true }
                            ,(err)=>{
                            if(err){
                                console.log("Directory delete from tmp failed: ",err.message);
                                return;
                            }
                            console.log("Directory delete successful",tempDirPath)
                        })
                    },1000*1000)

                } catch (err) {
                    console.error('An error occurred:', err);
                    res.status(500).json({ error: "Conversion failed" });
                }
            }
            else{
                // console.log(fileName);
                minioClient.fPutObject(bucketName, fileName, filePath, function(err, objInfo) {
                    if(err) {
                        res.status(400).json({error:"Failed to upload"})
                    }
                    console.log("Success")
                    res.status(200).json({data:objInfo, filename:fileName})
                })
            }
        })
    } catch(err){
        console.log(err.message);
        res.send({err})
    }



});

export default router;













  // if (files.file[0].mimetype === 'image/tiff') {
            //     let tiffFilePath = filePath;
            //     let pngFilePath = __dirname+'/../tmp/'+files.file[0].newFilename+'0.png';
            //     let tempDirPath = path.resolve(__dirname, '../tmp');
        
            //     try {

            //         if (!fs.existsSync(tempDirPath)) {
            //             fs.mkdirSync(tempDirPath, { recursive: true });
            //         }

            //         await sharp(tiffFilePath).toFile(pngFilePath);
            //         console.log('Conversion completed successfully!');
            //         console.log('Output file:', pngFilePath);
            
            //         await minioClient.fPutObject(bucketName, pngFileName, pngFilePath, function(err, objInfo) {
            //             if (err) {
            //                 res.status(400).json({ error: "Failed to upload" });
            //             }
            //             console.log("Success");
            //             console.log(objInfo);
            //             res.status(200).json({ data: objInfo, filename:pngFileName });
            //         });

            //         setTimeout(()=>{
            //             fs.rmdir(tempDirPath,
            //                 { recursive: true, force: true }
            //                 ,(err)=>{
            //                 if(err){
            //                     console.log("Directory delete from tmp failed: ",err.message);
            //                     return;
            //                 }
            //                 console.log("Directory delete successful",tempDirPath)
            //             })
            //         },1000*1000)

            //     } catch (err) {
            //         console.error('An error occurred:', err);
            //         res.status(500).json({ error: "Conversion failed" });
            //     }
            // }