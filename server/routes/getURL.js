import express from 'express';
const router = express.Router();
const app = express();
import cors from 'cors';
import bodyParser from "body-parser";
app.use(cors());
app.use(bodyParser.json());
import { minioClient } from '../minioConfig.js';
import fs from "fs";

function createDziFile(imageWidth, imageHeight, tileSize, overlap, levels) {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
    <Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="jpg" Overlap="${overlap}" TileSize="${tileSize}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://schemas.microsoft.com/deepzoom/2008 http://schemas.microsoft.com/deepzoom/2008/dz.xsd">
      <Size Width="${imageWidth}" Height="${imageHeight}" />
      <Tiles>
        ${levels}
      </Tiles>
    </Image>`;
  
    const dziFilePath = './india.dzi'; // Set the path and filename for the .dzi file
  
    fs.writeFileSync(dziFilePath, xmlContent);
  
    console.log(`.dzi file created successfully at: ${dziFilePath}`);
  }
  

router.get("/:url",async function(req,res){
  try {
    const bucketName = "umangsstudentsiiitacin";
    const objects = [];
    const noofFiles = {};
    const lastFileName = {};
    const stream = minioClient.listObjects(bucketName, "test/tmp/india_files/", true); 

    let directoryCount = 0;
    stream.on('data', (obj) => {
      objects.push(obj);
      const fullPath = obj.name;
      const lastSlashIndex = fullPath.lastIndexOf("/");
      const directoryPath = fullPath.substring(0, lastSlashIndex + 1);
      const fileName = fullPath.substring(lastSlashIndex + 1);
      if(directoryPath != 'test/tmp/india_files/'){
        if (!noofFiles[directoryPath]) {
          noofFiles[directoryPath] = 0;
        }
        noofFiles[directoryPath]+=1;
        lastFileName[directoryPath] = fileName;
        if(noofFiles[directoryPath] == 1) directoryCount++;
      }
    });

    stream.on('end', async () => {
      const presignedURLs = [];
      for (const obj of objects) {
        const objectName = obj.name;
        const presignedURL = await minioClient.presignedGetObject(bucketName, objectName, 60 * 60 * 50);
        presignedURLs.push(presignedURL);
      }

      const imageWidth = 5000;
      const imageHeight = 3500;
      const tileSize = 256;
      const overlap = 1;
  
      // Create tile level elements
      let levels = '';
      let count = 0;
  
      for (let level = 0; level < directoryCount; level++) {
        const str =lastFileName[`test/tmp/india_files/${level}/`];
        const parts = str.split("_");
        const row = parts[0];
        const col = parts[1].split(".")[0];
  
        for(let i = 0 ; i<=row ; i++){
          for(let j = 0 ; j<=col ; j++){
            levels += `<Tile Level="${level}" Overlap="${overlap}" Column="${j}" Row="${i}" Source="${presignedURLs[count]}" />\n`;
            count++;
          }
        }
      }  
      createDziFile(imageWidth, imageHeight, tileSize, overlap,levels);

      minioClient.fPutObject(bucketName, "india.dzi", "/home/umang/iHub/DFS_ReactViewer/server/india.dzi",       function(err, objInfo) {
        if(err) {
            res.status(400).json({error:"Failed to upload"})
        }
        console.log("Success")
        // res.status(200).json({data:objInfo, filename:fileName})
      })

      const imageUrl = await minioClient.presignedGetObject(bucketName, "india.dzi", 60*60);
      const imageURL = {image : imageUrl};
      res.json(imageURL);


    });  

  } catch (error) {
    console.error('Error generating presigned URLs:', error);
    throw error;
  }


})

export default router;


/* 
    1. First i need to get preassigned links for the directory 
    2. I need to create a custom .dzi file and have to store in minio 
    3. I need to get preassigned link to that and send in res.json
*/







 // try{
    //     const bucketName = req.params.url;
    //     const {imageName} = req.query;
    //     const imageUrl = await minioClient.presignedGetObject(bucketName, imageName, 60*60);
    //     const imageURL = {image : imageUrl};
    //     res.json(imageURL);
    // }catch(err){
    //     console.log(err.message);
    //     res.send({err})
    // }