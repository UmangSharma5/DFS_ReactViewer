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

const map_file_type = async (user, fileId, bucketName, filename, file_type) => {
  let query = `INSERT INTO FileTypeMap (user_name,file_unique_id, bucket_name, filename, file_type, upload_date) VALUES ('${user}','${fileId}','${bucketName}','${filename}' ,'${file_type}',NOW());`;
  return await execSql(query);
};

const file_stats = async (user, bucketName, filename) => {
  let query = `SELECT file_unique_id, file_type, upload_date, is_uploaded from FileTypeMap where filename = '${filename}' AND bucket_name = '${bucketName}' AND user_name = '${user}' AND is_uploaded=${1};`;
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

const delete_file = async (user, fileId) => {
  let query = `DELETE FROM FileTypeMap where file_unique_id = '${fileId}' AND user_name = '${user}';`;
  return await execSql(query).then(res => {
    return res;
  });
};

const add_user = async (user, userid) => {
  let query = `INSERT INTO User_id_Map (user, user_id) VALUES ('${user}', '${userid}');`;
  const res = await execSql(query);
  return res;
};

const check_user = async user => {
  let query = `SELECT user_id from User_id_Map where user = '${user}';`;
  try {
    const res = await execSql(query);
    return res;
  } catch (error) {
    throw error;
  }
};

const get_userid = async user => {
  let query = `SELECT user_id from User_id_Map where user = '${user}';`;
  return await execSql(query).then(res => {
    return res;
  });
};

const add_user_socket = async (user, fileId, socketid, state) => {
  let query = `INSERT INTO User_File_SocketMap (user_name, file_unique_id, current_socket_id, current_state) VALUES ('${user}', '${fileId}', '${socketid}', '${state}');`;
  const res = await execSql(query);
  return res;
};

const check_user_socket = async (user, fileId) => {
  let query = `SELECT current_socket_id from User_File_SocketMap where user_name = '${user}' AND file_unique_id = '${fileId}';`;
  return await execSql(query).then(res => {
    return res;
  });
};

const update_user_socket = async (user, filename, socketid, state) => {
  let query = `UPDATE User_File_SocketMap set current_socket_id = '${socketid}' AND current_state = '${state}' where user_name = '${user}' AND file_unique_id = '${fileId}';`;
  return await execSql(query).then(res => {
    return res;
  });
};

const delete_user_socket = async (user, fileId) => {
  let query = `DELETE FROM User_File_SocketMap WHERE user_name = '${user}' AND file_unique_id = '${fileId}';`;
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
  add_user_socket,
  add_user,
  check_user,
  get_userid,
  check_user_socket,
  update_user_socket,
  delete_user_socket,
};
