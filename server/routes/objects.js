import express from "express";
const router = express.Router();
const app = express();
import formidable from "formidable";
import cors from 'cors';
import fs from 'fs';
import semaphore from 'semaphore';
import bodyParser from "body-parser";
import {execSql} from '../db.js'
import { exec } from "child_process";
import { walk } from "walk";
import { map_user_to_bucket, get_user_bucket, remove_user_bucket, map_file_type, file_stats,file_uploaded } from '../Database_queries/queries.js'

const sem = semaphore(100)
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

router.get("/:url",async (req,res) => {
    try{
        let user = await get_user_bucket(req.user.user_email); // get this from database (sql)
        console.log(user)
        let bucketName = "datadrive-dev"
        if(user == undefined){
            user = await map_user_to_bucket(req.user.user_email,req.params.url);
            user = await get_user_bucket(req.user.user_email)[0];
            console.log(user)
        }        
        
        minioClient.bucketExists(bucketName, async (err, exists) => {
            if(err){
                console.log(err);
                res.send({
                    error: true,
                    message: "Error in Checking if bucket Exists"
                })
            }
            const objects = [];
            const stream = minioClient.listObjects(bucketName, "hv/"+user+'/thumbnail', true);
            console.log("stream collected");
            stream.on('data', async (obj) => {
                objects.push(obj.name);
            });

            stream.on('error', (err) => {
                console.error('Error listing objects:', err);
                res.status(500).json({ error: 'Failed to list objects' });
            });
        
            // stream.on('end', () => {
            // console.log('Listing objects completed.');
            // console.log(objects);
            // res.json({ objects });
            // });

            stream.on('end', async () => {
                console.log(objects)
                var temp = []
                await Promise.all(objects.map(async (name) => {
                    let tname = name.split('/')[3];
                    await file_stats(bucketName,tname.split('.')[0])
                        .then(response => {
                            if(response[0]?.isUploaded == 1)
                                temp.push({name: tname.split('.')[0], format: response[0]?.file_type});
                        })
                }))
                console.log('Listing objects completed.');
                res.json({ temp });
            });
        })
    } catch(err){
        console.log(err.message);
        res.send({err})
    }
    
});
let count = 0;

const handleUpload = async (bucketName,minioPath,filePath,obj,tempDirPath,fileName) => {
    minioClient.fPutObject(bucketName, minioPath + filePath, filePath, async (err,objInfo) => {
        if (err) {
            console.error("---->",err)
        }else{
            console.log(count++)
            obj.curr_count++;
            console.log("******")
            if(obj.curr_count == obj.total_files)
            {
                await file_uploaded(bucketName,obj.fileName,obj.format);
            }
        }
        sem.leave(1)
    })
}

const handleAllUpload = async (bucketName,user,fileName,format,tempDirPath) => {
    let obj = {
        total_files: 0,
        curr_count : 0,
        fileName: fileName,
        format: format
    };
    let walker = walk(`temp/${fileName}_files`);
    const minioPath = `hv/${user}/${fileName}/`

    walker.on('file',async (root, fileStats, next) => {
        obj.total_files++;
        next()
    })

    walker.on('end', function() {
        console.log('Counted Files')

        walker = walk(`temp/${fileName}_files`);
        let filePath;
        walker.on('file',async (root, fileStats, next) => {
            filePath = root +'/' +fileStats.name;

            sem.take(1,() => handleUpload(bucketName,minioPath,filePath,obj,tempDirPath,fileName))
            next()
        })

        walker.on('end',() => {
            console.log('End Upload')
        })
    })
}

router.post("/:url",async function(req,res){
    try{
        count = 0;
        const form = formidable({ multiples: false });
        form.parse(req, async (err, fields, files) => {
            if (err) {
                res.status(400).json({ error: "Failed to parse form data" });
                return;
            }
            if(files.file != undefined){
                let filePath  = files.file[0].filepath;
                // console.log(files.file);
                console.log(files.file[0]);
                let user = await get_user_bucket(req.user.user_email); // get this from database (sql)
                const bucketName = "datadrive-dev"
                let fileName = files.file[0].originalFilename;
                const parts = fileName.split('.');
                let tempName = parts[0];
                let pngFileName = tempName+'.png';
                let tempDirPath = path.resolve(__dirname, '../temp');
    
                await map_file_type(bucketName,tempName,parts[1]);
    
                if(files.file[0].mimetype === 'image/jpeg' || files.file[0].mimetype === 'image/png'){
                    minioClient.fPutObject(bucketName,"hv/"+user+"/thumbnail/" +fileName, filePath, async (err, objInfo) => {
                        if(err) {
                            return res.status(400).json({error:"Failed to upload"})
                        }
                        await file_uploaded(bucketName,tempName,parts[1]);
                        console.log("Success")
                        res.status(200).json({data:objInfo, filename:tempName,format: parts[1]})
                    })
                }
                else{
                    let isVipsError = 1
                    exec(`vips dzsave ${filePath} temp/${tempName}`, (error, stdout, stderr) => {
                        if (error) {
                            console.log(`error: ${error.message}`);
                            return;
                        }
                        if (stderr) {
                            console.log(`stderr: ${stderr}`);
                            return;
                        }
                        isVipsError = 0
                        res.status(200).json("File has been Uploaded")
                        console.log(`stdout: ${stdout}`);
                        handleAllUpload(bucketName,user,`${tempName}`,parts[1],tempDirPath);
                    });
                    if(isVipsError == 1)
                    {
                        console.log("ok")
                        // return res.status(400).json({error: true, message: "Vips dzsave error"})
                    }
                    let tiffFilePath = filePath;
                    let pngFilePath = __dirname+'/../tmp/'+files.file[0].newFilename+'0.png';
                    let tmpDirPath = path.resolve(__dirname, '../tmp');  
                    try {
                        if (!fs.existsSync(tmpDirPath)) {
                            fs.mkdirSync(tmpDirPath, { recursive: true });
                        }
    
                        try{
                            await sharp(tiffFilePath).toFile(pngFilePath);
                            console.log('Conversion completed successfully!');
                            await minioClient.fPutObject(bucketName, "hv/"+user+"/thumbnail/"+pngFileName, pngFilePath, function(err, objInfo) {
                                if (err) {
                                    return res.status(400).json({ error: "Failed to upload" });
                                }
                                console.log("Success");
                                console.log(objInfo);
                                // res.status(200).json({ data: objInfo, filename:tempName,format: parts[1]});
                            });
                         }catch(err){
                            console.log(err);
                            await minioClient.fPutObject(bucketName, "hv/"+user+"/thumbnail/"+pngFileName,__dirname+"../No-Preview-Available.jpg", function(err, objInfo) {
                                if (err) {
                                    return res.status(400).json({ error: "Failed to upload" });
                                }
                                console.log("Success");
                                console.log(objInfo);
                                res.status(200).json({ data: objInfo, 
                                filename:tempName,format: parts[1]});
                                
                            });
                        }
                        
                        setTimeout(()=>{
                            fs.rmdir(tmpDirPath,
                                { recursive: true, force: true }
                                ,(err)=>{
                                if(err){
                                    console.log("Directory delete from tmp failed: ",err.message);
                                    return;
                                }
                                console.log("Directory delete successful",tmpDirPath)
                            })
                        },1000*1000)
    
                    } catch (err) {
                        console.error('An error occurred:', err);
                        res.status(500).json({ error: "Conversion failed" });
                    }
                }
            }
        })
    } catch(err){
        console.log(err.message);
        res.send({err})
    }
});

export default router;
