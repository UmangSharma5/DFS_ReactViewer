import * as Minio from 'minio';

const minioClient = new Minio.Client({
    endPoint: 'play.min.io',
    port: 9000,
    useSSL: true,
    accessKey: 'Q3AM3UQ867SPQQA43P2F',
    secretKey: 'zuf+tfteSlswRu7BJ86wekitnifILbZam1KYY3TG'
});


export {
    minioClient
}
// {
//     "endPoint":"10.8.0.31",
//     "port":9000,
//     "accessKey":"lp9e4GQ11hDP902uf0FD",
//     "secretKey":"Fs0qRm3vVoH936DN9DFoKbYx37zJJW6iqEp77job",
//     useSSL:false,
//     "api":"s3v1",
//     "path":"auto",
// }
