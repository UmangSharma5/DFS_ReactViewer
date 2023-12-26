import express from 'express';
const router = express.Router();
const app = express();
import cors from 'cors';
import bodyParser from 'body-parser';
app.use(cors());
app.use(bodyParser.json());
// import { minioClient } from '../minioConfig.js';
import { file_stats } from '../Database_queries/queries.js';

router.get('/:url', async function (req, res) {
  try {
    const filename = req.query.fileName;
    const response = await file_stats('datadrive-dev', filename.split('.')[0]);
    res.json({ isUploaded: response[0]?.isUploaded });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
export default router;
