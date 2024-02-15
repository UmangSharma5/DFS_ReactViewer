use Histdata;

DROP TABLE IF EXISTS User_Bucket;

CREATE TABLE User_Bucket (
    user varchar(255),
    bucket_name varchar(255),
    PRIMARY KEY (user)
);
DROP TABLE IF EXISTS FileTypeMap;

CREATE TABLE FileTypeMap (    
    user_name varchar(255),
    file_unique_id varchar(36) NOT NULL,
    bucket_name varchar(255),
    filename varchar(255),
    file_type varchar(255),    
    upload_date DATETIME,
    PRIMARY KEY (file_id)
);

CREATE TABLE User_File_SocketMap (    
    user_id varchar(255),
    file_name varchar(255),
    current_socket_id varchar(255),
    current_state varchar(255),
    PRIMARY KEY (user_id)
);

CREATE TABLE User_id_Map (
    user varchar(255),
    user_id varchar(255)
);