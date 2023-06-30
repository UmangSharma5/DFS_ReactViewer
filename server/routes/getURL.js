import express from 'express';
const router = express.Router();
const app = express();
import cors from 'cors';
import bodyParser from "body-parser";
app.use(cors());
app.use(bodyParser.json());
import { minioClient } from '../minioConfig.js';

router.get("/:url",async function(req,res){
    try{
        const bucketName = req.params.url;
        const {imageName} = req.query;
        const imageUrl = await minioClient.presignedGetObject(bucketName, imageName, 60*60);
        const imageURL = {image : imageUrl};
        res.json(imageURL);
    }catch(err){
        console.log(err.message);
        res.send({err})
    }
})

export default router;