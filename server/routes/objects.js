import express from 'express';
const router = express.Router();
const app = express();
import formidable from 'formidable';
import cors from 'cors';
import fs from 'fs';
import semaphore from 'semaphore';
import bodyParser from 'body-parser';
// import {execSql} from '../db.js'
import { exec } from 'child_process';
import { walk } from 'walk';
import {
  map_user_to_bucket,
  get_user_bucket,
  remove_user_bucket,
  map_file_type,
  file_stats,
  file_uploaded,
} from '../Database_queries/queries.js';
import {
  sockets,
  updateSocket,
  removeSocket,
} from '../SocketManager/socketmanager.js';

const sem = semaphore(100);
app.use(cors());
app.use(bodyParser.json());
import { minioClient } from '../minioConfig.js';
import ConvertTiff from 'tiff-to-png';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let convert_tiff_options = {
  logLevel: 1,
};

router.get('/:url', async (req, res) => {
  try {
    let user = await get_user_bucket(req.user.user_email); // get this from database (sql)
    let bucketName = 'datadrive-dev';
    if (user == undefined) {
      user = await map_user_to_bucket(req.user.user_email, req.params.url);
      user = await get_user_bucket(req.user.user_email)[0];
    }

    minioClient.bucketExists(bucketName, async (err, exists) => {
      if (err) {
        console.log(err);
        res.send({
          error: true,
          message: 'Error in Checking if bucket Exists',
        });
      }
      const objects = [];
      console.log(user);
      const stream = minioClient.listObjects(
        bucketName,
        'hv/' + user + '/thumbnail',
        true,
      );
      console.log('stream collected');
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
              // console.log(response);
              if (response[0]?.isUploaded)
                temp.push({
                  name: tname.split('.')[0],
                  format: response[0]?.file_type,
                  date: response[0]?.upload_date,
                });
            });
          }),
        );
        console.log('Listing objects completed.');
        res.json({ temp });
      });
    });
  } catch (err) {
    console.log(err.message);
    res.send({ err });
  }
});
let count = 0;

