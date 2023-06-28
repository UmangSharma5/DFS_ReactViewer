import express from 'express';
const app = express();
import cors from 'cors';
import bodyParser from 'body-parser';
app.use(cors());
app.use(bodyParser.json());

// const objectsRoute = require("./routes/objects");
// const getURL = require("./routes/getURL");
import objectsRoute from './routes/objects.js';
import getURL from './routes/getURL.js';

// import objectsRoute from "./routes/objects";
// import getURL from "./routes/getURL";

app.use('/objects',objectsRoute);
app.use('/getURL',getURL);


app.listen(5000,function(){
    console.log("Server started on port 5000");
});