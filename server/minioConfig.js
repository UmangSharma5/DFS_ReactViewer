import * as Minio from 'minio';

const minioClient = new Minio.Client({
    endPoint: 'play.min.io',
    port: 9000,
    useSSL: true,
    accessKey: 'Q3AM3UQ867SPQQA43P2F',
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
    // "endPoint":"10.8.0.31",
    // "port":9000,
    // "accessKey":"KKMWIlBF33rP3wwRRKrJ",
    // "secretKey":"yKhmWjmj4bzLFDTNJ1Zp5u6D6nGCC8fxkef8qSIo",
    // useSSL:false,
    // "api":"s3v4",
    // "path":"auto",
    
});


export {
    minioClient
}

// "endPoint":"10.8.0.31",
// "port":9000,
// "accessKey":"KKMWIlBF33rP3wwRRKrJ",
// "secretKey":"yKhmWjmj4bzLFDTNJ1Zp5u6D6nGCC8fxkef8qSIo",
// useSSL:false,
// "api":"s3v4",
// "path":"auto",
