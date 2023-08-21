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

const createNewBucket = async (bucketName,req,res) => {
    minioClient.makeBucket(bucketName,async (err) =>{
        if(err){
            console.error('Error creating bucket:', err);
            res.status(500).json({ error: 'Failed to create bucket' });
        } else{
            const new_bucket = await map_user_to_bucket(req.user.user_email,bucketName)
            console.log('Bucket created successfully.');
        }
    })
}

router.get("/:url",async (req,res) => {
    try{
        let bucketName = await get_user_bucket(req.user.user_email); // get this from database (sql)
        console.log(bucketName)

        if(bucketName == undefined){
            bucketName = req.params.url;
            console.log(bucketName)
        }        
        else if(bucketName != req.params.url)
        {
            res.send({
                error: true,
                message: "BucketName Invalid"
            })
        }
        minioClient.bucketExists(bucketName, async (err, exists) => {
            if(err){
                console.log(err);
                res.send({
                    error: true,
                    message: "Error in Checking if bucket Exists"
                })
            }
            if(exists){
                console.log("Exist");
            }
            else{
                console.log('Creating new Bucket');
                await createNewBucket(bucketName,req,res);
            }
            const objects = [];
            const stream = minioClient.listObjects(bucketName, 'thumbnail', true);
            console.log("stream collected");
            stream.on('data', async (obj) => {
                // await file_format(obj.name.split('.')[0])
                // .then(response => {
                //     objects.push({name: obj.name, format: response});
                // })
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
                var temp = []
                await Promise.all(objects.map(async (name) => {
                    let tname = name.split('/')[1];
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

const handleUpload = async (bucketName,minioPath,filePath,obj) => {
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

const handleAllUpload = async (bucketName,fileName,format) => {
    let obj = {
        total_files: 0,
        curr_count : 0,
        fileName: fileName,
        format: format
    };
    let walker = walk(`temp/${fileName}_files`);
    const minioPath = `${fileName}/`

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

            sem.take(1,() => handleUpload(bucketName,minioPath,filePath,obj))
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
            let filePath  = files.file[0].filepath;
            const bucketName = req.params.url;
            let fileName = files.file[0].originalFilename;
            const parts = fileName.split('.');
            let tempName = parts[0];
            let pngFileName = tempName+'.png';

            await map_file_type(bucketName,tempName,parts[1]);

            // let information =  await execSql(`SELECT * from FileTypeMap;`);

            if(files.file[0].mimetype === 'image/jpeg' || files.file[0].mimetype === 'image/png'){
                minioClient.fPutObject(bucketName,"thumbnail/" +fileName, filePath, async (err, objInfo) => {
                    if(err) {
                        return res.status(400).json({error:"Failed to upload"})
                    }
                    await file_uploaded(bucketName,tempName,parts[1]);
                    console.log("Success")
                    res.status(200).json({data:objInfo, filename:fileName})
                })
            }
            else{
                console.log(tempName);
                exec(`vips dzsave ${filePath} temp/${tempName}`, (error, stdout, stderr) => {
                    if (error) {
                        console.log(`error: ${error.message}`);
                        return;
                    }
                    if (stderr) {
                        console.log(`stderr: ${stderr}`);
                        // return;
                    }
                    console.log(`stdout: ${stdout}`);
                    handleAllUpload(bucketName,tempName,parts[1]);
                });

                let tiffFilePath = filePath;
                let pngFilePath = __dirname+'/../tmp/'+files.file[0].newFilename+'0.png';
                let tempDirPath = path.resolve(__dirname, '../tmp');  
                try {
                    if (!fs.existsSync(tempDirPath)) {
                        fs.mkdirSync(tempDirPath, { recursive: true });
                    }

                    try{
                        await sharp(tiffFilePath).toFile(pngFilePath);
                        console.log('Conversion completed successfully!');
                        await minioClient.fPutObject(bucketName, "thumbnail/"+pngFileName, pngFilePath, function(err, objInfo) {
                            if (err) {
                                return res.status(400).json({ error: "Failed to upload" });
                            }
                            console.log("Success");
                            console.log(objInfo);
                            res.status(200).json({ data: objInfo, filename:pngFileName});
                        });
                     }catch(err){
                        console.log(err);
                        await minioClient.fPutObject(bucketName, "thumbnail/"+pngFileName,__dirname+"../No-Preview-Available.jpg", function(err, objInfo) {
                            if (err) {
                                return res.status(400).json({ error: "Failed to upload" });
                            }
                            console.log("Success");
                            console.log(objInfo);
                            res.status(200).json({ data: objInfo, filename:pngFileName});
                        });
                     }

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
        })
    } catch(err){
        console.log(err.message);
        res.send({err})
    }
});

export default router;