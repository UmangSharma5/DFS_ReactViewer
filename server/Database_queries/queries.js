import { execSql } from '../db.js';

const map_user_to_bucket = async (user, bucket) => {
  let query = `INSERT INTO User_Bucket VALUES ('${user}','${bucket}');`;
  const res = await execSql(query);

  return res;
};
const get_user_bucket = async user => {
  let query = `SELECT bucket_name FROM User_Bucket where user = '${user}';`;
  return await execSql(query).then(res => res[0]?.bucket_name);
};
// const remove_user_bucket = async (user) => {
//     let query = `DELETE FROM User_Bucket where user = '${user}';`
//     return await execSql(query)
// }
const map_file_type = async (
  user,
  fileId,
  bucketName,
  filename,
  file_type,
  width,
  height,
) => {
  let query = `INSERT INTO FileTypeMap (user_name,file_unique_id, bucket_name, filename, file_type, upload_date, width, height) VALUES ('${user}','${fileId}','${bucketName}','${filename}' ,'${file_type}',NOW(), '${width}', '${height}');`;
  return await execSql(query);
};

const file_stats = async (user, bucketName, filename) => {
  let query = `SELECT file_unique_id, file_type, upload_date, is_uploaded, width, height from FileTypeMap where filename = '${filename}' AND bucket_name = '${bucketName}' AND user_name = '${user}' AND is_uploaded=${1};`;
  return await execSql(query).then(res => {
    return res;
  });
};
const file_uploaded = async (user, fileId) => {
  let query = `UPDATE FileTypeMap SET is_uploaded = ${1}  where file_unique_id = '${fileId}' AND user_name = '${user}';`;
  return await execSql(query).then(res => {
    return res;
  });
};

const delete_file = async (user, bucketName, fileId) => {
  let query = `DELETE FROM FileTypeMap where file_unique_id = '${fileId}' AND bucket_name = '${bucketName}' AND user_name = '${user}';`;
  return await execSql(query).then(res => {
    return res;
  });
};

export {
  map_user_to_bucket,
  get_user_bucket,
  map_file_type,
  file_stats,
  file_uploaded,
  delete_file,
};
