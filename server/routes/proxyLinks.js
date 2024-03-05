import express from 'express';
const router = express.Router();
const app = express();
import cors from 'cors';
import bodyParser from 'body-parser';
app.use(cors());
app.use(bodyParser.json());
import { minioClient } from '../minioConfig.js';
import { logger, log } from '../logger.js';

router.get('/thumbnail/:url', async function (req, res) {
  try {
    const user = req.params.url;
    let bucketName = 'datadrive-dev';
    const { imageName } = req.query;
    minioClient.getObject(
      bucketName,
      'hv/' + user + '/thumbnail/' + imageName + '.png',
      (err, dataStream) => {
        if (err) {
          log.error('Error getting object from Minio:', err);
          res.status(500).send('Internal Server Error');
          return;
        }

        dataStream.on('error', readErr => {
          log.error('Error reading Minio object:', readErr);
          res.status(500).send('Internal Server Error');
        });

        dataStream.pipe(res);
      },
    );
  } catch (err) {
    log.error(err.message);
    res.send({ err });
  }
});

router.get('/pyramid/:url', async function (req, res) {
  try {
    const user = req.params.url;
    let bucketName = 'datadrive-dev';
    const { baseDir, level, x, y } = req.query;
    minioClient.getObject(
      bucketName,
      `hv/${user}/${baseDir}${level}/${x}_${y}.jpeg`,
      (err, dataStream) => {
        if (err) {
          log.error('Error getting object from Minio:', err);
          res.status(500).send('Internal Server Error');
          return;
        }

        dataStream.on('error', readErr => {
          log.error('Error reading Minio object:', readErr);
          res.status(500).send('Internal Server Error');
        });

        dataStream.pipe(res);
      },
    );
  } catch (err) {
    log.error(err.message);
    res.send({ err });
  }
});

export default router;
