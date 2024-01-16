import express from 'express';
const router = express.Router();
const app = express();
import formidable from 'formidable';
import cors from 'cors';
import fs from 'fs';
import semaphore from 'semaphore';
import bodyParser from 'body-parser';
// import {execSql} from '../db.js'
import { spawn } from 'child_process';
import { walk } from 'walk';
import {
  map_user_to_bucket,
  get_user_bucket,
  map_file_type,
  file_stats,
  file_uploaded,
} from '../Database_queries/queries.js';
import { sockets, removeSocket } from '../SocketManager/socketmanager.js';

const sem = semaphore(100);
app.use(cors());
app.use(bodyParser.json());
import { minioClient } from '../minioConfig.js';
// import ConvertTiff from 'tiff-to-png';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// let convert_tiff_options = {
//   logLevel: 1,
// };

router.get('/:url', async (req, res) => {
  try {
    let user = await get_user_bucket(req.user.user_email); // get this from database (sql)
    let bucketName = 'datadrive-dev';
    if (user === undefined) {
      user = await map_user_to_bucket(req.user.user_email, req.params.url);
      user = await get_user_bucket(req.user.user_email)[0];
    }

    minioClient.bucketExists(bucketName, async err => {
      if (err) {
        console.error(err);
        res.send({
          error: true,
          message: 'Error in Checking if bucket Exists',
        });
      }
      const objects = [];
      const stream = minioClient.listObjects(
        bucketName,
        'hv/' + user + '/thumbnail',
        true,
      );
      // console.log('stream collected');
      stream.on('data', async obj => {
        objects.push(obj.name);
      });

      stream.on('error', err => {
        console.error('Error listing objects:', err);
        res.status(500).json({ error: 'Failed to list objects' });
      });

      stream.on('end', async () => {
        var temp = [];
        await Promise.all(
          objects.map(async name => {
            let tname = name.split('/')[3];
            await file_stats(bucketName, tname.split('.')[0]).then(response => {
              if (response[0]?.isUploaded)
                temp.push({
                  name: tname.split('.')[0],
                  format: response[0]?.file_type,
                  date: response[0]?.upload_date,
                });
            });
          }),
        );
        // console.error('Listing objects completed.');
        res.json({ temp });
      });
    });
  } catch (err) {
    console.error(err.message);
    res.send({ err });
  }
});

const handleUpload = async (
  bucketName,
  minioPath,
  filePath,
  obj,
  tempDirPath,
  fileName,
  socket_id,
) => {
  let sock = sockets[socket_id];
  minioClient.fPutObject(
    bucketName,
    minioPath + filePath,
    filePath,
    async err => {
      if (err) {
        console.error(err);
      } else {
        obj.curr_count++;
        if (sock !== 0 && obj.curr_count % 10 === 0) {
          sock.emit('progress', {
            Title: 'Upload Progress',
            status: 'uploading',
            Data: {
              Total_Files: obj.total_files,
              Uploaded_Files: obj.curr_count,
            },
          });
        }
        if (obj.curr_count === obj.total_files) {
          sock.emit('progress', {
            Title: 'Upload Progress',
            status: 'uploaded',
            Data: {
              Total_Files: obj.total_files,
              Uploaded_Files: obj.curr_count,
            },
          });
          sock.disconnect();
          removeSocket(socket_id);
          await file_uploaded(bucketName, obj.fileName, obj.format);
          fs.rmdir(
            tempDirPath + '/' + fileName + '_files',
            { recursive: true, force: true },
            err => {
              if (err) {
                console.error(
                  'Directory delete from temp failed: ',
                  err.message,
                );
                return;
              }
            },
          );
          let dziPath =
            path.resolve(__dirname, '../temp') + '/' + fileName + '.dzi';
          fs.unlinkSync(dziPath);
        }
      }
      sem.leave(1);
    },
  );
};

const handleAllUpload = async (
  bucketName,
  user,
  token,
  fileName,
  format,
  tempDirPath,
) => {
  let obj = {
    total_files: 0,
    curr_count: 0,
    fileName: fileName,
    format: format,
  };
  let walker = walk(`temp/${fileName}_files`);
  const minioPath = `hv/${user}/${fileName}/`;
  walker.on('file', async (root, fileStats, next) => {
    obj.total_files++;
    next();
  });

  walker.on('end', function () {
    walker = walk(`temp/${fileName}_files`);
    let filePath;
    walker.on('file', async (root, fileStats, next) => {
      filePath = root + '/' + fileStats.name;
      try {
        await new Promise(resolve => {
          sem.take(1, () =>
            resolve(
              handleUpload(
                bucketName,
                minioPath,
                filePath,
                obj,
                tempDirPath,
                fileName,
                token,
              ),
            ),
          );
        });
      } catch (error) {
        // Handle any errors that occurred during handleUpload
        console.error('Error during handleUpload:', error);
      }
      next();
    });

    walker.on('end', () => {
      //   console.error('End Upload');
    });
  });
};

