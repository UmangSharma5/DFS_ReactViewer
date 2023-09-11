import express from 'express';
const app = express();
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import require_auth from './middleware/Auth.js';

app.use(cors());
app.use(bodyParser.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'build')));

import objectsRoute from './routes/objects.js';
import getURL from './routes/getURL.js';
import deleteBucket from './routes/deleteBucket.js';
import deleteObject from './routes/deleteObject.js';

app.use('/hv/objects',require_auth,objectsRoute);
app.use('/hv/getURL',require_auth,getURL);
app.use('/hv/deleteBucket',require_auth,deleteBucket);
app.use('/hv/deleteObject',require_auth,deleteObject);

// app.use('/hv/objects',objectsRoute);
// app.use('/hv/getURL',getURL);
// app.use('/hv/deleteBucket',deleteBucket);
// app.use('/hv/deleteObject',deleteObject);


app.get('/*', function (req, res) {
    console.log("here i am")
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

<<<<<<< HEAD
app.listen(5000,function(){
    console.log("Server started on port 5000");
});
=======
app.listen(4000,function(){
    console.log("Server started on port 4000");
});
>>>>>>> 3dce6e6d (Temporary Solution, Needs Changes)