const handleUpload = async (
  bucketName,
  minioPath,
  filePath,
  obj,
  tempDirPath,
  fileName,
  socketIndex,
) => {
  console.log(sockets, socketIndex);
  let sock = sockets[socketIndex].sock;
  console.log(bucketName + minioPath + filePath);
  minioClient.fPutObject(
    bucketName,
    minioPath + filePath,
    filePath,
    async (err, objInfo) => {
      if (err) {
        console.error('---->', err);
      } else {
        console.log(count++);
        obj.curr_count++;
        if (sock != 0 && obj.curr_count % 10 == 0) {
          console.log('******');
          sock.emit('progress', {
            Title: 'Upload Progress',
            status: 'uploading',
            Data: {
              Total_Files: obj.total_files,
              Uploaded_Files: obj.curr_count,
            },
          });
          // socket.emit('progress',0)
        }
        if (obj.curr_count == obj.total_files) {
          sock.emit('progress', {
            Title: 'Upload Progress',
            status: 'uploaded',
            Data: {
              Total_Files: obj.total_files,
              Uploaded_Files: obj.curr_count,
            },
          });
          sock.disconnect();
          removeSocket(socketIndex);
          await file_uploaded(bucketName, obj.fileName, obj.format);
          fs.rmdir(
            tempDirPath + '/' + fileName + '_files',
            { recursive: true, force: true },
            err => {
              if (err) {
                console.log('Directory delete from temp failed: ', err.message);
                return;
              }
              console.log('Directory delete successful', tempDirPath);
            },
          );
          let dziPath =
            path.resolve(__dirname, '../temp') + '/' + fileName + '.dzi';
          fs.unlinkSync(dziPath);
        }
      }
      // sem.leave(1)
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
  console.log('user--', user);
  let obj = {
    total_files: 0,
    curr_count: 0,
    fileName: fileName,
    format: format,
  };
  let sock = sockets.findIndex(usersock => usersock.token === token);
  let walker = walk(`temp/${fileName}_files`);
  const minioPath = `hv/${user}/${fileName}/`;
  walker.on('file', async (root, fileStats, next) => {
    obj.total_files++;
    next();
  });

  walker.on('end', function () {
    console.log('Counted Files');

    walker = walk(`temp/${fileName}_files`);
    let filePath;
    walker.on('file', async (root, fileStats, next) => {
      filePath = root + '/' + fileStats.name;
      // sem.take(1,() => handleUpload(bucketName,minioPath,filePath,obj,tempDirPath,fileName))
      // console.log(minioPath,filePath)
      handleUpload(
        bucketName,
        minioPath,
        filePath,
        obj,
        tempDirPath,
        fileName,
        sock,
      );
      next();
    });

    walker.on('end', () => {
      console.log('End Upload');
    });
  });
};

router.post('/:url', async function (req, res) {
  try {
    count = 0;
    const form = formidable({
      multiples: false,
      maxTotalFileSize: 2000 * 1024 * 1024,
      maxFileSize: 2000 * 1024 * 1024,
    });
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.log(err);
        res.status(400).json({ error: 'Failed to parse form data' });
        return;
      }
      if (files.file != undefined) {
        let filePath = files.file[0].filepath;
        let user = await get_user_bucket(req.user.user_email); // get this from database (sql)
        const bucketName = 'datadrive-dev';
        let fileName = files.file[0].originalFilename;
        const parts = fileName.split('.');
        let tempName = parts[0];
        let pngFileName = tempName + '.png';
        let tempDirPath = path.resolve(__dirname, '../temp');

        await map_file_type(bucketName, tempName, parts[1]);

        if (
          files.file[0].mimetype === 'image/jpeg' ||
          files.file[0].mimetype === 'image/png'
        ) {
          let sock = sockets.findIndex(
            usersock => usersock.token === req.token,
          );
          sockets[sock].sock.disconnect();
          removeSocket(sock);
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
          let isVipsError = 1;
          exec(
            `vips dzsave ${filePath} temp/${tempName}`,
            (error, stdout, stderr) => {
              if (error) {
                console.log(`error: ${error.message}`);
                return;
              }
              if (stderr) {
                console.log(`stderr: ${stderr}`);
                return;
              }
              isVipsError = 0;
              // res.status(200).json("File has been Uploaded")
              console.log(`stdout: ${stdout}`);
              console.log('email---', req.user.user_email);

              handleAllUpload(
                bucketName,
                user,
                req.token,
                `${tempName}`,
                parts[1],
                tempDirPath,
              );
            },
          );
          if (isVipsError == 1) {
            console.log('ok');
            // return res.status(400).json({error: true, message: "Vips dzsave error"})
          }
          let tiffFilePath = filePath;
          let pngFilePath =
            __dirname + '/../tmp/' + files.file[0].newFilename + '0.png';
          let tmpDirPath = path.resolve(__dirname, '../tmp');
          try {
            if (!fs.existsSync(tmpDirPath)) {
              fs.mkdirSync(tmpDirPath, { recursive: true });
            }

            try {
              await sharp(tiffFilePath).toFile(pngFilePath);
              console.log('Conversion completed successfully!');
              await minioClient.fPutObject(
                bucketName,
                'hv/' + user + '/thumbnail/' + pngFileName,
                pngFilePath,
                function (err, objInfo) {
                  if (err) {
                    return res.status(400).json({ error: 'Failed to upload' });
                  }
                  res
                    .status(200)
                    .json({
                      data: objInfo,
                      filename: tempName,
                      format: parts[1],
                    });
                },
              );
            } catch (err) {
              console.log(err);
              await minioClient.fPutObject(
                bucketName,
                'hv/' + user + '/thumbnail/' + pngFileName,
                __dirname + '../No-Preview-Available.jpg',
                function (err, objInfo) {
                  if (err) {
                    return res.status(400).json({ error: 'Failed to upload' });
                  }
                  res
                    .status(200)
                    .json({
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
                  console.log(
                    'Directory delete from tmp failed: ',
                    err.message,
                  );
                  return;
                }
                console.log('Directory delete successful', tmpDirPath);
              });
            }, 1000 * 1000);
          } catch (err) {
            console.error('An error occurred:', err);
            res.status(500).json({ error: 'Conversion failed' });
          }
        }
      } else {
        console.log('Invalid file');
        console.log('yo');
        console.log('yo');
        console.log('yo');
      }
    });
  } catch (err) {
    console.log(err.message);
    res.send({ err });
  }
});

export default router;