router.post('/:url', async function (req, res) {
  try {
    // count = 0;
    const form = formidable({
      multiples: false,
      maxTotalFileSize: 2000 * 1024 * 1024,
      maxFileSize: 2000 * 1024 * 1024,
    });
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error(err);
        res.status(400).json({ error: 'Failed to parse form data' });
        return;
      }
      if (files.file) {
        let filePath = files.file[0].filepath;
        let user = await get_user_bucket(req.user.user_email); // get this from database (sql)
        const bucketName = 'datadrive-dev';
        let fileName = files.file[0].originalFilename;
        const parts = fileName.split('.');
        let tempName = parts[0];
        let inProgress = req.query.inProgress;
        let socket_id = req.query.socket_id;
        let pngFileName = tempName + '.png';
        let tempDirPath = path.resolve(__dirname, '../temp');

        await map_file_type(bucketName, tempName, parts[1]);

        if (
          files.file[0].mimetype === 'image/jpeg' ||
          files.file[0].mimetype === 'image/png'
        ) {
          sockets[socket_id].disconnect();
          removeSocket(socket_id);
          minioClient.fPutObject(
            bucketName,
            'hv/' + user + '/thumbnail/' + fileName,
            filePath,
            async (err, objInfo) => {
              if (err) {
                return res.status(400).json({ error: 'Failed to upload' });
              }
              await file_uploaded(bucketName, tempName, parts[1]);
              res
                .status(200)
                .json({ data: objInfo, filename: tempName, format: parts[1] });
            },
          );
        } else {
          const command = `vips`;
          const args = [
            'dzsave',
            filePath,
            `./temp/${tempName}`,
            '--vips-progress',
            // "--tile-size",
            // "8192"
            // "--depth",
            // "onetile",
            // "--overlap=1",
          ]; // Add any arguments your command requires

          const childProcess = spawn(command, args);

          childProcess.stdout.on('data', data => {
            // Handle standard output data
            let sock = sockets[socket_id];

            const percentageRegex = /[\d.]+%/g;
            const matches = String(data).match(percentageRegex);
            let lastPercentageValue;
            if (matches && matches.length) {
              lastPercentageValue = parseInt(matches[matches.length - 1]);
            }

            const isCompleted = String(data).toLowerCase().includes('done');
            if (isCompleted) lastPercentageValue = 100;

            if (
              lastPercentageValue &&
              !isNaN(lastPercentageValue) &&
              lastPercentageValue >= 0 &&
              lastPercentageValue <= 100
            ) {
              sock.emit('dzsave-progress', {
                progress: lastPercentageValue,
              });
            }
          });

          childProcess.stderr.on('data', data => {
            // Handle error output data
            console.error(`stderr: ${data}`);
          });

          childProcess.on('close', async () => {
            // console.error(`stdout: ${code}`);
            handleAllUpload(
              bucketName,
              user,
              socket_id,
              `${tempName}`,
              parts[1],
              tempDirPath,
            );
            let tiffFilePath = filePath;
            let pngFilePath =
              __dirname + '/../tmp/' + files.file[0].newFilename + '0.png';
            let tmpDirPath = path.resolve(__dirname, '../tmp');
            try {
              if (!fs.existsSync(tmpDirPath)) {
                fs.mkdirSync(tmpDirPath, { recursive: true });
              }

              const targetWidth = 500;
              const targetHeight = 400;

              try {
                await sharp(tiffFilePath)
                  .resize(targetWidth, targetHeight)
                  .toFile(pngFilePath);
                // console.error("Conversion completed successfully!");
                await minioClient.fPutObject(
                  bucketName,
                  'hv/' + user + '/thumbnail/' + pngFileName,
                  pngFilePath,
                  function (err, objInfo) {
                    if (err) {
                      return res
                        .status(400)
                        .json({ error: 'Failed to upload' });
                    }
                    res.status(200).json({
                      data: objInfo,
                      filename: tempName,
                      format: parts[1],
                    });
                  },
                );
              } catch (err) {
                // console.error("sharp error->", err);
                await minioClient.fPutObject(
                  bucketName,
                  'hv/' + user + '/thumbnail/' + pngFileName,
                  __dirname + '/../No-Preview-Available.jpg',
                  function (err, objInfo) {
                    if (err) {
                      console.error(err);
                      return res
                        .status(400)
                        .json({ error: 'Failed to upload' });
                    }
                    // console.error("no preview upload");
                    res.status(200).json({
                      data: objInfo,
                      filename: tempName,
                      format: parts[1],
                    });
                  },
                );
              }

              setTimeout(() => {
                fs.rmdir(tmpDirPath, { recursive: true, force: true }, err => {
                  if (err) {
                    console.error(
                      'Directory delete from tmp failed: ',
                      err.message,
                    );
                    return;
                  }
                  // console.error("Directory delete successful", tmpDirPath);
                });
              }, 1000 * 1000);
            } catch (err) {
              console.error('An error occurred:', err);
              res.status(500).json({ error: 'Conversion failed' });
            }
          });

          childProcess.on('error', err => {
            // Handle process error event
            console.error(`Error occurred: ${err.message}`);
          });
        }
      } else {
        console.error('Invalid file');
      }
    });
  } catch (err) {
    console.error(err.message);
    res.send({ err });
  }
});

export default router;
